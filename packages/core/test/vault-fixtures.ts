// Test support for the vault tests: a seeded generator (no dependency, reproducible failures) and
// builders for snapshots drawn from a SMALL universe of uids, stamps and values, so that two random
// snapshots overlap a lot and often hold the same uid at the SAME stamp with DIFFERENT content,
// which is where merging can go wrong.
import {
  formatHlc,
  mergeVaultSnapshots,
  SNAPSHOT_VERSION,
  type VaultEntry,
  type VaultSnapshot,
} from '../src/index';

/** mulberry32: small, fast, good enough, and the same sequence for the same seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uuid = (n: number): string =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

export const DEVICE_A = 'aaaaaaaaaaaaaaaa';
export const DEVICE_B = 'bbbbbbbbbbbbbbbb';

export const stamp = (wallMs: number, counter = 0, deviceId = DEVICE_A): string =>
  formatHlc({ wallMs, counter, deviceId });

export const food = (name: string): Omit<VaultEntry, 'uid'> => ({
  sourceRef: `manual:${name}`,
  displayName: name,
  source: 'manual',
  foodGroup: 'other',
  quantityLow: '1',
  quantityHigh: '2',
  quantityUnit: 'piece',
  quantityDisplayLabel: '~1-2 pieces',
  quantityGrams: null,
  quantityGramsEstimated: null,
  nutrientsPer100g: null,
  foodExtra: null,
});

export const entry = (id: number, name = `Food ${id}`): VaultEntry => ({
  uid: uuid(id),
  ...food(name),
});

export function snapshot(parts: Partial<VaultSnapshot> = {}): VaultSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    schemaVersion: 4,
    plates: [],
    dismissals: [],
    savedMeals: [],
    recipes: [],
    kv: [],
    tombstones: [],
    ...parts,
  };
}

/** Merge two snapshots of one schema; the result is a snapshot, never a refusal. */
export function mergeOk(local: VaultSnapshot, remote: VaultSnapshot): VaultSnapshot {
  const result = mergeVaultSnapshots(local, remote);
  if (result.kind !== 'vaultMerged') throw new Error(`merge refused: ${result.reason}`);
  return result.snapshot;
}

/** The values a synced key may hold, so the content of a kv entry differs between snapshots. */
const KV_VALUES: Readonly<Record<string, readonly string[]>> = {
  'ui.locale': ['system', 'en', 'fr'],
  profile: ['{}', '{"sex":"female"}', '{"sex":"male"}'],
  'export.lastAtUtc': ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
};

/**
 * A random snapshot over a small universe. Plate `p` owns entries `100p+1..`, notes `100p+50..`
 * and interactions `1000p+500..`, so a uid always lives under the same parent. The content of a
 * saved meal, recipe or kv entry is drawn independently of its stamp, so two snapshots often hold
 * one uid at one stamp with different content (a tie the merge must settle the same way on every
 * device). A note dismissal is only made for a note the same snapshot holds. The result is
 * normalised through the merge so it obeys the snapshot invariants.
 */
export function randomSnapshot(random: () => number): VaultSnapshot {
  const pick = (n: number): number => Math.floor(random() * n);
  const chance = (p: number): boolean => random() < p;
  const oneOf = <T>(items: readonly T[]): T => items[pick(items.length)] as T;
  const device = (): string => (chance(0.5) ? DEVICE_A : DEVICE_B);
  const when = (): string => stamp(1000 + pick(4), pick(2), device());

  const plates = [];
  const noteUids: string[] = [];
  for (let p = 1; p <= 4; p++) {
    if (!chance(0.6)) continue;
    const entries = [];
    for (let e = 1; e <= 3; e++) if (chance(0.6)) entries.push(entry(p * 100 + e));
    const notes = [];
    for (let n = 0; n < 2; n++) {
      if (!chance(0.5)) continue;
      const interactions = [];
      for (let i = 0; i < 2; i++) {
        if (chance(0.5)) {
          interactions.push({
            uid: uuid(p * 1000 + n * 10 + i + 500),
            kind: 'sure',
            at: '2026-01-01T00:00:00.000Z',
          });
        }
      }
      noteUids.push(uuid(p * 100 + 50 + n));
      notes.push({
        uid: uuid(p * 100 + 50 + n),
        anchor: 'postResolve',
        questionKey: 'k',
        noteText: `Note ${p}.${n}`,
        generatedAt: '2026-01-01T00:00:00.000Z',
        interactions,
      });
    }
    plates.push({ uid: uuid(p), loggedAtUtc: `2026-01-0${p}T12:00:00.000Z`, entries, notes });
  }

  const itemBase = (templateUid: string): number => parseInt(templateUid.slice(-12), 16) * 10;
  const names = ['Alpha', 'Beta', 'Gamma'];
  const templates = (base: number) => {
    const out = [];
    for (let t = 1; t <= 3; t++) {
      if (!chance(0.6)) continue;
      const id = uuid(base + t);
      out.push({
        uid: id,
        updatedAtHlc: when(),
        name: oneOf(names),
        createdAtUtc: '2026-01-01T00:00:00.000Z',
        items: [entry(itemBase(id), oneOf(names)), entry(itemBase(id) + 1, oneOf(names))].slice(
          0,
          1 + pick(2),
        ),
      });
    }
    return out;
  };
  const savedMeals = templates(9000);
  const recipes = templates(9500).map((r) => ({
    ...r,
    servings: 1 + pick(3),
    cookedWeightGrams: oneOf([null, '500']),
  }));

  const kv = Object.keys(KV_VALUES)
    .filter(() => chance(0.5))
    .map((key) => ({ key, value: oneOf(KV_VALUES[key] ?? []), updatedAtHlc: when() }));

  const tombstones = [];
  for (let p = 1; p <= 4; p++) {
    if (chance(0.2))
      tombstones.push({ uid: uuid(p), table: 'plate_log' as const, deletedAtHlc: when() });
    if (chance(0.15)) {
      tombstones.push({
        uid: uuid(p * 100 + 1),
        table: 'food_entry' as const,
        deletedAtHlc: when(),
      });
    }
    if (chance(0.15)) {
      tombstones.push({
        uid: uuid(p * 100 + 50),
        table: 'coach_note' as const,
        deletedAtHlc: when(),
      });
    }
  }
  for (const [base, table, itemTable] of [
    [9000, 'saved_meal', 'saved_meal_item'],
    [9500, 'recipe', 'recipe_item'],
  ] as const) {
    for (let t = 1; t <= 3; t++) {
      if (chance(0.25)) tombstones.push({ uid: uuid(base + t), table, deletedAtHlc: when() });
      if (chance(0.15)) {
        tombstones.push({
          uid: uuid(itemBase(uuid(base + t))),
          table: itemTable,
          deletedAtHlc: when(),
        });
      }
    }
  }
  for (const key of Object.keys(KV_VALUES)) {
    if (chance(0.2))
      tombstones.push({ uid: `kv:${key}`, table: 'kv' as const, deletedAtHlc: when() });
  }

  const dismissals = noteUids
    .filter(() => chance(0.5))
    .map((id) => ({ key: `note:${id}`, dismissedAtUtc: `2026-01-0${1 + pick(5)}T00:00:00.000Z` }));
  if (chance(0.5)) {
    dismissals.push({
      key: 'openPlate:2026-01-01:breakfast',
      dismissedAtUtc: '2026-01-02T00:00:00.000Z',
    });
  }

  return mergeOk(snapshot(), snapshot({ plates, savedMeals, recipes, kv, tombstones, dismissals }));
}
