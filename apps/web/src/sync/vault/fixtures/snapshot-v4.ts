// A FROZEN schema v4 snapshot, as the app before schema v5 wrote it (snapshot version 1, schema 4):
// no `bodyMeasurements` at the root and no `slot` on a plate. Written out by hand from the v4 shape
// (`git show bac1afd:packages/core/src/vault/snapshot.ts`), never built from the current types, so a
// future change cannot quietly move it. Every `.ancvault` and relay copy made before schema v5 looks
// like this, and they must stay readable.
export const SNAPSHOT_V4 = {
  snapshotVersion: 1,
  schemaVersion: 4,
  plates: [
    {
      uid: '00000000-0000-7000-8000-000000000001',
      loggedAtUtc: '2026-01-01T12:00:00.000Z',
      entries: [
        {
          uid: '00000000-0000-7000-8000-000000000101',
          sourceRef: 'manual:Rice',
          displayName: 'Rice',
          source: 'manual',
          foodGroup: 'starch',
          quantityLow: '1',
          quantityHigh: '2',
          quantityUnit: 'piece',
          quantityDisplayLabel: '~1-2 pieces',
          quantityGrams: null,
          quantityGramsEstimated: null,
          nutrientsPer100g: null,
          foodExtra: null,
        },
      ],
      notes: [],
    },
  ],
  dismissals: [],
  savedMeals: [],
  recipes: [],
  kv: [
    {
      key: 'ui.locale',
      value: 'fr',
      updatedAtHlc: '0000000000007-0000-aaaaaaaaaaaaaaaa',
    },
  ],
  tombstones: [
    {
      uid: '00000000-0000-7000-8000-000000000003',
      table: 'plate_log',
      deletedAtHlc: '0000000000008-0000-aaaaaaaaaaaaaaaa',
    },
  ],
} as const;
