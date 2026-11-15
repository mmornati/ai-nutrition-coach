import { describe, expect, it } from 'vitest';
import {
  measurementUid,
  mergeVaultSnapshots,
  parseVaultSnapshot,
  type VaultMeasurement,
  type VaultSnapshot,
} from '../src/index';
import {
  entry,
  mergeOk as merge,
  randomSnapshot,
  seeded,
  snapshot,
  stamp,
  uuid,
} from './vault-fixtures';

const plate = (
  id: number,
  entries = [entry(id * 100 + 1)],
  notes: VaultSnapshot['plates'][number]['notes'] = [],
) => ({
  uid: uuid(id),
  loggedAtUtc: `2026-01-0${id}T12:00:00.000Z`,
  slot: null,
  entries,
  notes,
});
const note = (id: number, interactions: { uid: string; kind: string; at: string }[] = []) => ({
  uid: uuid(id),
  anchor: 'postResolve',
  questionKey: 'k',
  noteText: 'text',
  generatedAt: '2026-01-01T12:00:00.000Z',
  interactions,
});
const meal = (id: number, name: string, at: string, items = [entry(id * 10)]) => ({
  uid: uuid(id),
  name,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtHlc: at,
  items,
});

describe('merge rules', () => {
  it('unions plates and their entries, notes and interactions by uid', () => {
    const a = snapshot({
      plates: [plate(1, [entry(101)], [note(150, [{ uid: uuid(1500), kind: 'sure', at: 'a' }])])],
    });
    const b = snapshot({
      plates: [
        plate(
          1,
          [entry(101), entry(102)],
          [note(150, [{ uid: uuid(1501), kind: 'later', at: 'b' }])],
        ),
        plate(2),
      ],
    });
    const merged = merge(a, b);
    expect(merged.plates.map((p) => p.uid)).toEqual([uuid(1), uuid(2)]);
    expect(merged.plates[0]?.entries.map((e) => e.uid)).toEqual([uuid(101), uuid(102)]);
    expect(merged.plates[0]?.notes[0]?.interactions.map((i) => i.uid)).toEqual([
      uuid(1500),
      uuid(1501),
    ]);
  });

  it('a tombstone removes the plate and everything under it, whichever side holds it', () => {
    const live = snapshot({ plates: [plate(1, [entry(101)], [note(150)]), plate(2)] });
    const deleted = snapshot({
      tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(5) }],
    });
    for (const merged of [merge(live, deleted), merge(deleted, live)]) {
      expect(merged.plates.map((p) => p.uid)).toEqual([uuid(2)]);
      expect(merged.tombstones.map((t) => t.uid)).toEqual([uuid(1)]);
    }
  });

  it('a tombstone for a child removes only that child, and its note dismissal', () => {
    const live = snapshot({
      plates: [plate(1, [entry(101), entry(102)], [note(150), note(151)])],
      dismissals: [
        { key: `note:${uuid(150)}`, dismissedAtUtc: '2026-01-01T00:00:00.000Z' },
        { key: `note:${uuid(151)}`, dismissedAtUtc: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const deleted = snapshot({
      tombstones: [
        { uid: uuid(101), table: 'food_entry', deletedAtHlc: stamp(5) },
        { uid: uuid(150), table: 'coach_note', deletedAtHlc: stamp(5) },
      ],
    });
    const merged = merge(live, deleted);
    expect(merged.plates[0]?.entries.map((e) => e.uid)).toEqual([uuid(102)]);
    expect(merged.plates[0]?.notes.map((n) => n.uid)).toEqual([uuid(151)]);
    expect(merged.dismissals.map((d) => d.key)).toEqual([`note:${uuid(151)}`]);
  });

  it('a plate tombstone wins even over a later write elsewhere (plates are never edited)', () => {
    const merged = merge(
      snapshot({ plates: [plate(1)] }),
      snapshot({ tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(1) }] }),
    );
    expect(merged.plates).toEqual([]);
  });

  it('saved meals and recipes: the later stamp wins as a whole record, items included', () => {
    const older = meal(9001, 'Old name', stamp(5), [entry(1), entry(2)]);
    const newer = meal(9001, 'New name', stamp(6), [entry(3)]);
    for (const merged of [
      merge(snapshot({ savedMeals: [older] }), snapshot({ savedMeals: [newer] })),
      merge(snapshot({ savedMeals: [newer] }), snapshot({ savedMeals: [older] })),
    ]) {
      expect(merged.savedMeals).toEqual([newer]);
    }
    // Same millisecond: the counter, then the device, order the writes.
    const a = meal(9002, 'A', stamp(5, 1, 'aaaaaaaaaaaaaaaa'));
    const b = meal(9002, 'B', stamp(5, 1, 'bbbbbbbbbbbbbbbb'));
    expect(
      merge(snapshot({ savedMeals: [a] }), snapshot({ savedMeals: [b] })).savedMeals[0]?.name,
    ).toBe('B');
    const recipe = (name: string, at: string) => ({
      uid: uuid(9501),
      name,
      servings: 2,
      cookedWeightGrams: null,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
      updatedAtHlc: at,
      items: [entry(1)],
    });
    expect(
      merge(
        snapshot({ recipes: [recipe('x', stamp(1))] }),
        snapshot({ recipes: [recipe('y', stamp(2))] }),
      ).recipes[0]?.name,
    ).toBe('y');
  });

  it('a template tombstone wins unless the record was written after it', () => {
    const tomb = (at: string) => ({
      uid: uuid(9001),
      table: 'saved_meal' as const,
      deletedAtHlc: at,
    });
    const record = meal(9001, 'Kept', stamp(5));
    expect(
      merge(snapshot({ savedMeals: [record] }), snapshot({ tombstones: [tomb(stamp(6))] }))
        .savedMeals,
    ).toEqual([]);
    expect(
      merge(snapshot({ savedMeals: [record] }), snapshot({ tombstones: [tomb(stamp(5))] }))
        .savedMeals,
    ).toEqual([]);
    const survived = merge(
      snapshot({ savedMeals: [record] }),
      snapshot({ tombstones: [tomb(stamp(4))] }),
    );
    expect(survived.savedMeals).toEqual([record]);
    // The tombstone is kept: dropping it would make the result depend on the order of merging.
    expect(survived.tombstones).toHaveLength(1);
  });

  it('kv: last writer wins per key; a delete (tombstone) wins unless the write is newer', () => {
    const entryAt = (value: string, at: string) => ({ key: 'ui.locale', value, updatedAtHlc: at });
    const merged = merge(
      snapshot({
        kv: [entryAt('en', stamp(5)), { key: 'profile', value: '{}', updatedAtHlc: stamp(1) }],
      }),
      snapshot({ kv: [entryAt('fr', stamp(6))] }),
    );
    expect(merged.kv.map((e) => [e.key, e.value])).toEqual([
      ['profile', '{}'],
      ['ui.locale', 'fr'],
    ]);
    const deleted = snapshot({
      tombstones: [{ uid: 'kv:ui.locale', table: 'kv', deletedAtHlc: stamp(7) }],
    });
    expect(merge(merged, deleted).kv.map((e) => e.key)).toEqual(['profile']);
    const rewritten = snapshot({ kv: [entryAt('de', stamp(8))] });
    expect(merge(merge(merged, deleted), rewritten).kv.map((e) => e.value)).toEqual(['{}', 'de']);
  });

  it('dismissals union with the latest time per key; tombstones union with the latest stamp', () => {
    const merged = merge(
      snapshot({
        dismissals: [
          { key: 'openPlate:2026-01-01:lunch', dismissedAtUtc: '2026-01-01T10:00:00.000Z' },
          { key: 'a', dismissedAtUtc: '2026-01-03T00:00:00.000Z' },
        ],
        tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(5) }],
      }),
      snapshot({
        dismissals: [{ key: 'a', dismissedAtUtc: '2026-01-02T00:00:00.000Z' }],
        tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(9) }],
      }),
    );
    expect(merged.dismissals).toEqual([
      { key: 'a', dismissedAtUtc: '2026-01-03T00:00:00.000Z' },
      { key: 'openPlate:2026-01-01:lunch', dismissedAtUtc: '2026-01-01T10:00:00.000Z' },
    ]);
    expect(merged.tombstones).toEqual([
      { uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(9) },
    ]);
  });

  it('refuses a remote from a newer schema; an older remote merges, and the local version stays', () => {
    const refused = mergeVaultSnapshots(
      snapshot({ schemaVersion: 4 }),
      snapshot({ schemaVersion: 5 }),
    );
    expect(refused).toEqual({ kind: 'vaultMergeRefused', reason: 'remoteSchemaNewer' });
    const older = mergeVaultSnapshots(
      snapshot({ schemaVersion: 5 }),
      snapshot({ schemaVersion: 4 }),
    );
    expect(older.kind === 'vaultMerged' ? older.snapshot.schemaVersion : null).toBe(5);
    const same = merge(snapshot(), snapshot());
    expect(parseVaultSnapshot(same).kind).toBe('vaultSnapshotParsed');
  });

  it('refuses snapshots that use one uid for different things', () => {
    const a = snapshot({ plates: [plate(1, [entry(101)])] });
    const b = snapshot({
      savedMeals: [meal(101, 'Same uid as an entry', stamp(1))],
    });
    expect(mergeVaultSnapshots(a, b)).toEqual({ kind: 'vaultMergeRefused', reason: 'uidConflict' });
    expect(mergeVaultSnapshots(b, a)).toEqual({ kind: 'vaultMergeRefused', reason: 'uidConflict' });
  });

  it('settles a tie (same uid, same stamp, different content) the same way from either side', () => {
    const at = stamp(5, 0, 'aaaaaaaaaaaaaaaa');
    const x = snapshot({ savedMeals: [meal(9001, 'Alpha', at, [entry(1, 'Oats')])] });
    const y = snapshot({ savedMeals: [meal(9001, 'Beta', at, [entry(1, 'Rice')])] });
    expect(merge(x, y)).toEqual(merge(y, x));
    expect(merge(x, y).savedMeals).toHaveLength(1);
    const kvX = snapshot({ kv: [{ key: 'ui.locale', value: 'en', updatedAtHlc: at }] });
    const kvY = snapshot({ kv: [{ key: 'ui.locale', value: 'fr', updatedAtHlc: at }] });
    expect(merge(kvX, kvY)).toEqual(merge(kvY, kvX));
  });

  it('a tombstone is looked up by table and uid: another kind of record is not affected', () => {
    const live = snapshot({ savedMeals: [meal(9001, 'Kept', stamp(5))] });
    const wrongKind = snapshot({
      tombstones: [{ uid: uuid(9001), table: 'recipe', deletedAtHlc: stamp(9) }],
    });
    // The same uid as two kinds of record is refused outright rather than guessed at.
    expect(mergeVaultSnapshots(live, wrongKind).kind).toBe('vaultMergeRefused');
  });

  it('removing a plate removes the dismissals of its notes', () => {
    const live = snapshot({
      plates: [plate(1, [entry(101)], [note(150)])],
      dismissals: [{ key: `note:${uuid(150)}`, dismissedAtUtc: '2026-01-01T00:00:00.000Z' }],
    });
    const deleted = snapshot({
      tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(5) }],
    });
    expect(merge(live, deleted).dismissals).toEqual([]);
    expect(merge(deleted, live).dismissals).toEqual([]);
  });

  it('does not modify its inputs', () => {
    const a = randomSnapshot(seeded(5));
    const b = randomSnapshot(seeded(6));
    const before = JSON.stringify([a, b]);
    merge(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

describe('merge properties (seeded random snapshots)', () => {
  const RUNS = 400;
  const cases = (seed: number, count: number): VaultSnapshot[] => {
    const random = seeded(seed);
    return Array.from({ length: count }, () => randomSnapshot(random));
  };

  it('is commutative: merge(a, b) equals merge(b, a)', () => {
    const random = seeded(101);
    for (let i = 0; i < RUNS; i++) {
      const [a, b] = [randomSnapshot(random), randomSnapshot(random)];
      expect(merge(a, b)).toEqual(merge(b, a));
    }
  });

  it('is idempotent: merge(a, a) equals a, and merging again changes nothing', () => {
    const random = seeded(102);
    for (let i = 0; i < RUNS; i++) {
      const [a, b] = [randomSnapshot(random), randomSnapshot(random)];
      expect(merge(a, a)).toEqual(a);
      const once = merge(a, b);
      expect(merge(once, a)).toEqual(once);
      expect(merge(once, b)).toEqual(once);
      expect(merge(once, once)).toEqual(once);
    }
  });

  it('is associative: merge(merge(a, b), c) equals merge(a, merge(b, c))', () => {
    const random = seeded(103);
    for (let i = 0; i < RUNS; i++) {
      const [a, b, c] = [randomSnapshot(random), randomSnapshot(random), randomSnapshot(random)];
      expect(merge(merge(a, b), c)).toEqual(merge(a, merge(b, c)));
    }
  });

  it('converges: any order of merging many devices gives one result', () => {
    for (const set of Array.from({ length: 40 }, (_, i) => cases(900 + i, 4))) {
      const forward = set.reduce((x, y) => merge(x, y));
      const backward = [...set].reverse().reduce((x, y) => merge(x, y));
      const tree = merge(
        merge(set[0] as VaultSnapshot, set[3] as VaultSnapshot),
        merge(set[2] as VaultSnapshot, set[1] as VaultSnapshot),
      );
      expect(backward).toEqual(forward);
      expect(tree).toEqual(forward);
    }
  });

  it('a tombstone wins: no deleted plate-family record survives any merge', () => {
    const random = seeded(104);
    for (let i = 0; i < RUNS; i++) {
      const [a, b] = [randomSnapshot(random), randomSnapshot(random)];
      const merged = merge(a, b);
      const dead = new Set([...a.tombstones, ...b.tombstones].map((t) => t.uid));
      for (const p of merged.plates) {
        expect(dead.has(p.uid)).toBe(false);
        for (const e of p.entries) expect(dead.has(e.uid)).toBe(false);
        for (const n of p.notes) {
          expect(dead.has(n.uid)).toBe(false);
          for (const x of n.interactions) expect(dead.has(x.uid)).toBe(false);
        }
      }
      for (const t of [...a.tombstones, ...b.tombstones]) {
        expect(merged.tombstones.some((m) => m.uid === t.uid)).toBe(true);
      }
    }
  });

  it('never loses a live record that no tombstone covers', () => {
    const random = seeded(105);
    for (let i = 0; i < RUNS; i++) {
      const [a, b] = [randomSnapshot(random), randomSnapshot(random)];
      const merged = merge(a, b);
      const dead = new Set([...a.tombstones, ...b.tombstones].map((t) => t.uid));
      const mergedEntries = new Set(merged.plates.flatMap((p) => p.entries.map((e) => e.uid)));
      for (const p of [...a.plates, ...b.plates]) {
        if (dead.has(p.uid)) continue;
        for (const e of p.entries)
          if (!dead.has(e.uid)) expect(mergedEntries.has(e.uid)).toBe(true);
      }
    }
  });

  it('every merge result is a valid snapshot', () => {
    const random = seeded(106);
    for (let i = 0; i < 200; i++) {
      const merged = merge(randomSnapshot(random), randomSnapshot(random));
      const parsed = parseVaultSnapshot(JSON.parse(JSON.stringify(merged)));
      expect(parsed.kind).toBe('vaultSnapshotParsed');
    }
  });
});

describe('body measurements and the plate meal', () => {
  const weight = (day: string, value: string, at: string): VaultMeasurement => ({
    uid: measurementUid('weight', day),
    kind: 'weight',
    day,
    measuredAtUtc: `${day}T07:00:00.000Z`,
    value,
    updatedAtHlc: at,
  });

  it('two devices recording the same day settle on the later write, in either order', () => {
    const a = snapshot({ bodyMeasurements: [weight('2026-01-02', '70', stamp(10))] });
    const b = snapshot({ bodyMeasurements: [weight('2026-01-02', '71', stamp(11))] });
    expect(merge(a, b).bodyMeasurements.map((m) => m.value)).toEqual(['71']);
    expect(merge(b, a)).toEqual(merge(a, b));
  });

  it('different days are all kept; a tombstone wins unless the record was written after it', () => {
    const uid = measurementUid('weight', '2026-01-02');
    const a = snapshot({
      bodyMeasurements: [
        weight('2026-01-01', '70', stamp(1)),
        weight('2026-01-02', '71', stamp(5)),
      ],
    });
    const gone = snapshot({
      tombstones: [{ uid, table: 'body_measurement', deletedAtHlc: stamp(9) }],
    });
    const merged = merge(a, gone);
    expect(merged.bodyMeasurements.map((m) => m.day)).toEqual(['2026-01-01']);
    expect(merge(gone, a)).toEqual(merged);
    // Re-entered after the delete: the later stamp outlives the tombstone.
    const again = snapshot({ bodyMeasurements: [weight('2026-01-02', '72', stamp(12))] });
    expect(
      merge(merged, again)
        .bodyMeasurements.map((m) => m.value)
        .sort(),
    ).toEqual(['70', '72']);
  });

  it('resurrection: deleted at h1, re-entered at h2, edited on another replica at h1.5, settles on h2 in every order and grouping', () => {
    const day = '2026-01-02';
    const uid = measurementUid('weight', day);
    const deleted = snapshot({
      tombstones: [{ uid, table: 'body_measurement', deletedAtHlc: stamp(10) }],
    });
    const edited = snapshot({ bodyMeasurements: [weight(day, '71', stamp(15))] });
    const reentered = snapshot({ bodyMeasurements: [weight(day, '72', stamp(20))] });
    const replicas = [deleted, edited, reentered];
    const expected = merge(merge(deleted, edited), reentered);
    expect(expected.bodyMeasurements.map((m) => m.value)).toEqual(['72']);
    // The delete (h1) is older than the edit (h1.5): the edit already outlives it; h2 outlives both.
    expect(merge(deleted, edited).bodyMeasurements.map((m) => m.value)).toEqual(['71']);
    for (const [x, y, z] of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ] as const) {
      const [a, b, c] = [replicas[x], replicas[y], replicas[z]] as [
        VaultSnapshot,
        VaultSnapshot,
        VaultSnapshot,
      ];
      expect(merge(merge(a, b), c)).toEqual(expected);
      expect(merge(a, merge(b, c))).toEqual(expected);
    }
  });

  it('a tombstone with no live row hides a late arrival of an older record, and keeps a newer one', () => {
    const day = '2026-01-03';
    const uid = measurementUid('waist', day);
    const only = snapshot({
      tombstones: [{ uid, table: 'body_measurement', deletedAtHlc: stamp(10) }],
    });
    const waist = (value: string, at: string): VaultMeasurement => ({
      uid,
      kind: 'waist',
      day,
      measuredAtUtc: `${day}T07:00:00.000Z`,
      value,
      updatedAtHlc: at,
    });
    const old = snapshot({ bodyMeasurements: [waist('80', stamp(5))] });
    const late = snapshot({ bodyMeasurements: [waist('81', stamp(30))] });
    expect(merge(only, old).bodyMeasurements).toEqual([]);
    expect(merge(old, only)).toEqual(merge(only, old));
    expect(merge(only, late).bodyMeasurements.map((m) => m.value)).toEqual(['81']);
    expect(merge(only, snapshot()).tombstones).toHaveLength(1);
  });

  it('a body measurement uid is its own table: reusing it as a plate is a conflict', () => {
    const uid = measurementUid('weight', '2026-01-02');
    const a = snapshot({ bodyMeasurements: [weight('2026-01-02', '70', stamp(1))] });
    const b = snapshot({ plates: [{ ...plate(1), uid }] });
    expect(mergeVaultSnapshots(a, b)).toEqual({ kind: 'vaultMergeRefused', reason: 'uidConflict' });
  });

  it('a plate keeps the meal it was filed under through a merge', () => {
    const a = snapshot({ plates: [{ ...plate(1), slot: 'snack' as const }] });
    expect(merge(a, snapshot()).plates[0]?.slot).toBe('snack');
    expect(merge(snapshot(), a).plates[0]?.slot).toBe('snack');
  });

  it('a snapshot of a newer schema is refused, so an older client never half-reads it', () => {
    const newer = { ...snapshot(), schemaVersion: 6 };
    expect(mergeVaultSnapshots(snapshot(), newer)).toEqual({
      kind: 'vaultMergeRefused',
      reason: 'remoteSchemaNewer',
    });
  });
});
