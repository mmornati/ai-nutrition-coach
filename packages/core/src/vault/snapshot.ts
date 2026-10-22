// The full-fidelity vault snapshot: everything a person has that must survive losing a browser,
// as plain JSON-able data. Records are keyed and linked by `uid` (a UUID that never changes and is
// the same on every device), never by the local integer ids, which stay internal to each store.
// Columns are carried as the strings the store holds, so a round trip is byte for byte.
//
// Invariants every snapshot in this module satisfies (the parser enforces them on untrusted input,
// `canonicalizeSnapshot` produces them, `mergeVaultSnapshots` preserves them):
//   - arrays are in the canonical order below, so two equal states serialise identically;
//   - the rows of one parent are ordered by `uid`. UUIDv7s from one store's generator increase, and
//     the generator continues past the newest uid already stored, so for rows written on this
//     device that is the order they were written in (entries of a plate, notes, interactions); rows
//     that came from the v3 migration were numbered in id order at that moment;
//   - a saved meal's / recipe's items keep their own order (it is part of the record);
//   - coach dismissal keys of a note are `note:<uid of the note>` (the store maps them to and from
//     its local `note:<id>`);
//   - a uid belongs to ONE table, and appears once (tombstones included);
//   - no plate-family record is also tombstoned (a tombstone removes it);
//   - no template or kv entry is shadowed by a tombstone at or after its `updatedAtHlc`;
//   - every string is in exactly the form the store writes it (instants, numbers, JSON), and every
//     size is within SNAPSHOT_LIMITS.
// Photos are never stored, and the BYOK key is never in a snapshot (see kv-allow-list.ts).

import { isUuid } from '../util/uuid-v7';
import { isValidGrams, isValidRange } from '../value-types/quantity-range';
import { compareText } from './decide';
import { compareHlc, hlcBeyond, isHlc } from './hlc';
import {
  isJsonObjectText,
  isStoredInstant,
  isSyncedKvKey,
  isValidKvValue,
  MAX_KV_VALUE_LENGTH,
} from './kv-allow-list';

export const SNAPSHOT_VERSION = 1;

/** The food snapshot columns shared by plate entries and by saved meal / recipe items. */
export interface VaultFood {
  readonly sourceRef: string;
  readonly displayName: string;
  readonly source: string;
  readonly foodGroup: string;
  /** Numbers as text, verbatim. */
  readonly quantityLow: string;
  readonly quantityHigh: string;
  readonly quantityUnit: string;
  readonly quantityDisplayLabel: string;
  readonly quantityGrams: string | null;
  /** 0 or 1. */
  readonly quantityGramsEstimated: number | null;
  /** JSON text, verbatim. */
  readonly nutrientsPer100g: string | null;
  /** JSON text, verbatim. */
  readonly foodExtra: string | null;
}

export interface VaultEntry extends VaultFood {
  readonly uid: string;
}

export interface VaultInteraction {
  readonly uid: string;
  readonly kind: string;
  readonly at: string;
}

export interface VaultCoachNote {
  readonly uid: string;
  readonly anchor: string;
  readonly questionKey: string;
  readonly noteText: string;
  readonly generatedAt: string;
  readonly interactions: readonly VaultInteraction[];
}

export interface VaultPlate {
  readonly uid: string;
  readonly loggedAtUtc: string;
  readonly entries: readonly VaultEntry[];
  readonly notes: readonly VaultCoachNote[];
}

export interface VaultDismissal {
  readonly key: string;
  readonly dismissedAtUtc: string;
}

export interface VaultSavedMeal {
  readonly uid: string;
  readonly name: string;
  readonly createdAtUtc: string;
  readonly updatedAtHlc: string;
  readonly items: readonly VaultEntry[];
}

export interface VaultRecipe {
  readonly uid: string;
  readonly name: string;
  readonly servings: number;
  readonly cookedWeightGrams: string | null;
  readonly createdAtUtc: string;
  readonly updatedAtHlc: string;
  readonly items: readonly VaultEntry[];
}

export interface VaultKvEntry {
  readonly key: string;
  readonly value: string;
  readonly updatedAtHlc: string;
}

export const TOMBSTONE_TABLES = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
  'saved_meal',
  'saved_meal_item',
  'recipe',
  'recipe_item',
  'kv',
] as const;
export type TombstoneTable = (typeof TOMBSTONE_TABLES)[number];

/** Deleting a plate removes it for good, on every device: no later write can bring it back. */
export const PLATE_FAMILY_TABLES: readonly TombstoneTable[] = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
];

