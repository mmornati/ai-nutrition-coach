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
  coachNoteDismissalKey,
  openPlateDismissalKey,
  addCalendarDays,
  type CoachNote,
  type CoachNoteStore,
  type EncryptedStore,
  type FoodEntryDraft,
  type FoodGroup,
  type PlateLog,
  type SourceCatalog,
} from '@anc/core';
import { KeyValueStoreLocked, type KeyValueStore } from '../key-value-store';

export interface ContractSubject {
  readonly store: EncryptedStore;
  readonly notes: CoachNoteStore;
  readonly kv: KeyValueStore;
  /** Lock the store (drop the database); the same ports must then answer typed "locked" results. */
  lock(): Promise<void>;
  dispose(): Promise<void>;
}

export interface ContractCase {
  readonly name: string;
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
    async run({ store, notes, kv, lock }) {
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
