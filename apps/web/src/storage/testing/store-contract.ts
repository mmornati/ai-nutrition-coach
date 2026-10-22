// The store contract suite (port of the earlier client and
// its cascade / stream / key-value tests).
//
// It is run against EVERY implementation: the real encrypted store (the production SQL engine and
// cipher, in-process in Vitest and through the real worker on OPFS in the Playwright harness) and
// the in-memory reference, so a fake can never drift from the behaviour of the real adapter:
// persisted food_group, millisecond timestamps, half-open `[from, to)` bounds, newest-first
// ordering, typed (never thrown) results, the atomic delete cascade.
//
// It imports no test framework: each case is a plain async function that throws on failure, so the
// same cases run under Vitest and inside the browser harness page.

import {
  canonicalText,
  coachNoteDismissalKey,
  formatHlc,
  isUuid,
  MAX_DRIFT_MS,
  parseVaultSnapshot,
  openPlateDismissalKey,
  addCalendarDays,
  type CoachNote,
  type CoachNoteStore,
  type EncryptedStore,
  type FoodEntryDraft,
  type FoodGroup,
  type PlateLog,
  type SavedStore,
  type SourceCatalog,
  type VaultSnapshot,
  type VaultStore,
} from '@anc/core';
import { KeyValueStoreLocked, type KeyValueStore } from '../key-value-store';
import { mergeSnapshots, randomVaultSnapshot, seeded, uuid } from './vault-random';

export interface ContractSubject {
  readonly store: EncryptedStore;
  readonly notes: CoachNoteStore;
  readonly saved: SavedStore;
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  /**
   * A second, empty store of the same kind (restore targets). Absent where only one store exists
   * (the browser harness), where the cases marked `needsFresh` are reported as skipped.
   */
  fresh?(): Promise<ContractSubject>;
  /** Lock the store (drop the database); the same ports must then answer typed "locked" results. */
  lock(): Promise<void>;
  dispose(): Promise<void>;
}

export interface ContractCase {
  readonly name: string;
  /** Needs `subject.fresh`: a runner without a second store reports the case as skipped, loudly. */
  readonly needsFresh?: true;
  run(subject: ContractSubject): Promise<void>;
}

export class ContractFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractFailure';
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractFailure(message);
}