/** The tombstone uid of a `kv` key (a key has no uid of its own). */
export const KV_UID_PREFIX = 'kv:';
export const kvTombstoneUid = (key: string): string => `${KV_UID_PREFIX}${key}`;

export interface VaultTombstone {
  readonly uid: string;
  readonly table: TombstoneTable;
  readonly deletedAtHlc: string;
}

export interface VaultSnapshot {
  readonly snapshotVersion: typeof SNAPSHOT_VERSION;
  /** The store schema the data came from (`PRAGMA user_version`). */
  readonly schemaVersion: number;
  readonly plates: readonly VaultPlate[];
  readonly dismissals: readonly VaultDismissal[];
  readonly savedMeals: readonly VaultSavedMeal[];
  readonly recipes: readonly VaultRecipe[];
  readonly kv: readonly VaultKvEntry[];
  readonly tombstones: readonly VaultTombstone[];
}

// ---------------------------------------------------------------------------------------------
// Canonical order

const byUid = (a: { readonly uid: string }, b: { readonly uid: string }): number =>
  compareText(a.uid, b.uid);

const sorted = <T>(items: readonly T[], compare: (a: T, b: T) => number): readonly T[] =>
  Object.freeze([...items].sort(compare));

/** The one order a snapshot is written in; applying it twice changes nothing. */
export function canonicalizeSnapshot(snapshot: VaultSnapshot): VaultSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    schemaVersion: snapshot.schemaVersion,
    plates: sorted(
      snapshot.plates.map((plate) => ({
        ...plate,
        entries: sorted(plate.entries, byUid),
        notes: sorted(
          plate.notes.map((note) => ({ ...note, interactions: sorted(note.interactions, byUid) })),
          byUid,
        ),
      })),
      (a, b) => compareText(a.loggedAtUtc, b.loggedAtUtc) || compareText(a.uid, b.uid),
    ),
    dismissals: sorted(snapshot.dismissals, (a, b) => compareText(a.key, b.key)),
    savedMeals: sorted(snapshot.savedMeals, byUid),
    recipes: sorted(snapshot.recipes, byUid),
    kv: sorted(snapshot.kv, (a, b) => compareText(a.key, b.key)),
    tombstones: sorted(snapshot.tombstones, byUid),
  };
}

/** The newest stamp anywhere in the snapshot, or `null` when it carries none. */
export function newestHlc(snapshot: VaultSnapshot): string | null {
  let newest: string | null = null;
  const see = (stamp: string): void => {
    if (newest === null || compareHlc(stamp, newest) > 0) newest = stamp;
  };
  for (const meal of snapshot.savedMeals) see(meal.updatedAtHlc);
  for (const recipe of snapshot.recipes) see(recipe.updatedAtHlc);
  for (const entry of snapshot.kv) see(entry.updatedAtHlc);
  for (const tombstone of snapshot.tombstones) see(tombstone.deletedAtHlc);
  return newest;
}

/** True when any stamp in the snapshot is later than `limitMs` (see MAX_DRIFT_MS). */
export function snapshotBeyond(snapshot: VaultSnapshot, limitMs: number): boolean {
  const stamps = [
    ...snapshot.savedMeals.map((m) => m.updatedAtHlc),
    ...snapshot.recipes.map((r) => r.updatedAtHlc),
    ...snapshot.kv.map((e) => e.updatedAtHlc),
    ...snapshot.tombstones.map((t) => t.deletedAtHlc),
  ];
  return stamps.some((stamp) => hlcBeyond(stamp, limitMs));
}

/** The key a tombstone is looked up by: the same uid in another table is another record. */
export const tombstoneKey = (table: TombstoneTable, uid: string): string => `${table}\u0000${uid}`;

interface Identity {
  readonly table: TombstoneTable;
  /** The uid of the row's parent, for rows that live under one. */
  readonly parent: string | null;
}

