// Test support: seeded random vault snapshots over a SMALL universe of uids, stamps and values, so
// that two of them overlap a lot and often hold one uid at one stamp with different content (the
// ties that merging and applying must settle identically). The core has its own copy for the pure
// merge properties (packages/core/test/vault-fixtures.ts).

import {
  formatHlc,
  mergeVaultSnapshots,
  SNAPSHOT_VERSION,
  type VaultEntry,
  type VaultSnapshot,
} from '@anc/core';
import { SCHEMA_VERSION } from '../constants';

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

const entry = (id: number, name: string): VaultEntry => ({
  uid: uuid(id),
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

export const emptySnapshot = (): VaultSnapshot => ({
  snapshotVersion: SNAPSHOT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  plates: [],
  dismissals: [],
  savedMeals: [],
  recipes: [],
  kv: [],
  tombstones: [],
});

export function mergeSnapshots(local: VaultSnapshot, remote: VaultSnapshot): VaultSnapshot {
  const result = mergeVaultSnapshots(local, remote);
  if (result.kind !== 'vaultMerged') throw new Error(`merge refused: ${result.reason}`);
  return result.snapshot;
}

const KV_VALUES: Readonly<Record<string, readonly string[]>> = {
  'ui.locale': ['system', 'en', 'fr'],
  profile: ['{}', '{"sex":"female"}'],
  'export.lastAtUtc': ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
};

export function randomVaultSnapshot(random: () => number): VaultSnapshot {
  const pick = (n: number): number => Math.floor(random() * n);
  const chance = (p: number): boolean => random() < p;
  const oneOf = <T>(items: readonly T[]): T => items[pick(items.length)] as T;
  const when = (): string =>
    formatHlc({
      wallMs: 1000 + pick(4),
      counter: pick(2),
      deviceId: chance(0.5) ? 'aaaaaaaaaaaaaaaa' : 'bbbbbbbbbbbbbbbb',
    });
  const names = ['Alpha', 'Beta', 'Gamma'];

  const plates = [];
  const noteUids: string[] = [];
  for (let p = 1; p <= 4; p++) {
    if (!chance(0.6)) continue;
    const entries = [];
    for (let e = 1; e <= 3; e++)
      if (chance(0.6)) entries.push(entry(p * 100 + e, `Food ${p}.${e}`));
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

  return mergeSnapshots(emptySnapshot(), {
    ...emptySnapshot(),
    plates,
    savedMeals,
    recipes,
    kv,
    tombstones,
    dismissals,
  });
}