function same(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new ContractFailure(`${message}: expected ${e}, got ${a}`);
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new ContractFailure(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function draft(
  name: string,
  options: {
    group?: FoodGroup;
    source?: SourceCatalog;
    low?: number;
    high?: number;
    unit?: string;
    label?: string;
  } = {},
): FoodEntryDraft {
  return {
    databaseFood: {
      sourceRef: `manual:${name.toLowerCase()}`,
      displayName: name,
      source: options.source ?? 'manual',
      foodGroup: options.group ?? 'other',
    },
    quantity: {
      low: options.low ?? 1,
      high: options.high ?? 2,
      unit: options.unit ?? 'piece',
      displayLabel: options.label ?? '~1-2 pieces',
    },
  };
}

/** A starch ingredient with a weight and per-100 g nutrients, as a recipe needs. */
const weighed = (name: string, grams: number): FoodEntryDraft => ({
  databaseFood: {
    sourceRef: `seed:${name}`,
    displayName: name,
    source: 'seed',
    foodGroup: 'starch',
    nutrientsPer100g: { energyKcal: 130, protein: 2.7 },
  },
  quantity: { low: grams, high: grams, unit: 'g', displayLabel: `${grams} g`, grams },
});
const weighedOne = (): FoodEntryDraft => weighed('Rice', 100);

async function record(
  store: EncryptedStore,
  entries: FoodEntryDraft[],
  at: number,
): Promise<PlateLog> {
  const result = await store.recordPlate({ entries, loggedAtUtc: at });
  if (result.kind !== 'recordPlateSuccess') {
    throw new ContractFailure(`recordPlate failed: ${JSON.stringify(result)}`);
  }
  return result.plateLog;
}

async function read(
  store: EncryptedStore,
  range: { from?: number; to?: number } = {},
): Promise<readonly PlateLog[]> {
  const result = await store.readRange(range);
  if (result.kind !== 'platesRead') {
    throw new ContractFailure(`readRange failed: ${JSON.stringify(result.failure)}`);
  }
  return result.plates;
}

async function snapshotOf(vault: VaultStore): Promise<VaultSnapshot> {
  const result = await vault.readSnapshot();
  if (result.kind !== 'vault') {
    throw new ContractFailure(`readSnapshot failed: ${JSON.stringify(result)}`);
  }
  return result.value;
}

const T0 = Date.UTC(2026, 7, 16, 12);
const HOUR = 3_600_000;
const MINUTE = 60_000;

function note(plate: number, key: string, anchor: CoachNote['anchor'] = 'postResolve'): CoachNote {
  return {
    id: 0,
    plateLogId: plate,
    anchor,
    questionKey: key,
    text: `text for ${key}`,
    generatedAt: Date.UTC(2026, 7, 16, 12, 0, 0, 5),
  };
}

async function appended(notes: CoachNoteStore, n: CoachNote): Promise<CoachNote> {
  const result = await notes.append(n);
  if (result.kind !== 'coachNoteAppended') throw new ContractFailure('append failed');
  return result.note;
}

/** Collects what a watcher emits. */
function collect<T>() {
  const values: T[] = [];
  const errors: unknown[] = [];
  return {
    values,
    errors,
    observer: {
      next: (v: T) => void values.push(v),
      error: (f: unknown) => void errors.push(f),
    },
  };
}

export const storeContractCases: readonly ContractCase[] = [
  // ── EncryptedStore ──────────────────────────────────────────────────────────────────────────
  {
    name: 'assigns positive, distinct ids; entries point at their plate',
    async run({ store }) {
      const a = await record(store, [draft('Apple'), draft('Pear')], T0);
      const b = await record(store, [draft('Plum')], T0 + MINUTE);
      assert(a.id > 0, 'plate id is positive');
      assert(b.id !== a.id, 'plate ids are distinct');
      assert(a.entries.length === 2, 'two entries');
      assert(
        a.entries.every((e) => e.plateLogId === a.id),
        'entries point at their plate',
      );
      assert(new Set(a.entries.map((e) => e.id)).size === 2, 'entry ids are distinct');
      assert(
        a.entries.every((e) => e.id > 0),
        'entry ids are positive',
      );
    },
  },
  {
    name: 'round-trips every field, including food_group and fractions',
    async run({ store }) {
      const committed = await record(
        store,
        [
          draft('Salmon', {
            group: 'protein',
            low: 0.5,
            high: 1.5,
            unit: 'fillet',
            label: '~half to 1.5 fillets',
          }),
          draft('Spinach', { group: 'vegFruit', low: 2, high: 2 }),
          draft('Seed', { source: 'seed', group: 'dairy' }),
        ],
        T0,
      );
      for (const plate of [committed, ...(await read(store))]) {
        const e = plate.entries;
        assert(e.length === 3, 'insertion order, all entries');
        assert(e[0]?.databaseFood.displayName === 'Salmon', 'first is Salmon');
        assert(e[0]?.databaseFood.sourceRef === 'manual:salmon', 'sourceRef verbatim');
        assert(e[0]?.databaseFood.source === 'manual', 'source');
        assert(e[0]?.databaseFood.foodGroup === 'protein', 'food group persisted');
        assert(e[0]?.quantity.low === 0.5 && e[0]?.quantity.high === 1.5, 'fractions verbatim');
        assert(e[0]?.quantity.unit === 'fillet', 'unit');
        assert(e[0]?.quantity.displayLabel === '~half to 1.5 fillets', 'label');
        assert(e[1]?.databaseFood.foodGroup === 'vegFruit', 'second group');
        assert(e[2]?.databaseFood.source === 'seed', 'seed source round-trips');
        assert(e[2]?.databaseFood.foodGroup === 'dairy', 'dairy group round-trips');
      }
    },
  },
  {
    name: 'sourceRef is stored byte-for-byte',
    async run({ store }) {
      const odd = '  OFF:0123456789012 é́\n"quoted" \u{1F34E}';
      const plate = await record(
        store,
        [{ ...draft('Odd'), databaseFood: { ...draft('Odd').databaseFood, sourceRef: odd } }],
        T0,
      );
      assert(plate.entries[0]?.databaseFood.sourceRef === odd, 'committed');
      const reread = (await read(store))[0];
      assert(reread?.entries[0]?.databaseFood.sourceRef === odd, 're-read');
    },
  },
  {
    name: 'timestamps keep millisecond precision (UTC instants)',
    async run({ store }) {
      const committed = await record(store, [draft('Apple')], T0 + 123.456);
      assert(committed.loggedAtUtc === T0 + 123, 'sub-millisecond part is truncated');
      const reread = (await read(store))[0];
      assert(reread?.loggedAtUtc === T0 + 123, 're-read equals committed');
    },
  },
  {
    name: 'readRange is half-open [from, to) and newest first',
    async run({ store }) {
      const early = await record(store, [draft('Early')], T0);
      const mid = await record(store, [draft('Mid')], T0 + HOUR);
      const late = await record(store, [draft('Late')], T0 + 2 * HOUR);
      same(
        (await read(store, { from: early.loggedAtUtc, to: late.loggedAtUtc })).map((p) => p.id),
        [mid.id, early.id],
        'from inclusive, to exclusive, newest first',
      );
      same(
        (await read(store)).map((p) => p.id),
        [late.id, mid.id, early.id],
        'unbounded',
      );
      same(
        (await read(store, { from: mid.loggedAtUtc })).map((p) => p.id),
        [late.id, mid.id],
        'open upper bound',
      );
      same(
        (await read(store, { to: mid.loggedAtUtc })).map((p) => p.id),
        [early.id],
        'open lower bound',
      );
      same(
        await read(store, { from: late.loggedAtUtc, to: early.loggedAtUtc }),
        [],
        'an inverted range is empty, not an error',
      );
    },
  },
  {
    name: 'two plates in the same millisecond keep a stable newest-first order',
    async run({ store }) {
      const a = await record(store, [draft('A')], T0);
      const b = await record(store, [draft('B')], T0);
      same(
        (await read(store)).map((p) => p.id),
        [b.id, a.id],
        'later insert first',
      );
    },
  },
  {
    name: 'readRange over an empty store is an empty list, not a failure',
    async run({ store }) {
      same(await read(store), [], 'empty');
    },
  },
  {
    name: 'a plate day-boundary instant lands in exactly one of two adjacent ranges',
    async run({ store }) {
      const boundary = Date.UTC(2026, 7, 17);
      const justBefore = await record(store, [draft('Before')], boundary - 1);
      const on = await record(store, [draft('On')], boundary);
      same(
        (await read(store, { from: boundary - 86_400_000, to: boundary })).map((p) => p.id),
        [justBefore.id],
        'previous day',
      );
      same(
        (await read(store, { from: boundary, to: boundary + 86_400_000 })).map((p) => p.id),
        [on.id],
        'next day',
      );
    },
  },
  {
    name: 'watchRange emits the current snapshot, then one per change, range-bound',
    async run({ store }) {
      const from = Date.UTC(2026, 7, 16);
      const to = Date.UTC(2026, 7, 17);
      await record(store, [draft('Before')], Date.UTC(2026, 7, 15, 23, 59));
      await record(store, [draft('Seed')], Date.UTC(2026, 7, 16, 10));
      const seen = collect<readonly PlateLog[]>();
      const stop = store.watchRange({ from, to }, seen.observer);
      try {
        await until(() => seen.values.length > 0, 'the first snapshot');
        same(
          seen.values[0]?.map((p) => p.entries[0]?.databaseFood.displayName),
          ['Seed'],
          'first emission is the current state, bounded to the range',
        );
        const added = await record(store, [draft('Added')], Date.UTC(2026, 7, 16, 11));
        await until(
          () => seen.values.at(-1)?.some((p) => p.id === added.id) === true,
          'the change',
        );
        const last = seen.values.at(-1);
        assert(last?.[0]?.id === added.id, 'newest first');
        assert(
          !last?.some((p) => p.entries[0]?.databaseFood.displayName === 'Before'),
          'out-of-range plate is not emitted',
        );
        same(await read(store, { from, to }), last, 'the watch and the one-shot read agree');
        assert(Object.isFrozen(last), 'emitted snapshots are immutable');
        assert(Object.isFrozen(last?.[0]?.entries), 'entry lists are immutable too');
        same(seen.errors, [], 'no errors');
      } finally {
        stop();
      }
    },
  },
  {
    name: 'an unsubscribed watcher stops emitting',
    async run({ store }) {
      const seen = collect<readonly PlateLog[]>();
      const stop = store.watchRange({ from: T0 - HOUR, to: T0 + HOUR }, seen.observer);
      await until(() => seen.values.length > 0, 'the first snapshot');
      stop();
      stop(); // safe to call twice
      const before = seen.values.length;
      await record(store, [draft('After')], T0);
      await sleep(50);
      assert(seen.values.length === before, 'nothing after unsubscribe');
    },
  },
  {
    name: 'deletePlate removes that plate and its entries only',
    async run({ store }) {
      const a = await record(store, [draft('Apple'), draft('Pear')], T0);
      const b = await record(store, [draft('Plum')], T0 + MINUTE);
      assert((await store.deletePlate(a.id)).kind === 'plateDeleted', 'deleted');
      const left = await read(store);
      same(
        left.map((p) => p.id),
        [b.id],
        'only b is left',
      );
      assert(left[0]?.entries[0]?.databaseFood.displayName === 'Plum', 'with its entry');
    },
  },
  {
    name: 'deletePlate is idempotent and an unknown id succeeds',
    async run({ store }) {
      const a = await record(store, [draft('Apple')], T0);
      assert((await store.deletePlate(a.id)).kind === 'plateDeleted', 'first');
      assert((await store.deletePlate(a.id)).kind === 'plateDeleted', 'again');
      assert((await store.deletePlate(987654)).kind === 'plateDeleted', 'unknown id');
      same(await read(store), [], 'empty');
    },
  },
  {
    name: 'deletePlate re-emits a snapshot without the plate',
    async run({ store }) {
      const a = await record(store, [draft('Apple')], T0);
      const b = await record(store, [draft('Plum')], T0 + MINUTE);
      const seen = collect<readonly PlateLog[]>();
      const stop = store.watchRange({ from: T0, to: T0 + HOUR }, seen.observer);
      try {
        await until(() => seen.values.length > 0, 'the first snapshot');
        same(
          seen.values[0]?.map((p) => p.id),
          [b.id, a.id],
          'both plates',
        );
        await store.deletePlate(a.id);
        await until(() => seen.values.at(-1)?.length === 1, 'the re-emission');
        assert(seen.values.at(-1)?.[0]?.id === b.id, 'b remains');
      } finally {
        stop();
      }
    },
  },
  {
    name: 'deletePlate cascades through the port alone: notes, interactions and dismissals',
    async run({ store, notes }) {
      const first = await record(store, [draft('Apple')], T0);
      const second = await record(store, [draft('Pear')], T0 + MINUTE);
      const na = await appended(notes, note(first.id, 'a'));
      const nb = await appended(notes, note(second.id, 'b'));
      await notes.recordInteraction({ noteId: na.id, kind: 'dismiss', at: T0 });
      await notes.recordDismissal(coachNoteDismissalKey(na.id));
      await notes.recordDismissal(coachNoteDismissalKey(nb.id));
      await notes.recordDismissal('unrelated-key');

      assert((await store.deletePlate(first.id)).kind === 'plateDeleted', 'deleted');

      same(await notes.forPlate(first.id), [], 'the deleted plate has no notes');
      assert((await notes.forPlate(second.id)).length === 1, 'the other plate keeps its note');
      const dismissals = collect<ReadonlySet<string>>();
      const stop = notes.watchDismissals(dismissals.observer);
      try {
        await until(() => dismissals.values.length > 0, 'dismissals');
        same(
          [...(dismissals.values.at(-1) ?? [])].sort(),
          [coachNoteDismissalKey(nb.id), 'unrelated-key'].sort(),
          'only the deleted plate note dismissal went',
        );
      } finally {
        stop();
      }
    },
  },
  {
    name: 'validation: an empty plate and an invalid quantity are typed failures, nothing is written',
    async run({ store }) {
      const empty = await store.recordPlate({ entries: [], loggedAtUtc: T0 });
      assert(empty.kind === 'storeFailure' && empty.reason === 'emptyPlate', 'emptyPlate');
      for (const [low, high] of [
        [2, 1],
        [-1, 1],
        [Number.NaN, 1],
        [0, Number.POSITIVE_INFINITY],
      ] as const) {
        const bad = await store.recordPlate({
          entries: [draft('Bad', { low, high })],
          loggedAtUtc: T0,
        });
        assert(
          bad.kind === 'storeFailure' && bad.reason === 'invalidQuantity',
          `invalidQuantity for ${low}..${high}`,
        );
      }
      same(await read(store), [], 'nothing was written');
    },
  },
  {
    name: 'locked: writes answer a typed failure, reads fail typed, watchers emit nothing',
    async run({ store, notes, saved, kv, lock }) {
      await record(store, [draft('Kept')], T0);
      const seen = collect<readonly PlateLog[]>();
      await lock();
      const result = await store.recordPlate({ entries: [draft('x')], loggedAtUtc: T0 });
      assert(
        result.kind === 'storeFailure' && result.reason === 'webSessionKey',
        'recordPlate is a webSessionKey failure',
      );
      const readResult = await store.readRange();
      assert(readResult.kind === 'platesReadFailed', 'readRange is a typed failure');
      assert((await store.deletePlate(1)).kind === 'plateDeleteFailed', 'deletePlate is typed');
      const stop = store.watchRange({ from: T0 - HOUR, to: T0 + HOUR }, seen.observer);
      await sleep(60);
      stop();
      same(seen.values, [], 'a locked store emits nothing');
      same(seen.errors, [], 'and no error');

      const appendResult = await notes.append(note(1, 'k'));
      assert(appendResult.kind === 'coachNoteAppendFailure', 'append is a typed failure');
      same(await notes.forPlate(1), [], 'a locked store reads as no notes');
      assert((await notes.recordDismissal('k')).kind === 'coachInteractionFailed', 'dismissal');
      assert(
        (await notes.recordInteraction({ noteId: 1, kind: 'sure', at: T0 })).kind ===
          'coachInteractionFailed',
        'interaction',
      );
      assert((await notes.deleteForPlate(1)).kind === 'plateDeleteFailed', 'deleteForPlate');
      for (const result of [
        await saved.listMeals(),
        await saved.saveMeal({ name: 'x', entries: [draft('x')] }),
        await saved.renameMeal(1, 'y'),
        await saved.deleteMeal(1),
        await saved.listRecipes(),
        await saved.deleteRecipe(1),
      ]) {
        assert(
          result.kind === 'savedFailed' && result.reason === 'locked',
          'saved meals and recipes answer a typed locked failure',
        );
      }
      assert((await kv.read('ai.settings')) === null, 'kv reads null while locked');
      let thrown: unknown;
      try {
        await kv.write('ai.settings', '{}');
      } catch (error) {
        thrown = error;
      }
      assert(thrown instanceof KeyValueStoreLocked, 'kv write throws KeyValueStoreLocked');
    },
  },
  {
    name: 'close is idempotent',
    async run({ store }) {
      await store.close();
      await store.close();
    },
  },

  // ── CoachNoteStore ──────────────────────────────────────────────────────────────────────────
  {
    name: 'notes: append assigns increasing positive ids and round-trips fields',
    async run({ notes }) {
      const na = await appended(notes, note(7, 'k1', 'openPlate'));
      const nb = await appended(notes, note(7, 'k2'));
      assert(na.id > 0 && nb.id > na.id, 'increasing ids');
      const reread = await notes.forPlate(7);
      same(
        reread.map((n) => n.id),
        [na.id, nb.id],
        'insertion order',
      );
      const first = reread[0];
      assert(first?.anchor === 'openPlate', 'anchor');
      assert(first.questionKey === 'k1' && first.text === 'text for k1', 'key and text');
      assert(first.plateLogId === 7, 'plate');
      assert(first.generatedAt === Date.UTC(2026, 7, 16, 12, 0, 0, 5), 'instant');
    },
  },
  {
    name: 'notes: forPlate is empty for an unknown plate and isolates plates',
    async run({ notes }) {
      await appended(notes, note(1, 'a'));
      await appended(notes, note(2, 'b'));
      same(await notes.forPlate(404), [], 'unknown plate');
      assert((await notes.forPlate(1))[0]?.questionKey === 'a', 'plate 1');
      assert((await notes.forPlate(2))[0]?.questionKey === 'b', 'plate 2');
    },
  },
  {
    name: 'notes: watchForPlate emits the empty list, then a note appended AFTER subscribing',
    async run({ notes }) {
      const seen = collect<readonly CoachNote[]>();
      const stop = notes.watchForPlate(3, seen.observer);
      try {
        await until(() => seen.values.length > 0, 'the first emission');
        same(seen.values.at(-1), [], 'empty first');
        await appended(notes, note(3, 'late'));
        await until(() => (seen.values.at(-1)?.length ?? 0) > 0, 'the appended note');
        assert(seen.values.at(-1)?.[0]?.questionKey === 'late', 'the note');
        const count = seen.values.length;
        await appended(notes, note(4, 'other-plate'));
        await sleep(60);
        assert(seen.values.at(-1)?.length === 1, 'a note for another plate does not leak in');
        assert(seen.values.length >= count, 'no regression');
      } finally {
        stop();
      }
    },
  },
  {
    name: 'notes: recordDismissal is idempotent and watched',
    async run({ notes }) {
      const seen = collect<ReadonlySet<string>>();
      const stop = notes.watchDismissals(seen.observer);
      try {
        await until(() => seen.values.length > 0, 'the first emission');
        assert(seen.values[0]?.size === 0, 'empty first');
        assert((await notes.recordDismissal('k')).kind === 'coachInteractionRecorded', 'first');
        assert((await notes.recordDismissal('k')).kind === 'coachInteractionRecorded', 'again');
        await until(() => seen.values.at(-1)?.has('k') === true, 'the dismissal');
        same([...(seen.values.at(-1) ?? [])], ['k'], 'one marker');
      } finally {
        stop();
      }
    },
  },
  {
    name: "notes: deleteForPlate removes that plate's notes and note dismissals only",
    async run({ notes }) {
      const a = await appended(notes, note(5, 'a'));
      const b = await appended(notes, note(6, 'b'));
      await notes.recordInteraction({ noteId: a.id, kind: 'dismiss', at: T0 });
      await notes.recordDismissal(coachNoteDismissalKey(a.id));
      await notes.recordDismissal(coachNoteDismissalKey(b.id));
      await notes.recordDismissal('unrelated-key');
      assert((await notes.deleteForPlate(5)).kind === 'plateDeleted', 'deleted');
      same(await notes.forPlate(5), [], 'plate 5 notes gone');
      assert((await notes.forPlate(6))[0]?.id === b.id, 'plate 6 kept');
      const seen = collect<ReadonlySet<string>>();
      const stop = notes.watchDismissals(seen.observer);
      try {
        await until(() => seen.values.length > 0, 'dismissals');
        same(
          [...(seen.values.at(-1) ?? [])].sort(),
          [coachNoteDismissalKey(b.id), 'unrelated-key'].sort(),
          'dismissals',
        );
      } finally {
        stop();
      }
    },
  },
  {
    name: 'notes: deleteForPlate is idempotent and an unknown plate succeeds',
    async run({ notes }) {
      await appended(notes, note(5, 'a'));
      assert((await notes.deleteForPlate(5)).kind === 'plateDeleted', 'first');
      assert((await notes.deleteForPlate(5)).kind === 'plateDeleted', 'again');
      assert((await notes.deleteForPlate(404)).kind === 'plateDeleted', 'unknown');
    },
  },
  {
    name: 'notes: recordInteraction returns a typed Recorded result for every kind',
    async run({ notes }) {
      const n = await appended(notes, note(1, 'a'));
      for (const kind of ['sure', 'askLater', 'dismiss', 'depthAnswer'] as const) {
        const result = await notes.recordInteraction({ noteId: n.id, kind, at: T0 });
        assert(
          result.kind === 'coachInteractionRecorded' && result.interactionId > 0,
          `interaction ${kind}`,
        );
      }
    },
  },
  {
    name: 'notes: no synthetic plate-0 note is needed for an open-plate hint',
    async run({ notes }) {
      await notes.recordDismissal('openPlate:2026-08-16:dinner');
      same(await notes.forPlate(0), [], 'no note exists');
    },
  },
  {
    name: 'notes: old open-plate keys are pruned on write; note keys and recent keys stay',
    async run({ notes }) {
      const today = Date.now();
      const key = (day: number, slot: string) => openPlateDismissalKey({ day, slotName: slot });
      const old = key(addCalendarDays(today, -30), 'lunch');
      const recent = key(addCalendarDays(today, -3), 'dinner');
      const now = key(today, 'breakfast');
      // An old key, as an old session would have left it.
      await notes.recordDismissal(old);
      await notes.recordDismissal('note:1');
      await notes.recordDismissal(recent);
      await notes.recordDismissal(now);
      const seen = collect<ReadonlySet<string>>();
      const stop = notes.watchDismissals(seen.observer);
      try {
        await until(() => seen.values.length > 0, 'dismissals');
        same(
          [...(seen.values.at(-1) ?? [])].sort(),
          ['note:1', recent, now].sort(),
          'old pruned, the rest kept',
        );
      } finally {
        stop();
      }
    },
  },

  // ── key/value ───────────────────────────────────────────────────────────────────────────────
  {
    name: 'grams and per-100 g nutrients round-trip through the store (snapshot at log time)',
    async run({ store }) {
      const weighed: FoodEntryDraft = {
        databaseFood: {
          sourceRef: 'off:123',
          displayName: 'Yogurt',
          source: 'off',
          foodGroup: 'dairy',
          nutrientsPer100g: { energyKcal: 61, protein: 3.5, salt: 0 },
          extra: { nutriscoreGrade: 'b', novaGroup: 3 },
        },
        quantity: {
          low: 125,
          high: 125,
          unit: 'g',
          displayLabel: '125 g',
          grams: 125.5,
          gramsEstimated: true,
        },
      };
      const typed: FoodEntryDraft = {
        ...draft('Apple'),
        quantity: {
          low: 80,
          high: 80,
          unit: 'g',
          displayLabel: '80 g',
          grams: 80,
          gramsEstimated: false,
        },
      };
      const plain = draft('Bread');
      const recorded = await record(store, [weighed, typed, plain], T0);
      same(
        recorded.entries[0]?.databaseFood.nutrientsPer100g,
        { energyKcal: 61, protein: 3.5, salt: 0 },
        'returned nutrients',
      );
      const [back] = await read(store);
      const [a, b, c] = back?.entries ?? [];
      same(a?.quantity.grams, 125.5, 'grams');
      same(a?.quantity.gramsEstimated, true, 'estimated');
      same(
        a?.databaseFood.nutrientsPer100g,
        { energyKcal: 61, protein: 3.5, salt: 0 },
        'nutrients',
      );
      same(a?.databaseFood.extra, { nutriscoreGrade: 'b', novaGroup: 3 }, 'extra');
      same(b?.quantity.gramsEstimated, false, 'typed weight is not an estimate');
      assert(b?.databaseFood.nutrientsPer100g === undefined, 'unknown nutrients stay unknown');
      assert(
        c !== undefined &&
          c.quantity.grams === undefined &&
          c.quantity.gramsEstimated === undefined,
        'no grams stays absent',
      );
      assert(c?.databaseFood.extra === undefined, 'no extra stays absent');
    },
  },
  {
    name: 'an invalid grams value is refused with a typed invalidQuantity result',
    async run({ store }) {
      const bad: FoodEntryDraft = {
        ...draft('Bad'),
        quantity: { low: 1, high: 1, unit: 'g', displayLabel: 'x', grams: 0 },
      };
      const result = await store.recordPlate({ entries: [bad], loggedAtUtc: T0 });
      assert(result.kind !== 'recordPlateSuccess', 'zero grams is refused');
    },
  },
  {
    name: 'recordPlate returns the sanitised entries, the same as what is stored',
    async run({ store }) {
      const dirty: FoodEntryDraft = {
        ...draft('Dirty'),
        databaseFood: {
          ...draft('Dirty').databaseFood,
          nutrientsPer100g: { energyKcal: 50, protein: -2, fat: Number.NaN },
          extra: { nutriscoreGrade: 'z', nutrientsEstimated: true },
        } as unknown as FoodEntryDraft['databaseFood'],
      };
      const returned = await record(store, [dirty], T0);
      const stored = (await read(store))[0];
      const food = returned.entries[0]?.databaseFood;
      assert(
        JSON.stringify(food?.nutrientsPer100g) === JSON.stringify({ energyKcal: 50 }),
        'invalid nutrient values are dropped from the returned plate too',
      );
      assert(
        JSON.stringify(food?.extra) === JSON.stringify({ nutrientsEstimated: true }),
        'an invalid grade is dropped, the estimate flag stays',
      );
      assert(
        JSON.stringify(food) === JSON.stringify(stored?.entries[0]?.databaseFood),
        'what is returned is what a later read gives',
      );
    },
  },

  // ── SavedStore (schema v3) ──────────────────────────────────────────────────────────────────
  {
    name: 'saved meals: round-trip every field, newest first, entries in order',
    async run({ saved }) {
      const rich: FoodEntryDraft = {
        databaseFood: {
          sourceRef: 'off:3017620422003',
          displayName: 'Spread',
          source: 'off',
          foodGroup: 'other',
          nutrientsPer100g: { energyKcal: 539, sugars: 56.3, fat: 30.9, saturatedFat: 10.6 },
          extra: { nutriscoreGrade: 'e', novaGroup: 4, nutrientsEstimated: true },
        },
        quantity: {
          low: 0.5,
          high: 0.5,
          unit: 'g',
          displayLabel: '15 g',
          grams: 15,
          gramsEstimated: false,
        },
      };
      const first = await saved.saveMeal({
        name: '  Usual   breakfast ',
        entries: [draft('Oats'), rich],
      });
      assert(first.kind === 'saved' && first.value.id > 0, 'a saved meal gets a positive id');
      assert(
        first.kind === 'saved' && first.value.name === 'Usual breakfast',
        'the name is cleaned',
      );
      await sleep(3);
      const second = await saved.saveMeal({ name: 'Lunch', entries: [draft('Rice')] });
      assert(second.kind === 'saved', 'second saved');
      const listed = await saved.listMeals();
      assert(listed.kind === 'saved', 'listed');
      if (listed.kind !== 'saved') return;
      same(
        listed.value.map((m) => m.name),
        ['Lunch', 'Usual breakfast'],
        'newest first',
      );
      const breakfast = listed.value[1];
      same(
        breakfast?.entries.map((e) => e.databaseFood.displayName),
        ['Oats', 'Spread'],
        'order',
      );
      same(breakfast?.entries[1], rich, 'every field of an entry round-trips');
      assert(
        (breakfast?.createdAtUtc ?? 0) > 0 &&
          (listed.value[0]?.createdAtUtc ?? 0) >= (breakfast?.createdAtUtc ?? 0),
        'created time is kept',
      );
    },
  },
  {
    name: 'saved meals and recipes: what a save returns is what is stored (sanitised)',
    async run({ saved }) {
      const odd: FoodEntryDraft = {
        databaseFood: {
          sourceRef: 'off:1',
          displayName: 'Odd',
          source: 'off',
          foodGroup: 'other',
          // 99999 kcal per 100 g is implausible: the store drops it, and says so in what it returns.
          nutrientsPer100g: { energyKcal: 99999, protein: 10 },
        },
        quantity: { low: 1, high: 1, unit: 'g', displayLabel: '100 g', grams: 100 },
      };
      const meal = await saved.saveMeal({ name: 'Odd meal', entries: [odd] });
      const recipe = await saved.saveRecipe({
        name: 'Odd recipe',
        servings: 1,
        ingredients: [odd],
      });
      assert(meal.kind === 'saved' && recipe.kind === 'saved', 'saved');
      if (meal.kind !== 'saved' || recipe.kind !== 'saved') return;
      same(meal.value.entries[0]?.databaseFood.nutrientsPer100g, { protein: 10 }, 'meal returned');
      same(
        recipe.value.ingredients[0]?.databaseFood.nutrientsPer100g,
        { protein: 10 },
        'recipe returned',
      );
      const meals = await saved.listMeals();
      const recipes = await saved.listRecipes();
      same(
        meals.kind === 'saved' ? meals.value[0]?.entries : null,
        meal.value.entries,
        'the meal read back is the meal returned',
      );
      same(
        recipes.kind === 'saved' ? recipes.value[0]?.ingredients : null,
        recipe.value.ingredients,
        'the recipe read back is the recipe returned',
      );
    },
  },
  {
    name: 'saved meals: rename and delete touch only that meal; delete is idempotent',
    async run({ saved }) {
      const a = await saved.saveMeal({ name: 'A', entries: [draft('One'), draft('Two')] });
      const b = await saved.saveMeal({ name: 'B', entries: [draft('Three')] });
      assert(a.kind === 'saved' && b.kind === 'saved', 'both saved');
      if (a.kind !== 'saved' || b.kind !== 'saved') return;
      assert((await saved.renameMeal(a.value.id, ' Renamed ')).kind === 'saved', 'renamed');
      assert(
        (await saved.renameMeal(a.value.id, '   ')).kind === 'savedFailed',
        'empty name refused',
      );
      let listed = await saved.listMeals();
      same(
        listed.kind === 'saved' ? listed.value.map((m) => m.name).sort() : null,
        ['B', 'Renamed'],
        'renamed only A',
      );
      assert((await saved.deleteMeal(a.value.id)).kind === 'saved', 'deleted');
      assert((await saved.deleteMeal(a.value.id)).kind === 'saved', 'delete again is a no-op');
      assert((await saved.deleteMeal(9999)).kind === 'saved', 'unknown id succeeds');
      listed = await saved.listMeals();
      same(
        listed.kind === 'saved' ? listed.value.map((m) => [m.name, m.entries.length]) : null,
        [['B', 1]],
        'B and its entry survive',
      );
    },
  },
  {
    name: 'saved meals: an empty name, no entries or an invalid quantity are refused, nothing written',
    async run({ saved }) {
      const bad = draft('Bad', { low: 2, high: 1 });
      for (const input of [
        { name: '   ', entries: [draft('x')] },
        { name: 'ok', entries: [] },
        { name: 'ok', entries: [bad] },
      ]) {
        const result = await saved.saveMeal(input);
        assert(result.kind === 'savedFailed' && result.reason === 'invalid', 'invalid');
      }
      const listed = await saved.listMeals();
      same(listed.kind === 'saved' ? listed.value : null, [], 'nothing was written');
    },
  },
  {
    name: 'recipes: round-trip servings, cooked weight and weighed ingredients; delete cascades',
    async run({ saved }) {
      const stew = await saved.saveRecipe({
        name: 'Stew',
        servings: 4,
        cookedWeightGrams: 1200.5,
        ingredients: [weighed('Rice', 200), weighed('Beans', 300)],
      });
      const plain = await saved.saveRecipe({
        name: 'Plain',
        servings: 1,
        ingredients: [weighed('Rice', 100)],
      });
      assert(stew.kind === 'saved' && plain.kind === 'saved', 'both saved');
      if (stew.kind !== 'saved' || plain.kind !== 'saved') return;
      const listed = await saved.listRecipes();
      assert(listed.kind === 'saved', 'listed');
      if (listed.kind !== 'saved') return;
      same(
        listed.value.map((r) => [
          r.name,
          r.servings,
          r.cookedWeightGrams ?? null,
          r.ingredients.length,
        ]),
        [
          ['Plain', 1, null, 1],
          ['Stew', 4, 1200.5, 2],
        ],
        'recipes newest first with their weights',
      );
      same(listed.value[1]?.ingredients[1], weighed('Beans', 300), 'an ingredient round-trips');
      assert((await saved.deleteRecipe(stew.value.id)).kind === 'saved', 'deleted');
      assert((await saved.deleteRecipe(stew.value.id)).kind === 'saved', 'idempotent');
      const after = await saved.listRecipes();
      same(
        after.kind === 'saved' ? after.value.map((r) => r.name) : null,
        ['Plain'],
        'only Stew is gone',
      );
    },
  },
  {
    name: 'recipes: a missing weight, a bad serving count or no ingredient is refused',
    async run({ saved }) {
      const unweighed = draft('Rice');
      for (const input of [
        { name: 'r', servings: 1, ingredients: [] },
        { name: 'r', servings: 0, ingredients: [weighedOne()] },
        { name: 'r', servings: 2, ingredients: [unweighed] },
        { name: '', servings: 2, ingredients: [weighedOne()] },
        { name: 'r', servings: 2, cookedWeightGrams: -5, ingredients: [weighedOne()] },
      ]) {
        const result = await saved.saveRecipe(input);
        assert(result.kind === 'savedFailed' && result.reason === 'invalid', 'invalid recipe');
      }
      const listed = await saved.listRecipes();
      same(listed.kind === 'saved' ? listed.value : null, [], 'nothing was written');
    },
  },
  // ── Vault snapshot (schema v4): uids, stamps, tombstones, apply ─────────────────────────────
  {
    name: 'vault: an empty store reads an empty snapshot; device-only keys never appear in one',
    async run({ vault, kv }) {
      const empty = await snapshotOf(vault);
      same(
        [
          empty.plates,
          empty.dismissals,
          empty.savedMeals,
          empty.recipes,
          empty.kv,
          empty.tombstones,
        ],
        [[], [], [], [], [], []],
        'nothing yet',
      );
      await kv.write('ai.byokKey', 'sk-secret-value-123');
      await kv.write('ai.settings', '{"rung":"byok"}');
      await kv.write('ai.coachingConsent', '{"host":"x"}');
      await kv.write('some.future.key', 'unreviewed');
      await kv.write('privacy.offLookup', 'allowed'); // consent to a destination is per device
      await kv.write('ui.locale', 'fr');
      const snap = await snapshotOf(vault);
      same(
        snap.kv.map((e) => [e.key, e.value]),
        [['ui.locale', 'fr']],
        'only the allow-listed key travels',
      );
      assert(!JSON.stringify(snap).includes('sk-secret'), 'the BYOK key is not in the snapshot');
      assert(!JSON.stringify(snap).includes('sync.deviceId'), 'nor is the device id');
      assert((await kv.read('ai.byokKey')) === 'sk-secret-value-123', 'and it stays in the store');
    },
  },
  {
    name: 'vault: every new row gets its own uid; the rows of a plate keep the order they were written in',
    async run({ store, notes, saved, vault }) {
      const first = await record(store, [draft('A'), draft('B'), draft('C')], T0);
      const second = await record(store, [draft('D')], T0 + MINUTE);
      const n = await appended(notes, note(first.id, 'k'));
      await notes.recordInteraction({ noteId: n.id, kind: 'sure', at: T0 });
      await notes.recordInteraction({ noteId: n.id, kind: 'dismiss', at: T0 + 1 });
      await saved.saveMeal({ name: 'Meal', entries: [draft('E'), draft('F')] });
      await saved.saveRecipe({ name: 'Stew', servings: 2, ingredients: [weighed('Rice', 100)] });
      const snap = await snapshotOf(vault);
      const uids = [
        ...snap.plates.flatMap((p) => [
          p.uid,
          ...p.entries.map((e) => e.uid),
          ...p.notes.flatMap((x) => [x.uid, ...x.interactions.map((i) => i.uid)]),
        ]),
        ...snap.savedMeals.flatMap((m) => [m.uid, ...m.items.map((i) => i.uid)]),
        ...snap.recipes.flatMap((r) => [r.uid, ...r.items.map((i) => i.uid)]),
      ];
      // 2 plates + 4 entries + 1 note + 2 interactions + 1 meal + 2 items + 1 recipe + 1 ingredient.
      assert(uids.length === 14, `every row is in the snapshot (${uids.length})`);
      assert(uids.every(isUuid), 'every uid is a UUID');
      assert(new Set(uids).size === uids.length, 'all distinct');
      const firstPlate = snap.plates.find((p) => p.entries.length === 3);
      same(
        firstPlate?.entries.map((e) => e.displayName),
        ['A', 'B', 'C'],
        'entries come back in the order they were written',
      );
      same(
        firstPlate?.notes[0]?.interactions.map((i) => i.kind),
        ['sure', 'dismiss'],
        'so do interactions',
      );
      assert(snap.plates.some((p) => p.uid !== firstPlate?.uid) && second.id > 0, 'two plates');
    },
  },
  {
    name: 'vault: saved meals and recipes are stamped on create and on every rename; kv writes stamp too',
    async run({ saved, kv, vault }) {
      const meal = await saved.saveMeal({ name: 'Usual', entries: [draft('Oats')] });
      assert(meal.kind === 'saved', 'saved');
      if (meal.kind !== 'saved') return;
      await saved.saveRecipe({ name: 'Stew', servings: 2, ingredients: [weighed('Rice', 100)] });
      await kv.write('ui.locale', 'en');
      const one = await snapshotOf(vault);
      const mealStamp = one.savedMeals[0]?.updatedAtHlc ?? '';
      const kvStamp = one.kv[0]?.updatedAtHlc ?? '';
      assert(parseVaultSnapshot(one).kind === 'vaultSnapshotParsed', 'valid');
      await saved.renameMeal(meal.value.id, 'Renamed');
      await kv.write('ui.locale', 'fr');
      const two = await snapshotOf(vault);
      assert((two.savedMeals[0]?.updatedAtHlc ?? '') > mealStamp, 'a rename moves the stamp on');
      assert((two.kv[0]?.updatedAtHlc ?? '') > kvStamp, 'a kv write moves the stamp on');
      assert(
        two.recipes[0]?.updatedAtHlc === one.recipes[0]?.updatedAtHlc,
        'an untouched record keeps its stamp',
      );
      same(two.savedMeals[0]?.uid, one.savedMeals[0]?.uid, 'a rename keeps the uid');
    },
  },
  {
    name: 'vault: deleting a plate leaves tombstones for it, its entries, notes and interactions',
    async run({ store, notes, vault }) {
      const keep = await record(store, [draft('Keep')], T0);
      const gone = await record(store, [draft('Apple'), draft('Pear')], T0 + MINUTE);
      const n = await appended(notes, note(gone.id, 'a'));
      await notes.recordInteraction({ noteId: n.id, kind: 'sure', at: T0 });
      await notes.recordDismissal(coachNoteDismissalKey(n.id));
      const before = await snapshotOf(vault);
      const victim = before.plates.find((p) => p.entries.length === 2);
      assert(
        victim !== undefined && before.tombstones.length === 0,
        'two plates, no tombstone yet',
      );
      if (victim === undefined) return;
      const expected = [
        [victim.uid, 'plate_log'],
        ...victim.entries.map((e) => [e.uid, 'food_entry']),
        [victim.notes[0]?.uid, 'coach_note'],
        [victim.notes[0]?.interactions[0]?.uid, 'coach_interaction'],
      ].sort();
      assert((await store.deletePlate(gone.id)).kind === 'plateDeleted', 'deleted');
      const after = await snapshotOf(vault);
      same(
        after.tombstones.map((t) => [t.uid, t.table]).sort(),
        expected,
        'one tombstone per deleted row',
      );
      same(
        after.plates.map((p) => p.entries[0]?.displayName),
        ['Keep'],
        'the other plate stays',
      );
      same(after.dismissals, [], 'the note dismissal went with its note');
      assert(keep.id > 0, 'kept');
      // Deleting something that is not there writes nothing.
      await store.deletePlate(gone.id);
      await store.deletePlate(99999);
      same((await snapshotOf(vault)).tombstones.length, expected.length, 'idempotent');
    },
  },
  {
    name: 'vault: deleting a saved meal or recipe leaves tombstones for it and its items; so does a synced kv delete',
    async run({ saved, kv, vault }) {
      const meal = await saved.saveMeal({ name: 'M', entries: [draft('a'), draft('b')] });
      const recipe = await saved.saveRecipe({
        name: 'R',
        servings: 1,
        ingredients: [weighed('Rice', 100)],
      });
      assert(meal.kind === 'saved' && recipe.kind === 'saved', 'saved');
      if (meal.kind !== 'saved' || recipe.kind !== 'saved') return;
      await kv.write('ui.showNumbers', 'off');
      await kv.write('ai.settings', '{}');
      const before = await snapshotOf(vault);
      await saved.deleteMeal(meal.value.id);
      await saved.deleteRecipe(recipe.value.id);
      await kv.delete('ui.showNumbers');
      await kv.delete('ai.settings'); // device-only: no tombstone
      await kv.delete('never.written');
      const after = await snapshotOf(vault);
      const m = before.savedMeals[0];
      const r = before.recipes[0];
      same(
        after.tombstones.map((t) => [t.uid, t.table]).sort(),
        [
          [m?.uid, 'saved_meal'],
          ...(m?.items ?? []).map((i) => [i.uid, 'saved_meal_item']),
          [r?.uid, 'recipe'],
          ...(r?.items ?? []).map((i) => [i.uid, 'recipe_item']),
          ['kv:ui.showNumbers', 'kv'],
        ].sort(),
        'tombstones for the records, their items and the synced key only',
      );
      same([after.savedMeals, after.recipes, after.kv], [[], [], []], 'and the rows are gone');
    },
  },
  {
    name: 'vault: a locked store answers typed failures',
    async run({ vault, lock }) {
      const snap = await snapshotOf(vault);
      await lock();
      const read = await vault.readSnapshot();
      assert(read.kind === 'vaultFailed' && read.reason === 'locked', 'read: locked');
      const apply = await vault.applySnapshot(snap);
      assert(apply.kind === 'vaultFailed' && apply.reason === 'locked', 'apply: locked');
    },
  },
  {
    name: 'vault: snapshot -> apply into an empty store -> snapshot is identical, byte for byte',
    needsFresh: true,
    async run({ store, notes, saved, kv, vault, fresh }) {
      if (!fresh) throw new ContractFailure('this case needs a second store');
      const kept = await record(store, [weighed('Rice', 120), draft('Apple')], T0);
      const gone = await record(store, [draft('Pear')], T0 + HOUR);
      const n = await appended(notes, note(kept.id, 'k'));
      await notes.recordInteraction({ noteId: n.id, kind: 'sure', at: T0 });
      await notes.recordDismissal(coachNoteDismissalKey(n.id));
      await notes.recordDismissal(`openPlate:${new Date().toISOString().slice(0, 10)}:lunch`);
      await store.deletePlate(gone.id);
      const meal = await saved.saveMeal({ name: 'Usual', entries: [draft('Oats'), draft('Milk')] });
      await saved.saveMeal({ name: 'Doomed', entries: [draft('x')] });
      await saved.saveRecipe({
        name: 'Stew',
        servings: 4,
        cookedWeightGrams: 1200.5,
        ingredients: [weighed('Rice', 200), weighed('Beans', 300)],
      });
      if (meal.kind === 'saved') await saved.renameMeal(meal.value.id, 'Usual breakfast');
      const doomed = await saved.listMeals();
      if (doomed.kind === 'saved') {
        const d = doomed.value.find((m) => m.name === 'Doomed');
        if (d) await saved.deleteMeal(d.id);
      }
      await kv.write('ui.locale', 'fr');
      await kv.write('profile', '{"heightCm":170}');
      await kv.write('ui.showNumbers', 'off');
      await kv.delete('ui.showNumbers');
      await kv.write('ai.byokKey', 'sk-secret-value-123');

      const original = await snapshotOf(vault);
      const target = await fresh();
      try {
        const applied = await target.vault.applySnapshot(original);
        assert(applied.kind === 'vault', `applied: ${JSON.stringify(applied)}`);
        const copy = await snapshotOf(target.vault);
        assert(JSON.stringify(copy) === JSON.stringify(original), 'the snapshot round-trips');
        assert(!JSON.stringify(copy).includes('sk-secret'), 'no secret came along');
        same(
          (await read(target.store)).map((p) => p.entries.map((e) => e.databaseFood.displayName)),
          (await read(store)).map((p) => p.entries.map((e) => e.databaseFood.displayName)),
          'the day board reads the same',
        );
        const copied = await target.notes.forPlate((await read(target.store))[0]?.id ?? -1);
        same(
          copied.map((c) => c.text),
          ['text for k'],
          'the coach note is there',
        );
        assert((await target.kv.read('ui.locale')) === 'fr', 'settings came along');
        assert((await target.kv.read('ai.byokKey')) === null, 'the BYOK key did not');
        // Applying it again changes nothing.
        assert((await target.vault.applySnapshot(original)).kind === 'vault', 'applied twice');
        assert(
          JSON.stringify(await snapshotOf(target.vault)) === JSON.stringify(original),
          'idempotent',
        );
      } finally {
        await target.dispose();
      }
    },
  },
  {
    name: 'vault: a tombstone beats an older copy of a plate, and a newer saved meal beats an older one',
    needsFresh: true,
    async run({ store, saved, vault, fresh }) {
      if (!fresh) throw new ContractFailure('this case needs a second store');
      const plate = await record(store, [draft('Apple')], T0);
      const meal = await saved.saveMeal({ name: 'Old name', entries: [draft('Oats')] });
      assert(meal.kind === 'saved', 'saved');
      if (meal.kind !== 'saved') return;
      const older = await snapshotOf(vault);
      const other = await fresh();
      try {
        // The other device restores the old state, renames the meal and deletes the plate.
        await other.vault.applySnapshot(older);
        const otherMeals = await other.saved.listMeals();
        const otherId = otherMeals.kind === 'saved' ? (otherMeals.value[0]?.id ?? -1) : -1;
        await other.saved.renameMeal(otherId, 'New name');
        await other.store.deletePlate((await read(other.store))[0]?.id ?? -1);
        const newer = await snapshotOf(other.vault);

        // Back on the first device the newer state wins ...
        assert((await vault.applySnapshot(newer)).kind === 'vault', 'applied the newer state');
        same((await read(store)).length, 0, 'the plate deleted elsewhere is gone here too');
        const listed = await saved.listMeals();
        same(
          listed.kind === 'saved' ? listed.value.map((m) => m.name) : null,
          ['New name'],
          'renamed',
        );
        // ... and the old state can no longer bring anything back.
        assert((await vault.applySnapshot(older)).kind === 'vault', 'applied the older state');
        same((await read(store)).length, 0, 'the deleted plate stays deleted');
        const again = await saved.listMeals();
        same(again.kind === 'saved' ? again.value.map((m) => m.name) : null, ['New name'], 'kept');
        assert(plate.id > 0, 'plate existed');
        // New work after applying sorts after what was applied.
        await saved.renameMeal(meal.value.id, 'Newest');
        const last = await snapshotOf(vault);
        assert(
          (last.savedMeals[0]?.updatedAtHlc ?? '') > (newer.savedMeals[0]?.updatedAtHlc ?? ''),
          'later writes are stamped after the stamps that were applied',
        );
      } finally {
        await other.dispose();
      }
    },
  },
  {
    name: 'vault: applying a snapshot gives exactly what merging it would (ties, tombstones and all)',
    needsFresh: true,
    async run({ fresh }) {
      if (!fresh) throw new ContractFailure('this case needs a second store');
      const random = seeded(2026);
      for (let round = 0; round < 40; round++) {
        const [left, right] = [randomVaultSnapshot(random), randomVaultSnapshot(random)];
        const target = await fresh();
        try {
          assert((await target.vault.applySnapshot(left)).kind === 'vault', 'applied the first');
          const stored = await snapshotOf(target.vault);
          assert(
            canonicalText(stored) === canonicalText(left),
            `round ${round}: stores what it was given`,
          );
          const applied = await target.vault.applySnapshot(right);
          assert(
            applied.kind === 'vault',
            `round ${round}: applied the second ${JSON.stringify(applied)}`,
          );
          const expected = mergeSnapshots(left, right);
          const actual = await snapshotOf(target.vault);
          assert(
            canonicalText(actual) === canonicalText(expected),
            `round ${round}: apply(L, R) differs from merge(L, R)`,
          );
        } finally {
          await target.dispose();
        }
      }
    },
  },
  {
    name: 'vault: a snapshot with a stamp beyond the drift bound is refused and writes nothing',
    async run({ saved, vault }) {
      await saved.saveMeal({ name: 'Usual', entries: [draft('Oats')] });
      const before = JSON.stringify(await snapshotOf(vault));
      const good = JSON.parse(before) as VaultSnapshot;
      const farAhead = formatHlc({
        wallMs: Date.now() + MAX_DRIFT_MS + 60_000,
        counter: 0,
        deviceId: 'aaaaaaaaaaaaaaaa',
      });
      const poisoned = await vault.applySnapshot({
        ...good,
        kv: [{ key: 'ui.locale', value: 'fr', updatedAtHlc: farAhead }],
      });
      assert(poisoned.kind === 'vaultFailed' && poisoned.reason === 'clockAhead', 'clockAhead');
      const tomb = await vault.applySnapshot({
        ...good,
        tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: farAhead }],
      });
      assert(tomb.kind === 'vaultFailed' && tomb.reason === 'clockAhead', 'a tombstone too');
      assert(JSON.stringify(await snapshotOf(vault)) === before, 'nothing changed');
      // The clock was not dragged: a write now is stamped near the present.
      await saved.saveMeal({ name: 'Later', entries: [draft('Rice')] });
      const after = await snapshotOf(vault);
      const newest =
        after.savedMeals
          .map((m) => m.updatedAtHlc)
          .sort()
          .at(-1) ?? '';
      assert(newest < farAhead, 'later writes stay near the real time');
    },
  },
  {
    name: 'vault: a uid that already means something else here is refused as invalid, writing nothing',
    async run({ store, saved, vault }) {
      await record(store, [draft('A'), draft('B')], T0);
      await saved.saveMeal({ name: 'Usual', entries: [draft('Oats')] });
      const before = JSON.stringify(await snapshotOf(vault));
      const good = JSON.parse(before) as VaultSnapshot;
      const plate = good.plates[0];
      const meal = good.savedMeals[0];
      assert(plate !== undefined && meal !== undefined, 'seeded');
      if (plate === undefined || meal === undefined) return;
      // An entry of the stored plate, claimed by a different plate.
      const stolen = await vault.applySnapshot({
        ...good,
        plates: [
          {
            uid: uuid(424242),
            loggedAtUtc: plate.loggedAtUtc,
            entries: [plate.entries[0] as (typeof plate.entries)[number]],
            notes: [],
          },
        ],
      });
      assert(
        stolen.kind === 'vaultFailed' && stolen.reason === 'invalid',
        'entry under another plate',
      );
      // A saved-meal item uid claimed by a new recipe.
      const item = meal.items[0] as (typeof meal.items)[number];
      const crossed = await vault.applySnapshot({
        ...good,
        recipes: [
          {
            uid: uuid(515151),
            name: 'Crafted',
            servings: 1,
            cookedWeightGrams: null,
            createdAtUtc: meal.createdAtUtc,
            updatedAtHlc: meal.updatedAtHlc,
            items: [item],
          },
        ],
      });
      assert(
        crossed.kind === 'vaultFailed' && crossed.reason === 'invalid',
        'item in another table',
      );
      assert(JSON.stringify(await snapshotOf(vault)) === before, 'nothing changed');
    },
  },
  {
    name: 'vault: an invalid or newer-schema snapshot is a typed failure and writes nothing',
    async run({ store, vault }) {
      await record(store, [draft('Apple')], T0);
      const before = JSON.stringify(await snapshotOf(vault));
      const good = JSON.parse(before) as VaultSnapshot;
      const tooNew = await vault.applySnapshot({ ...good, schemaVersion: good.schemaVersion + 1 });
      assert(tooNew.kind === 'vaultFailed' && tooNew.reason === 'schemaTooNew', 'schemaTooNew');
      const garbage = await vault.applySnapshot({ nope: true } as unknown as VaultSnapshot);
      assert(garbage.kind === 'vaultFailed' && garbage.reason === 'invalid', 'invalid');
      const secret = await vault.applySnapshot({
        ...good,
        kv: [
          { key: 'ai.byokKey', value: 'x', updatedAtHlc: '0000000000001-0000-aaaaaaaaaaaaaaaa' },
        ],
      });
      assert(secret.kind === 'vaultFailed' && secret.reason === 'invalid', 'a device-only key');
      assert(JSON.stringify(await snapshotOf(vault)) === before, 'nothing changed');
    },
  },
  {
    name: 'kv: reads null, writes, overwrites and deletes',
    async run({ kv }) {
      assert((await kv.read('a.b')) === null, 'absent');
      await kv.write('a.b', '1');
      assert((await kv.read('a.b')) === '1', 'written');
      await kv.write('a.b', '2');
      assert((await kv.read('a.b')) === '2', 'overwritten');
      await kv.delete('a.b');
      assert((await kv.read('a.b')) === null, 'deleted');
      await kv.delete('a.b'); // absent: no-op
    },
  },
  {
    name: 'kv: values are stored verbatim (JSON, unicode, empty string)',
    async run({ kv }) {
      for (const value of ['{"rung":"byok","n":[1,2]}', 'café \u{1F34E}', '']) {
        await kv.write('ai.settings', value);
        assert((await kv.read('ai.settings')) === value, `round trip of ${JSON.stringify(value)}`);
      }
    },
  },
  {
    name: 'kv: toString never prints values',
    async run({ kv }) {
      await kv.write('ai.byokKey', 'sk-secret-value-123');
      assert(!String(kv).includes('sk-secret'), 'no value in toString');
    },
  },
];
