// Merging two vault snapshots (this device's and another's) into one. Pure and deterministic: the
// result depends only on the two states, never on which one is "local", and merging is
// commutative, associative and idempotent, so any number of devices converge whatever order the
// snapshots reach them in. The property tests in test/vault-merge.test.ts hold it to that.
//
// The rules (docs/encrypted-sync-plan.md §3.4, docs/adr/0007-encrypted-vault.md):
//   plates, entries, coach notes, interactions   union by uid; a tombstone ALWAYS wins and removes
//                                                the record (and, for a plate, all it holds);
//   saved meals and recipes                      last writer wins on `updatedAtHlc`, the whole
//                                                record with its items; a tombstone wins unless the
//                                                record was written after it;
//   kv                                           last writer wins per key, same tombstone rule;
//   coach dismissals                             union, the latest time per key;
//   tombstones                                   union, the latest stamp per (table, uid). They are
//                                                NEVER dropped here (dropping one because a newer
//                                                write shadows it would make the result depend on
//                                                the order of merging); pruning is a later job.
// "Which version wins" is decided by pickStamped / survivesTombstone (decide.ts), the same functions
// the stores use when they apply a snapshot, so merging and applying cannot disagree.

import { pickLarger, pickStamped, survivesTombstone } from './decide';
import { compareHlc } from './hlc';
import {
  canonicalizeSnapshot,
  KV_UID_PREFIX,
  PLATE_FAMILY_TABLES,
  SNAPSHOT_VERSION,
  tombstoneKey,
  vaultConflict,
  type TombstoneTable,
  type VaultCoachNote,
  type VaultDismissal,
  type VaultInteraction,
  type VaultPlate,
  type VaultSnapshot,
  type VaultTombstone,
} from './snapshot';

export type VaultMergeResult =
  | { readonly kind: 'vaultMerged'; readonly snapshot: VaultSnapshot }
  /** The remote data comes from a newer store schema than this device understands. */
  | { readonly kind: 'vaultMergeRefused'; readonly reason: 'remoteSchemaNewer' | 'uidConflict' };

/** Union of `a` and `b` by `keyOf`; a clash is settled by `pick` (which must be symmetric). */
function union<T>(
  a: readonly T[],
  b: readonly T[],
  keyOf: (item: T) => string,
  pick: (x: T, y: T) => T,
): T[] {
  const out = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const key = keyOf(item);
    const existing = out.get(key);
    out.set(key, existing === undefined ? item : pick(existing, item));
  }
  return [...out.values()];
}

const uidOf = (item: { readonly uid: string }): string => item.uid;

function mergeTombstones(a: readonly VaultTombstone[], b: readonly VaultTombstone[]) {
  return union(
    a,
    b,
    (t) => tombstoneKey(t.table, t.uid),
    (x, y) => {
      const order = compareHlc(x.deletedAtHlc, y.deletedAtHlc);
      return order !== 0 ? (order > 0 ? x : y) : pickLarger(x, y);
    },
  );
}

function mergeInteractions(
  a: readonly VaultInteraction[],
  b: readonly VaultInteraction[],
  dead: ReadonlySet<string>,
): VaultInteraction[] {
  return union(a, b, uidOf, pickLarger).filter((i) => !dead.has(i.uid));
}

const bare = (note: VaultCoachNote): VaultCoachNote => ({ ...note, interactions: [] });

function mergeNotes(
  a: readonly VaultCoachNote[],
  b: readonly VaultCoachNote[],
  dead: ReadonlySet<string>,
): VaultCoachNote[] {
  const byUid = new Map<string, { a?: VaultCoachNote; b?: VaultCoachNote }>();
  for (const note of a) byUid.set(note.uid, { ...byUid.get(note.uid), a: note });
  for (const note of b) byUid.set(note.uid, { ...byUid.get(note.uid), b: note });
  const out: VaultCoachNote[] = [];
  for (const [id, pair] of byUid) {
    if (dead.has(id)) continue;
    const { a: x, b: y } = pair;
    // The note's own text never changes after it is written; interactions are appended.
    const base = x === undefined ? y : y === undefined ? x : pickLarger(bare(x), bare(y));
    if (base === undefined) continue;
    out.push({
      ...base,
      interactions: mergeInteractions(x?.interactions ?? [], y?.interactions ?? [], dead),
    });
  }
  return out;
}