/** Every uid in the snapshot with the table it belongs to (live rows and tombstones alike). */
function identities(snapshot: VaultSnapshot): Map<string, Identity> {
  const out = new Map<string, Identity>();
  const put = (uid: string, table: TombstoneTable, parent: string | null): void => {
    out.set(uid, { table, parent });
  };
  for (const plate of snapshot.plates) {
    put(plate.uid, 'plate_log', null);
    for (const e of plate.entries) put(e.uid, 'food_entry', plate.uid);
    for (const n of plate.notes) {
      put(n.uid, 'coach_note', plate.uid);
      for (const i of n.interactions) put(i.uid, 'coach_interaction', n.uid);
    }
  }
  for (const m of snapshot.savedMeals) {
    put(m.uid, 'saved_meal', null);
    for (const i of m.items) put(i.uid, 'saved_meal_item', m.uid);
  }
  for (const r of snapshot.recipes) {
    put(r.uid, 'recipe', null);
    for (const i of r.items) put(i.uid, 'recipe_item', r.uid);
  }
  // A tombstone only claims its table; where it already has a live row the live row's parent stays.
  for (const t of snapshot.tombstones) if (!out.has(t.uid)) put(t.uid, t.table, null);
  return out;
}

/**
 * True when the two snapshots use one uid for different things: another table, or (for an entry,
 * note, interaction or item) another parent. Two honest devices never do this; a crafted or damaged
 * snapshot might, and merging or applying it would silently move or delete the wrong row. The merge
 * and both stores refuse it.
 */
export function vaultConflict(a: VaultSnapshot, b: VaultSnapshot): boolean {
  const left = identities(a);
  for (const [uid, other] of identities(b)) {
    const mine = left.get(uid);
    if (mine === undefined) continue;
    if (mine.table !== other.table) return true;
    if (mine.parent !== null && other.parent !== null && mine.parent !== other.parent) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// The strict parser (untrusted input: a backup file, a server response)

export type VaultSnapshotProblem =
  | 'notAnObject'
  | 'unsupportedSnapshotVersion'
  | 'malformed'
  | 'tooLarge'
  | 'duplicate'
  | 'conflict';

/** Never carries a value from the input: a content-free `path` such as `plates[2].entries[0].uid`. */
export type VaultSnapshotParseResult =
  | { readonly kind: 'vaultSnapshotParsed'; readonly snapshot: VaultSnapshot }
  | {
      readonly kind: 'vaultSnapshotInvalid';
      readonly problem: VaultSnapshotProblem;
      readonly path: string;
    };

/**
 * The most a snapshot may hold. Generous for a person's own history (thousands of plates), small
 * enough that a hostile file cannot exhaust memory before it is refused.
 */
export const SNAPSHOT_LIMITS = Object.freeze({
  /** Names, labels, keys, notes: any single text field. */
  text: 4_096,
  /** A JSON text column (nutrients, extra). */
  json: 16_384,
  plates: 200_000,
  entriesPerPlate: 200,
  notesPerPlate: 50,
  interactionsPerNote: 50,
  dismissals: 200_000,
  templates: 20_000,
  itemsPerTemplate: 200,
  kv: 32,
  tombstones: 2_000_000,
  /** Plates, entries, notes, interactions, templates, items, dismissals and tombstones together. */
  records: 3_000_000,
});

class Invalid extends Error {
  constructor(
    readonly problem: VaultSnapshotProblem,
    readonly path: string,
  ) {
    super(problem);
  }
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function object(value: unknown, path: string, keys: readonly string[]): Json {
  if (!isRecord(value)) throw new Invalid('malformed', path);
  // Exactly these keys: an unknown field is refused, not carried along.
  const have = Object.keys(value);
  if (have.length !== keys.length || !keys.every((k) => Object.hasOwn(value, k))) {
    throw new Invalid('malformed', path);
  }
  return value;
}

function str(o: Json, key: string, path: string, max: number = SNAPSHOT_LIMITS.text): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Invalid('malformed', `${path}.${key}`);
  if (v.length > max) throw new Invalid('tooLarge', `${path}.${key}`);
  return v;
}

/** A string in a form the store writes: `ok` decides. */
function formatted(
  o: Json,
  key: string,
  path: string,
  ok: (value: string) => boolean,
  max?: number,
): string {
  const v = str(o, key, path, max);
  if (!ok(v)) throw new Invalid('malformed', `${path}.${key}`);
  return v;
}

const instant = (o: Json, key: string, path: string): string =>
  formatted(o, key, path, isStoredInstant);

/** A finite number written as text, the way the store keeps quantities. */
const isNumberText = (value: string): boolean =>
  value.trim() !== '' && Number.isFinite(Number(value));

function uid(o: Json, key: string, path: string): string {
  const v = o[key];
  if (!isUuid(v)) throw new Invalid('malformed', `${path}.${key}`);
  return v;
}

function hlc(o: Json, key: string, path: string): string {
  const v = o[key];
  if (!isHlc(v)) throw new Invalid('malformed', `${path}.${key}`);
  return v;
}

function list(value: unknown, path: string, max: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new Invalid('malformed', path);
  if (value.length > max) throw new Invalid('tooLarge', path);
  return value as readonly unknown[];
}

const FOOD_KEYS = [
  'sourceRef',
  'displayName',
  'source',
  'foodGroup',
  'quantityLow',
  'quantityHigh',
  'quantityUnit',
  'quantityDisplayLabel',
  'quantityGrams',
  'quantityGramsEstimated',
  'nutrientsPer100g',
  'foodExtra',
] as const;

function food(o: Json, path: string): VaultFood {
  const estimated = o['quantityGramsEstimated'];
  if (estimated !== null && estimated !== 0 && estimated !== 1) {
    throw new Invalid('malformed', `${path}.quantityGramsEstimated`);
  }
  const low = formatted(o, 'quantityLow', path, isNumberText);
  const high = formatted(o, 'quantityHigh', path, isNumberText);
  if (!isValidRange(Number(low), Number(high)))
    throw new Invalid('malformed', `${path}.quantityLow`);
  const grams =
    o['quantityGrams'] === null
      ? null
      : formatted(o, 'quantityGrams', path, (v) => isNumberText(v) && isValidGrams(Number(v)));
  const jsonOrNull = (key: string): string | null =>
    o[key] === null ? null : formatted(o, key, path, isJsonObjectText, SNAPSHOT_LIMITS.json);
  return {
    sourceRef: str(o, 'sourceRef', path),
    displayName: str(o, 'displayName', path),
    source: str(o, 'source', path),
    foodGroup: str(o, 'foodGroup', path),
    quantityLow: low,
    quantityHigh: high,
    quantityUnit: str(o, 'quantityUnit', path),
    quantityDisplayLabel: str(o, 'quantityDisplayLabel', path),
    quantityGrams: grams,
    quantityGramsEstimated: estimated,
    nutrientsPer100g: jsonOrNull('nutrientsPer100g'),
    foodExtra: jsonOrNull('foodExtra'),
  };
}

/**
 * Validates an untrusted value and returns a typed snapshot in canonical order, or says which
 * part is wrong (never echoing its content). Strict by design: wrong types, unknown fields, a
 * string that is not in the form the store writes (instants, numbers, JSON), a key outside the kv
 * allow-list or a value the app would not write under it, a size over SNAPSHOT_LIMITS, a uid that
 * appears twice or in two tables, and a record shadowed by its own tombstone are all refused, so
 * nothing half-valid can reach a store.
 */
export function parseVaultSnapshot(input: unknown): VaultSnapshotParseResult {
  try {
    if (!isRecord(input)) throw new Invalid('notAnObject', '$');
    if (input['snapshotVersion'] !== SNAPSHOT_VERSION) {
      throw new Invalid('unsupportedSnapshotVersion', '$.snapshotVersion');
    }
    const root = object(input, '$', [
      'snapshotVersion',
      'schemaVersion',
      'plates',
      'dismissals',
      'savedMeals',
      'recipes',
      'kv',
      'tombstones',
    ]);
    const schemaVersion = root['schemaVersion'];
    if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1) {
      throw new Invalid('malformed', '$.schemaVersion');
    }

    // Every live uid with its table: one uid, one row, one table.
    const live = new Map<string, TombstoneTable>();
    let records = 0;
    const claim = (id: string, table: TombstoneTable, path: string): void => {
      if (live.has(id)) throw new Invalid('duplicate', path);
      live.set(id, table);
      if (++records > SNAPSHOT_LIMITS.records) throw new Invalid('tooLarge', '$');
    };
    const entry = (value: unknown, path: string, table: TombstoneTable): VaultEntry => {
      const o = object(value, path, ['uid', ...FOOD_KEYS]);
      const id = uid(o, 'uid', path);
      claim(id, table, `${path}.uid`);
      return { uid: id, ...food(o, path) };
    };

    const plates = list(root['plates'], '$.plates', SNAPSHOT_LIMITS.plates).map(
      (p, i): VaultPlate => {
        const path = `$.plates[${i}]`;
        const o = object(p, path, ['uid', 'loggedAtUtc', 'entries', 'notes']);
        const id = uid(o, 'uid', path);
        claim(id, 'plate_log', `${path}.uid`);
        return {
          uid: id,
          loggedAtUtc: instant(o, 'loggedAtUtc', path),
          entries: list(o['entries'], `${path}.entries`, SNAPSHOT_LIMITS.entriesPerPlate).map(
            (e, j) => entry(e, `${path}.entries[${j}]`, 'food_entry'),
          ),
          notes: list(o['notes'], `${path}.notes`, SNAPSHOT_LIMITS.notesPerPlate).map((n, j) => {
            const np = `${path}.notes[${j}]`;
            const no = object(n, np, [
              'uid',
              'anchor',
              'questionKey',
              'noteText',
              'generatedAt',
              'interactions',
            ]);
            const noteUid = uid(no, 'uid', np);
            claim(noteUid, 'coach_note', `${np}.uid`);
            return {
              uid: noteUid,
              anchor: str(no, 'anchor', np),
              questionKey: str(no, 'questionKey', np),
              noteText: str(no, 'noteText', np),
              generatedAt: instant(no, 'generatedAt', np),
              interactions: list(
                no['interactions'],
                `${np}.interactions`,
                SNAPSHOT_LIMITS.interactionsPerNote,
              ).map((x, k) => {
                const ip = `${np}.interactions[${k}]`;
                const io = object(x, ip, ['uid', 'kind', 'at']);
                const interactionUid = uid(io, 'uid', ip);
                claim(interactionUid, 'coach_interaction', `${ip}.uid`);
                return {
                  uid: interactionUid,
                  kind: str(io, 'kind', ip),
                  at: instant(io, 'at', ip),
                };
              }),
            };
          }),
        };
      },
    );

    const dismissalKeys = new Set<string>();
    const dismissals = list(root['dismissals'], '$.dismissals', SNAPSHOT_LIMITS.dismissals).map(
      (d, i) => {
        const path = `$.dismissals[${i}]`;
        const o = object(d, path, ['key', 'dismissedAtUtc']);
        const key = formatted(
          o,
          'key',
          path,
          (k) => k !== '' && (!k.startsWith('note:') || isUuid(k.slice(5))),
        );
        if (dismissalKeys.has(key)) throw new Invalid('duplicate', `${path}.key`);
        dismissalKeys.add(key);
        if (++records > SNAPSHOT_LIMITS.records) throw new Invalid('tooLarge', '$');
        return { key, dismissedAtUtc: instant(o, 'dismissedAtUtc', path) };
      },
    );

    // A dismissal of a note travels with the note; one without it is not something a store writes.
    dismissals.forEach((d, i) => {
      if (d.key.startsWith('note:') && live.get(d.key.slice(5)) !== 'coach_note') {
        throw new Invalid('conflict', `$.dismissals[${i}].key`);
      }
    });

    const templateName = (o: Json, path: string): string =>
      formatted(o, 'name', path, (n) => n.trim() !== '');
    const items = (value: unknown, path: string, table: TombstoneTable) =>
      list(value, path, SNAPSHOT_LIMITS.itemsPerTemplate).map((item, i) =>
        entry(item, `${path}[${i}]`, table),
      );
    const savedMeals = list(root['savedMeals'], '$.savedMeals', SNAPSHOT_LIMITS.templates).map(
      (m, i): VaultSavedMeal => {
        const path = `$.savedMeals[${i}]`;
        const o = object(m, path, ['uid', 'name', 'createdAtUtc', 'updatedAtHlc', 'items']);
        const id = uid(o, 'uid', path);
        claim(id, 'saved_meal', `${path}.uid`);
        return {
          uid: id,
          name: templateName(o, path),
          createdAtUtc: instant(o, 'createdAtUtc', path),
          updatedAtHlc: hlc(o, 'updatedAtHlc', path),
          items: items(o['items'], `${path}.items`, 'saved_meal_item'),
        };
      },
    );
    const recipes = list(root['recipes'], '$.recipes', SNAPSHOT_LIMITS.templates).map(
      (r, i): VaultRecipe => {
        const path = `$.recipes[${i}]`;
        const o = object(r, path, [
          'uid',
          'name',
          'servings',
          'cookedWeightGrams',
          'createdAtUtc',
          'updatedAtHlc',
          'items',
        ]);
        const id = uid(o, 'uid', path);
        claim(id, 'recipe', `${path}.uid`);
        const servings = o['servings'];
        if (
          !Number.isInteger(servings) ||
          (servings as number) < 1 ||
          (servings as number) > 1000
        ) {
          throw new Invalid('malformed', `${path}.servings`);
        }
        return {
          uid: id,
          name: templateName(o, path),
          servings: servings as number,
          cookedWeightGrams:
            o['cookedWeightGrams'] === null
              ? null
              : formatted(o, 'cookedWeightGrams', path, (v) => isNumberText(v) && Number(v) > 0),
          createdAtUtc: instant(o, 'createdAtUtc', path),
          updatedAtHlc: hlc(o, 'updatedAtHlc', path),
          items: items(o['items'], `${path}.items`, 'recipe_item'),
        };
      },
    );

    const kvKeys = new Set<string>();
    const kv = list(root['kv'], '$.kv', SNAPSHOT_LIMITS.kv).map((e, i) => {
      const path = `$.kv[${i}]`;
      const o = object(e, path, ['key', 'value', 'updatedAtHlc']);
      const key = str(o, 'key', path);
      // Fail closed: a device-only key (or the BYOK secret) in a file is refused, never applied.
      if (!isSyncedKvKey(key)) throw new Invalid('malformed', `${path}.key`);
      if (kvKeys.has(key)) throw new Invalid('duplicate', `${path}.key`);
      kvKeys.add(key);
      return {
        key,
        value: formatted(o, 'value', path, (v) => isValidKvValue(key, v), MAX_KV_VALUE_LENGTH),
        updatedAtHlc: hlc(o, 'updatedAtHlc', path),
      };
    });

    const tombstoneUids = new Set<string>();
    const tombstones = list(root['tombstones'], '$.tombstones', SNAPSHOT_LIMITS.tombstones).map(
      (t, i): VaultTombstone => {
        const path = `$.tombstones[${i}]`;
        const o = object(t, path, ['uid', 'table', 'deletedAtHlc']);
        const table = o['table'];
        if (!TOMBSTONE_TABLES.includes(table as TombstoneTable)) {
          throw new Invalid('malformed', `${path}.table`);
        }
        const id = o['uid'];
        const valid =
          table === 'kv'
            ? typeof id === 'string' &&
              id.startsWith(KV_UID_PREFIX) &&
              isSyncedKvKey(id.slice(KV_UID_PREFIX.length))
            : isUuid(id);
        if (!valid) throw new Invalid('malformed', `${path}.uid`);
        if (tombstoneUids.has(id as string)) throw new Invalid('duplicate', `${path}.uid`);
        tombstoneUids.add(id as string);
        if (++records > SNAPSHOT_LIMITS.records) throw new Invalid('tooLarge', '$');
        // The same uid cannot be a different kind of thing live and deleted.
        const liveTable = live.get(id as string);
        if (liveTable !== undefined && liveTable !== table) {
          throw new Invalid('conflict', `${path}.uid`);
        }
        return {
          uid: id as string,
          table: table as TombstoneTable,
          deletedAtHlc: hlc(o, 'deletedAtHlc', path),
        };
      },
    );

    // A tombstone removes a plate-family record; it must not sit beside one.
    tombstones.forEach((t, i) => {
      if (PLATE_FAMILY_TABLES.includes(t.table) && live.has(t.uid)) {
        throw new Invalid('conflict', `$.tombstones[${i}].uid`);
      }
    });
    // A template or kv entry that a tombstone shadows should have been removed by the merge.
    const tombstoneByUid = new Map(tombstones.map((t) => [t.uid, t.deletedAtHlc]));
    const shadowed = (id: string, stamp: string): boolean => {
      const deleted = tombstoneByUid.get(id);
      return deleted !== undefined && compareHlc(stamp, deleted) <= 0;
    };
    savedMeals.forEach((m, i) => {
      if (shadowed(m.uid, m.updatedAtHlc)) throw new Invalid('conflict', `$.savedMeals[${i}].uid`);
    });
    recipes.forEach((r, i) => {
      if (shadowed(r.uid, r.updatedAtHlc)) throw new Invalid('conflict', `$.recipes[${i}].uid`);
    });
    kv.forEach((e, i) => {
      if (shadowed(kvTombstoneUid(e.key), e.updatedAtHlc)) {
        throw new Invalid('conflict', `$.kv[${i}].key`);
      }
    });

    return {
      kind: 'vaultSnapshotParsed',
      snapshot: canonicalizeSnapshot({
        snapshotVersion: SNAPSHOT_VERSION,
        schemaVersion: schemaVersion as number,
        plates,
        dismissals,
        savedMeals,
        recipes,
        kv,
        tombstones,
      }),
    };
  } catch (error) {
    if (error instanceof Invalid) {
      return { kind: 'vaultSnapshotInvalid', problem: error.problem, path: error.path };
    }
    throw error;
  }
}