function mergePlates(
  a: readonly VaultPlate[],
  b: readonly VaultPlate[],
  dead: ReadonlySet<string>,
): VaultPlate[] {
  const byUid = new Map<string, { a?: VaultPlate; b?: VaultPlate }>();
  for (const plate of a) byUid.set(plate.uid, { ...byUid.get(plate.uid), a: plate });
  for (const plate of b) byUid.set(plate.uid, { ...byUid.get(plate.uid), b: plate });
  const head = (plate: VaultPlate | undefined) =>
    plate === undefined ? undefined : { uid: plate.uid, loggedAtUtc: plate.loggedAtUtc };
  const out: VaultPlate[] = [];
  for (const [id, { a: x, b: y }] of byUid) {
    if (dead.has(id)) continue;
    const [hx, hy] = [head(x), head(y)];
    const base = hx === undefined ? hy : hy === undefined ? hx : pickLarger(hx, hy);
    if (base === undefined) continue;
    out.push({
      uid: base.uid,
      loggedAtUtc: base.loggedAtUtc,
      entries: union(x?.entries ?? [], y?.entries ?? [], uidOf, pickLarger).filter(
        (e) => !dead.has(e.uid),
      ),
      notes: mergeNotes(x?.notes ?? [], y?.notes ?? [], dead),
    });
  }
  return out;
}

/** The record with the later stamp wins; a tombstone at or after that stamp removes it. */
function mergeStamped<T extends { readonly updatedAtHlc: string }>(
  a: readonly T[],
  b: readonly T[],
  keyOf: (item: T) => string,
  deletedAt: (key: string) => string | undefined,
): T[] {
  return union(a, b, keyOf, pickStamped).filter((record) =>
    survivesTombstone(record.updatedAtHlc, deletedAt(keyOf(record))),
  );
}

function mergeDismissals(
  a: readonly VaultDismissal[],
  b: readonly VaultDismissal[],
  deadNotes: ReadonlySet<string>,
): VaultDismissal[] {
  return union(
    a,
    b,
    (d) => d.key,
    (x, y) =>
      x.dismissedAtUtc === y.dismissedAtUtc ? x : x.dismissedAtUtc > y.dismissedAtUtc ? x : y,
  ).filter((d) => !(d.key.startsWith('note:') && deadNotes.has(d.key.slice(5))));
}

/**
 * Merge `remote` into `local`. Refused (typed, nothing merged) when the remote comes from a newer
 * store schema than the local one, or when the two use one uid for different things. Otherwise the
 * result is symmetric: for snapshots of the same schema, `merge(a, b)` equals `merge(b, a)`.
 */
export function mergeVaultSnapshots(local: VaultSnapshot, remote: VaultSnapshot): VaultMergeResult {
  if (remote.schemaVersion > local.schemaVersion) {
    return { kind: 'vaultMergeRefused', reason: 'remoteSchemaNewer' };
  }
  if (vaultConflict(local, remote)) return { kind: 'vaultMergeRefused', reason: 'uidConflict' };

  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const deletedAt = new Map(tombstones.map((t) => [tombstoneKey(t.table, t.uid), t.deletedAtHlc]));
  const stampOf = (table: TombstoneTable) => (uid: string) =>
    deletedAt.get(tombstoneKey(table, uid));
  const dead = new Set(
    tombstones.filter((t) => PLATE_FAMILY_TABLES.includes(t.table)).map((t) => t.uid),
  );
  // A note is gone when it is tombstoned itself or its plate is (a dismissal travels with its note).
  const deadNotes = new Set(tombstones.filter((t) => t.table === 'coach_note').map((t) => t.uid));
  for (const plate of [...local.plates, ...remote.plates]) {
    if (dead.has(plate.uid)) for (const note of plate.notes) deadNotes.add(note.uid);
  }
  const kvDeletedAt = (key: string) => deletedAt.get(tombstoneKey('kv', `${KV_UID_PREFIX}${key}`));
  return {
    kind: 'vaultMerged',
    snapshot: canonicalizeSnapshot({
      snapshotVersion: SNAPSHOT_VERSION,
      schemaVersion: local.schemaVersion,
      plates: mergePlates(local.plates, remote.plates, dead),
      dismissals: mergeDismissals(local.dismissals, remote.dismissals, deadNotes),
      savedMeals: mergeStamped(local.savedMeals, remote.savedMeals, uidOf, stampOf('saved_meal')),
      recipes: mergeStamped(local.recipes, remote.recipes, uidOf, stampOf('recipe')),
      kv: mergeStamped(local.kv, remote.kv, (e) => e.key, kvDeletedAt),
      tombstones,
    }),
  };
}
