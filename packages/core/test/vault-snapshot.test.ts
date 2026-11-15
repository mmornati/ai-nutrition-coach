import { describe, expect, it } from 'vitest';
import {
  canonicalizeSnapshot,
  DEVICE_ONLY_KV_KEYS,
  isSyncedKvKey,
  measurementUid,
  mergeVaultSnapshots,
  newestHlc,
  parseVaultSnapshot,
  snapshotBeyond,
  SNAPSHOT_LIMITS,
  SYNCED_KV_KEYS,
  vaultConflict,
  type VaultSnapshot,
} from '../src/index';
import { SNAPSHOT_V4 } from './fixtures/snapshot-v4';
import { entry, seeded, randomSnapshot, snapshot, stamp, uuid } from './vault-fixtures';

const full = (): VaultSnapshot =>
  snapshot({
    plates: [
      {
        uid: uuid(2),
        loggedAtUtc: '2026-01-02T12:00:00.000Z',
        slot: 'snack',
        entries: [entry(202), entry(201)],
        notes: [
          {
            uid: uuid(250),
            anchor: 'postResolve',
            questionKey: 'k',
            noteText: 'Nice',
            generatedAt: '2026-01-02T12:00:01.000Z',
            interactions: [{ uid: uuid(2500), kind: 'sure', at: '2026-01-02T12:00:02.000Z' }],
          },
        ],
      },
      {
        uid: uuid(1),
        loggedAtUtc: '2026-01-01T12:00:00.000Z',
        slot: null,
        entries: [entry(101)],
        notes: [],
      },
    ],
    dismissals: [{ key: `note:${uuid(250)}`, dismissedAtUtc: '2026-01-02T12:00:03.000Z' }],
    savedMeals: [
      {
        uid: uuid(9001),
        name: 'Usual',
        createdAtUtc: '2026-01-01T07:00:00.000Z',
        updatedAtHlc: stamp(5),
        items: [entry(9101), entry(9100)],
      },
    ],
    recipes: [
      {
        uid: uuid(9501),
        name: 'Stew',
        servings: 4,
        cookedWeightGrams: '1200',
        createdAtUtc: '2026-01-01T07:00:00.000Z',
        updatedAtHlc: stamp(6),
        items: [entry(9601)],
      },
    ],
    bodyMeasurements: [
      {
        uid: measurementUid('weight', '2026-01-02'),
        kind: 'weight',
        day: '2026-01-02',
        measuredAtUtc: '2026-01-02T07:30:00.000Z',
        value: '71.4',
        updatedAtHlc: stamp(9),
      },
    ],
    kv: [{ key: 'ui.locale', value: 'fr', updatedAtHlc: stamp(7) }],
    tombstones: [{ uid: uuid(3), table: 'plate_log', deletedAtHlc: stamp(8) }],
  });

const problemOf = (input: unknown) => {
  const result = parseVaultSnapshot(input);
  return result.kind === 'vaultSnapshotInvalid' ? `${result.problem} ${result.path}` : 'parsed';
};

describe('parseVaultSnapshot', () => {
  it('accepts a valid snapshot, in canonical order, and survives a JSON round trip', () => {
    const result = parseVaultSnapshot(JSON.parse(JSON.stringify(full())));
    expect(result.kind).toBe('vaultSnapshotParsed');
    if (result.kind !== 'vaultSnapshotParsed') return;
    expect(result.snapshot).toEqual(canonicalizeSnapshot(full()));
    // Plates by time, entries by uid; items keep the record's own order.
    expect(result.snapshot.plates.map((p) => p.uid)).toEqual([uuid(1), uuid(2)]);
    expect(result.snapshot.plates[1]?.entries.map((e) => e.uid)).toEqual([uuid(201), uuid(202)]);
    expect(result.snapshot.savedMeals[0]?.items.map((e) => e.uid)).toEqual([
      uuid(9101),
      uuid(9100),
    ]);
    expect(JSON.stringify(canonicalizeSnapshot(result.snapshot))).toBe(
      JSON.stringify(result.snapshot),
    );
  });

  it('accepts an empty snapshot', () => {
    expect(parseVaultSnapshot(snapshot()).kind).toBe('vaultSnapshotParsed');
  });

  it('refuses what is not a snapshot, and an unknown snapshot version', () => {
    for (const bad of [null, undefined, 'x', 3, [], true]) {
      expect(problemOf(bad)).toBe('notAnObject $');
    }
    expect(problemOf({ ...full(), snapshotVersion: 2 })).toBe(
      'unsupportedSnapshotVersion $.snapshotVersion',
    );
    expect(problemOf({})).toBe('unsupportedSnapshotVersion $.snapshotVersion');
  });

  it('refuses unknown or missing fields, anywhere', () => {
    expect(problemOf({ ...full(), extra: 1 })).toBe('malformed $');
    const missing: Record<string, unknown> = { ...full() };
    delete missing['tombstones'];
    expect(problemOf(missing)).toBe('malformed $');
    const withExtraEntryField = full();
    const plate = withExtraEntryField.plates[0];
    expect(
      problemOf({
        ...withExtraEntryField,
        plates: [{ ...plate, entries: [{ ...plate?.entries[0], surprise: true }] }],
      }),
    ).toBe('malformed $.plates[0].entries[0]');
  });

  it('refuses wrong types and bad identifiers, naming the path but never the value', () => {
    const base = full();
    const withPlate = (patch: object) => ({
      ...base,
      plates: [{ ...base.plates[0], ...patch }],
    });
    expect(problemOf(withPlate({ uid: 'not-a-uuid' }))).toBe('malformed $.plates[0].uid');
    expect(problemOf(withPlate({ loggedAtUtc: 5 }))).toBe('malformed $.plates[0].loggedAtUtc');
    expect(problemOf({ ...base, schemaVersion: 0 })).toBe('malformed $.schemaVersion');
    expect(problemOf({ ...base, schemaVersion: '4' })).toBe('malformed $.schemaVersion');
    expect(problemOf({ ...base, plates: {} })).toBe('malformed $.plates');
    expect(
      problemOf({
        ...base,
        savedMeals: [{ ...base.savedMeals[0], updatedAtHlc: 'yesterday' }],
      }),
    ).toBe('malformed $.savedMeals[0].updatedAtHlc');
    expect(problemOf({ ...base, recipes: [{ ...base.recipes[0], servings: 0 }] })).toBe(
      'malformed $.recipes[0].servings',
    );
    expect(problemOf({ ...base, recipes: [{ ...base.recipes[0], servings: 1.5 }] })).toBe(
      'malformed $.recipes[0].servings',
    );
    const odd = { ...entry(1), quantityGramsEstimated: 2 };
    expect(problemOf(withPlate({ entries: [odd] }))).toBe(
      'malformed $.plates[0].entries[0].quantityGramsEstimated',
    );
    const secret = parseVaultSnapshot(withPlate({ uid: 'sk-secret-value' }));
    expect(JSON.stringify(secret)).not.toContain('sk-secret');
  });

  it('refuses duplicate uids and duplicate keys', () => {
    const base = full();
    const plate = base.plates[0];
    expect(problemOf({ ...base, plates: [plate, plate] })).toBe('duplicate $.plates[1].uid');
    expect(problemOf({ ...base, plates: [{ ...plate, entries: [entry(5), entry(5)] }] })).toBe(
      'duplicate $.plates[0].entries[1].uid',
    );
    expect(problemOf({ ...base, dismissals: [...base.dismissals, ...base.dismissals] })).toBe(
      'duplicate $.dismissals[1].key',
    );
    expect(problemOf({ ...base, kv: [...base.kv, ...base.kv] })).toBe('duplicate $.kv[1].key');
  });

  it('refuses a device-only kv key: device-only keys and the BYOK key never travel', () => {
    for (const key of [...DEVICE_ONLY_KV_KEYS, 'ai.byokKey']) {
      expect(problemOf({ ...full(), kv: [{ key, value: 'x', updatedAtHlc: stamp(1) }] })).toBe(
        'malformed $.kv[0].key',
      );
    }
    expect(
      problemOf({
        ...full(),
        tombstones: [{ uid: 'kv:ai.byokKey', table: 'kv', deletedAtHlc: stamp(1) }],
      }),
    ).toBe('malformed $.tombstones[0].uid');
  });

  it('refuses a tombstone beside the plate it should have removed, and a shadowed template', () => {
    const base = full();
    expect(
      problemOf({
        ...base,
        tombstones: [{ uid: uuid(2), table: 'plate_log', deletedAtHlc: stamp(1) }],
      }),
    ).toBe('conflict $.tombstones[0].uid');
    expect(
      problemOf({
        ...base,
        tombstones: [{ uid: uuid(9001), table: 'saved_meal', deletedAtHlc: stamp(5) }],
      }),
    ).toBe('conflict $.savedMeals[0].uid');
    // A write AFTER the delete is fine: the record came back.
    expect(
      problemOf({
        ...base,
        tombstones: [{ uid: uuid(9001), table: 'saved_meal', deletedAtHlc: stamp(4) }],
      }),
    ).toBe('parsed');
    expect(
      problemOf({
        ...base,
        tombstones: [{ uid: 'kv:ui.locale', table: 'kv', deletedAtHlc: stamp(9) }],
      }),
    ).toBe('conflict $.kv[0].key');
  });

  it('refuses text that is not in the form the store writes', () => {
    const base = full();
    const plate = base.plates[0];
    const withPlate = (patch: object) => ({ ...base, plates: [{ ...plate, ...patch }] });
    const withEntry = (patch: object) =>
      withPlate({ entries: [{ ...plate?.entries[0], ...patch }] });
    for (const bad of ['2026-01-01', '2026-01-01T12:00:00Z', '2026-13-45T12:00:00.000Z', 'x', '']) {
      expect(problemOf(withPlate({ loggedAtUtc: bad }))).toBe('malformed $.plates[0].loggedAtUtc');
    }
    expect(problemOf(withEntry({ quantityLow: 'NaN' }))).toBe(
      'malformed $.plates[0].entries[0].quantityLow',
    );
    expect(problemOf(withEntry({ quantityLow: '3', quantityHigh: '2' }))).toBe(
      'malformed $.plates[0].entries[0].quantityLow',
    );
    expect(problemOf(withEntry({ quantityHigh: 'Infinity' }))).toBe(
      'malformed $.plates[0].entries[0].quantityHigh',
    );
    expect(problemOf(withEntry({ quantityGrams: '99999' }))).toBe(
      'malformed $.plates[0].entries[0].quantityGrams',
    );
    expect(problemOf(withEntry({ nutrientsPer100g: '{not json' }))).toBe(
      'malformed $.plates[0].entries[0].nutrientsPer100g',
    );
    expect(problemOf(withEntry({ foodExtra: '[1,2]' }))).toBe(
      'malformed $.plates[0].entries[0].foodExtra',
    );
    expect(problemOf(withEntry({ nutrientsPer100g: '{"salt":1}', quantityGrams: '80' }))).toBe(
      'parsed',
    );
    const note = plate?.notes[0];
    expect(problemOf(withPlate({ notes: [{ ...note, generatedAt: 'later' }] }))).toBe(
      'malformed $.plates[0].notes[0].generatedAt',
    );
    expect(problemOf({ ...base, dismissals: [{ key: 'k', dismissedAtUtc: 'today' }] })).toBe(
      'malformed $.dismissals[0].dismissedAtUtc',
    );
    expect(problemOf({ ...base, savedMeals: [{ ...base.savedMeals[0], createdAtUtc: 'x' }] })).toBe(
      'malformed $.savedMeals[0].createdAtUtc',
    );
    expect(problemOf({ ...base, savedMeals: [{ ...base.savedMeals[0], name: '  ' }] })).toBe(
      'malformed $.savedMeals[0].name',
    );
    expect(problemOf({ ...base, recipes: [{ ...base.recipes[0], cookedWeightGrams: '-5' }] })).toBe(
      'malformed $.recipes[0].cookedWeightGrams',
    );
  });

  it('refuses a kv value the app would not write under that key', () => {
    const at = stamp(9);
    const kvOf = (key: string, value: string) => ({
      ...full(),
      kv: [{ key, value, updatedAtHlc: at }],
    });
    for (const [key, value] of [
      ['ui.locale', 'klingon'],
      ['ui.showNumbers', 'on'],
      ['profile', '[1]'],
      ['profile', 'not json'],
      ['export.lastAtUtc', 'yesterday'],
      ['privacy.aboutAckAtUtc', '2026-01-01'],
    ] as const) {
      expect(problemOf(kvOf(key, value))).toBe('malformed $.kv[0].value');
    }
    expect(problemOf(kvOf('ui.locale', 'fr'))).toBe('parsed');
    expect(problemOf(kvOf('profile', '{"sex":"female"}'))).toBe('parsed');
  });

  it('refuses sizes beyond the limits, naming the path only', () => {
    const base = full();
    const plate = base.plates[0];
    expect(
      problemOf({
        ...base,
        plates: [
          {
            ...plate,
            entries: [{ ...plate?.entries[0], displayName: 'x'.repeat(SNAPSHOT_LIMITS.text + 1) }],
          },
        ],
      }),
    ).toBe('tooLarge $.plates[0].entries[0].displayName');
    const many = Array.from({ length: SNAPSHOT_LIMITS.entriesPerPlate + 1 }, (_, i) =>
      entry(5000 + i),
    );
    expect(problemOf({ ...base, plates: [{ ...plate, entries: many }] })).toBe(
      'tooLarge $.plates[0].entries',
    );
    expect(
      problemOf({
        ...base,
        kv: [{ key: 'profile', value: `{"a":"${'x'.repeat(20_000)}"}`, updatedAtHlc: stamp(9) }],
      }),
    ).toBe('tooLarge $.kv[0].value');
    expect(
      problemOf({
        ...base,
        plates: [
          {
            ...plate,
            entries: [{ ...plate?.entries[0], nutrientsPer100g: `{"a":"${'x'.repeat(20_000)}"}` }],
          },
        ],
      }),
    ).toBe('tooLarge $.plates[0].entries[0].nutrientsPer100g');
  });

  it('refuses one uid in two tables, a tombstone of another kind, and an orphan note dismissal', () => {
    const base = full();
    const plate = base.plates[0];
    // The same uid as a plate and as a saved meal.
    expect(problemOf({ ...base, savedMeals: [{ ...base.savedMeals[0], uid: plate?.uid }] })).toBe(
      'duplicate $.savedMeals[0].uid',
    );
    // An item and an entry sharing a uid.
    expect(
      problemOf({
        ...base,
        savedMeals: [
          { ...base.savedMeals[0], items: [{ ...entry(1), uid: plate?.entries[0]?.uid }] },
        ],
      }),
    ).toBe('duplicate $.savedMeals[0].items[0].uid');
    // A tombstone for a food entry whose uid is live as a plate.
    expect(
      problemOf({
        ...base,
        tombstones: [{ uid: plate?.uid, table: 'food_entry', deletedAtHlc: stamp(1) }],
      }),
    ).toBe('conflict $.tombstones[0].uid');
    // Two tombstones for one uid.
    expect(
      problemOf({
        ...base,
        tombstones: [
          { uid: uuid(3), table: 'plate_log', deletedAtHlc: stamp(1) },
          { uid: uuid(3), table: 'food_entry', deletedAtHlc: stamp(2) },
        ],
      }),
    ).toBe('duplicate $.tombstones[1].uid');
    // A note dismissal without its note.
    expect(
      problemOf({
        ...base,
        dismissals: [{ key: `note:${uuid(777)}`, dismissedAtUtc: '2026-01-01T00:00:00.000Z' }],
      }),
    ).toBe('conflict $.dismissals[0].key');
  });

  it('refuses an unknown tombstone table', () => {
    expect(
      problemOf({
        ...full(),
        tombstones: [{ uid: uuid(3), table: 'coach_dismissal', deletedAtHlc: stamp(1) }],
      }),
    ).toBe('malformed $.tombstones[0].table');
  });

  it('accepts everything a random valid snapshot can hold', () => {
    const random = seeded(77);
    for (let i = 0; i < 100; i++) {
      const generated = randomSnapshot(random);
      const parsed = parseVaultSnapshot(JSON.parse(JSON.stringify(generated)));
      expect(parsed.kind).toBe('vaultSnapshotParsed');
      if (parsed.kind === 'vaultSnapshotParsed') expect(parsed.snapshot).toEqual(generated);
    }
  });
});

describe('the kv allow-list', () => {
  it('fails closed: an unknown key is not synced, and no key is in both lists', () => {
    expect(isSyncedKvKey('ui.locale')).toBe(true);
    expect(isSyncedKvKey('ai.byokKey')).toBe(false);
    expect(isSyncedKvKey('privacy.offLookup')).toBe(false); // consent to a destination is per device
    expect(isSyncedKvKey('anything.else')).toBe(false);
    expect(SYNCED_KV_KEYS.filter((k) => DEVICE_ONLY_KV_KEYS.includes(k))).toEqual([]);
  });
});

describe('a kv key from a newer app (forward compatibility)', () => {
  const future = { key: 'ui.futurePreference', value: 'on', updatedAtHlc: stamp(5) };
  const parse = (value: unknown) => parseVaultSnapshot(JSON.parse(JSON.stringify(value)));

  it('is dropped on parse: not an error, not kept', () => {
    const result = parse({ ...full(), kv: [...full().kv, future] });
    expect(result.kind).toBe('vaultSnapshotParsed');
    if (result.kind !== 'vaultSnapshotParsed') return;
    expect(result.snapshot.kv.map((e) => e.key)).toEqual(full().kv.map((e) => e.key));
    expect(JSON.stringify(result.snapshot)).not.toContain('ui.futurePreference');
  });

  it('drops the tombstone of such a key too', () => {
    const result = parse({
      ...full(),
      tombstones: [
        ...full().tombstones,
        { uid: 'kv:ui.futurePreference', table: 'kv', deletedAtHlc: stamp(6) },
      ],
    });
    expect(result.kind).toBe('vaultSnapshotParsed');
    if (result.kind !== 'vaultSnapshotParsed') return;
    expect(result.snapshot.tombstones.some((t) => t.uid.includes('futurePreference'))).toBe(false);
  });

  it('still fails for a malformed value of a KNOWN key, and for a device-only key', () => {
    const bad = (key: string, value: string) =>
      problemOf({ ...full(), kv: [{ key, value, updatedAtHlc: stamp(1) }, future] });
    expect(bad('ui.locale', 'klingon')).toBe('malformed $.kv[0].value');
    expect(bad('ai.byokKey', 'x')).toBe('malformed $.kv[0].key');
  });

  it('is not echoed back by this device, and a newer device keeps it when it merges', () => {
    const received = parse({ ...full(), kv: [...full().kv, future] });
    if (received.kind !== 'vaultSnapshotParsed') throw new Error('should parse');
    // What an older device writes next is built from what it holds: no such key.
    const oldDevice = received.snapshot;
    expect(oldDevice.kv.some((e) => e.key === future.key)).toBe(false);
    // A newer device that has the key merges the older device's snapshot: nothing deletes it.
    const newer = { ...full(), kv: [...full().kv, future] } as VaultSnapshot;
    const merged = mergeVaultSnapshots(newer, oldDevice);
    expect(merged.kind).toBe('vaultMerged');
    if (merged.kind !== 'vaultMerged') return;
    expect(merged.snapshot.kv.some((e) => e.key === future.key)).toBe(true);
  });
});

describe('vaultConflict', () => {
  it('is true only when a uid means two different things across two snapshots', () => {
    const plate = (id: number, entries = [entry(id * 100 + 1)]) => ({
      uid: uuid(id),
      loggedAtUtc: '2026-01-01T12:00:00.000Z',
      slot: null,
      entries,
      notes: [],
    });
    const a = snapshot({ plates: [plate(1)] });
    expect(vaultConflict(a, a)).toBe(false);
    expect(vaultConflict(a, snapshot({ plates: [plate(2)] }))).toBe(false);
    // The entry of plate 1 turns up under plate 2.
    expect(vaultConflict(a, snapshot({ plates: [plate(2, [entry(101)])] }))).toBe(true);
    // A plate uid used as a tombstone for another kind of record.
    expect(
      vaultConflict(
        a,
        snapshot({ tombstones: [{ uid: uuid(1), table: 'recipe', deletedAtHlc: stamp(1) }] }),
      ),
    ).toBe(true);
    expect(
      vaultConflict(
        a,
        snapshot({ tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: stamp(1) }] }),
      ),
    ).toBe(false);
  });
});

describe('snapshotBeyond', () => {
  it('sees a stamp later than the limit in any record kind', () => {
    const far = stamp(5_000);
    expect(snapshotBeyond(full(), 10_000)).toBe(false);
    expect(
      snapshotBeyond(
        snapshot({ kv: [{ key: 'ui.locale', value: 'en', updatedAtHlc: far }] }),
        4_999,
      ),
    ).toBe(true);
    expect(
      snapshotBeyond(
        snapshot({ tombstones: [{ uid: uuid(1), table: 'plate_log', deletedAtHlc: far }] }),
        4_999,
      ),
    ).toBe(true);
  });
});

describe('newestHlc', () => {
  it('is the newest stamp anywhere, or null', () => {
    expect(newestHlc(snapshot())).toBeNull();
    expect(newestHlc(full())).toBe(stamp(9)); // the body measurement's stamp is the newest
  });
});

describe('schema v5: plate meal and body measurements', () => {
  const problem = (value: unknown): string => {
    const result = parseVaultSnapshot(JSON.parse(JSON.stringify(value)));
    return result.kind === 'vaultSnapshotInvalid' ? `${result.problem} ${result.path}` : 'ok';
  };
  const withMeasurement = (over: Record<string, unknown>) => ({
    ...full(),
    bodyMeasurements: [{ ...(full().bodyMeasurements[0] as object), ...over }],
  });

  it('keeps a plate meal and null verbatim, and refuses an unknown meal', () => {
    const parsed = parseVaultSnapshot(JSON.parse(JSON.stringify(full())));
    expect(
      parsed.kind === 'vaultSnapshotParsed' && parsed.snapshot.plates.map((p) => p.slot),
    ).toEqual([null, 'snack']);
    const bad = full();
    expect(problem({ ...bad, plates: [{ ...(bad.plates[0] as object), slot: 'brunch' }] })).toBe(
      'malformed $.plates[0].slot',
    );
  });

  it('refuses a body measurement whose uid is not the one derived from its kind and day', () => {
    expect(problem(withMeasurement({ uid: uuid(5) }))).toBe('malformed $.bodyMeasurements[0].uid');
    expect(problem(withMeasurement({ day: '2026-01-03' }))).toBe(
      'malformed $.bodyMeasurements[0].uid',
    );
  });

  it('refuses out-of-range, badly formatted or unknown values', () => {
    expect(problem(withMeasurement({ value: '19.9' }))).toBe(
      'malformed $.bodyMeasurements[0].value',
    );
    expect(problem(withMeasurement({ value: '401' }))).toBe(
      'malformed $.bodyMeasurements[0].value',
    );
    // A weight keeps two decimals (68.04 kg is 150 lb), no more; a v5 weight with one decimal is fine.
    expect(problem(withMeasurement({ value: '71.45' }))).toBe('ok');
    expect(problem(withMeasurement({ value: '68.04' }))).toBe('ok');
    expect(problem(withMeasurement({ value: '71.456' }))).toBe(
      'malformed $.bodyMeasurements[0].value',
    );
    // A waist keeps one decimal.
    const waistDay = '2026-01-02';
    const waist = (value: string) =>
      withMeasurement({ uid: measurementUid('waist', waistDay), kind: 'waist', value });
    expect(problem(waist('81.5'))).toBe('ok');
    expect(problem(waist('81.55'))).toBe('malformed $.bodyMeasurements[0].value');
    expect(problem(withMeasurement({ value: 71.4 }))).toBe('malformed $.bodyMeasurements[0].value');
    expect(problem(withMeasurement({ kind: 'height' }))).toBe(
      'malformed $.bodyMeasurements[0].kind',
    );
    expect(problem(withMeasurement({ day: '2026-02-30' }))).toBe(
      'malformed $.bodyMeasurements[0].day',
    );
    expect(problem(withMeasurement({ extra: 1 }))).toBe('malformed $.bodyMeasurements[0]');
  });

  it('refuses a measurement shadowed by a tombstone at or after its stamp, accepts a later write', () => {
    const uid = measurementUid('weight', '2026-01-02');
    const base = full();
    expect(
      problem({
        ...base,
        tombstones: [{ uid, table: 'body_measurement', deletedAtHlc: stamp(9) }],
      }),
    ).toBe('conflict $.bodyMeasurements[0].uid');
    expect(
      problem({
        ...base,
        tombstones: [{ uid, table: 'body_measurement', deletedAtHlc: stamp(8) }],
      }),
    ).toBe('ok');
  });

  it('has a deterministic uid per (kind, day) that is a valid uuid and differs by kind and day', () => {
    const a = measurementUid('weight', '2026-01-02');
    expect(a).toBe(measurementUid('weight', '2026-01-02'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(
      new Set([a, measurementUid('waist', '2026-01-02'), measurementUid('weight', '2026-01-03')])
        .size,
    ).toBe(3);
  });

  it('the kv allow-list carries the distance switch, only as "on"', () => {
    expect(isSyncedKvKey('ui.showDistanceToGuide')).toBe(true);
    const snap = {
      ...full(),
      kv: [{ key: 'ui.showDistanceToGuide', value: 'off', updatedAtHlc: stamp(1) }],
    };
    expect(problem(snap)).toBe('malformed $.kv[0].value');
  });

  it('the kv allow-list carries the welcome answer and the quiet-line answers, and keeps the resume step on the device', () => {
    for (const key of ['ui.welcome', 'ui.guideHintDismissed', 'ui.paceNoticeDismissedAtUtc']) {
      expect(isSyncedKvKey(key)).toBe(true);
    }
    expect(isSyncedKvKey('ui.welcomeStep')).toBe(false);
    const bad = (key: string, value: string) =>
      problem({ ...full(), kv: [{ key, value, updatedAtHlc: stamp(1) }] });
    expect(bad('ui.welcome', 'maybe')).toBe('malformed $.kv[0].value');
    expect(bad('ui.guideHintDismissed', 'yes')).toBe('malformed $.kv[0].value');
    expect(bad('ui.paceNoticeDismissedAtUtc', 'yesterday')).toBe('malformed $.kv[0].value');
    expect(bad('ui.welcomeStep', '3')).not.toBe('');
    for (const [key, value] of [
      ['ui.welcome', 'done'],
      ['ui.welcome', 'skipped'],
      ['ui.guideHintDismissed', 'on'],
      ['ui.paceNoticeDismissedAtUtc', '2026-10-14T20:00:00.000Z'],
    ] as const) {
      expect(bad(key, value)).toBe('ok');
    }
  });
});

describe('a snapshot written before schema v5 (frozen v4 fixture)', () => {
  const v4 = (): Record<string, unknown> => JSON.parse(JSON.stringify(SNAPSHOT_V4));
  const problem = (value: unknown): string => problemOf(value);

  it('parses: no measurements, every plate meal null, tagged as the current shape', () => {
    const parsed = parseVaultSnapshot(v4());
    expect(parsed.kind).toBe('vaultSnapshotParsed');
    if (parsed.kind !== 'vaultSnapshotParsed') return;
    expect(parsed.snapshot.bodyMeasurements).toEqual([]);
    expect(parsed.snapshot.plates.map((p) => p.slot)).toEqual([null]);
    expect(parsed.snapshot.schemaVersion).toBe(5);
    // What was parsed parses again (it is a v5 snapshot in memory).
    expect(parseVaultSnapshot(JSON.parse(JSON.stringify(parsed.snapshot))).kind).toBe(
      'vaultSnapshotParsed',
    );
  });

  it('is malformed when it carries a v5 key it cannot have, or lacks a v5 key as v5', () => {
    expect(problem({ ...v4(), bodyMeasurements: [] })).toBe('malformed $');
    const plates = v4()['plates'] as Record<string, unknown>[];
    expect(problem({ ...v4(), plates: [{ ...plates[0], slot: null }] })).toBe(
      'malformed $.plates[0]',
    );
    expect(problem({ ...v4(), schemaVersion: 5 })).toBe('malformed $');
    expect(problem({ ...v4(), schemaVersion: 3 })).toBe('parsed');
    expect(problem({ ...v4(), schemaVersion: 0 })).toBe('malformed $.schemaVersion');
  });

  it('still refuses what a newer store wrote with keys it does not know', () => {
    expect(problem({ ...v4(), schemaVersion: 6 })).toBe('malformed $');
    expect(problem({ ...full(), schemaVersion: 6, extra: 1 })).toBe('malformed $');
  });

  it('merges into a v5 snapshot, keeps both sides, and the result re-serialises as v5', () => {
    const remote = parseVaultSnapshot(v4());
    if (remote.kind !== 'vaultSnapshotParsed') throw new Error('did not parse');
    const local = full();
    for (const [a, b] of [
      [local, remote.snapshot],
      [remote.snapshot, local],
    ] as const) {
      const merged = mergeVaultSnapshots(a, b);
      expect(merged.kind).toBe('vaultMerged');
      if (merged.kind !== 'vaultMerged') return;
      expect(merged.snapshot.schemaVersion).toBe(5);
      expect(merged.snapshot.bodyMeasurements).toHaveLength(1);
      expect(merged.snapshot.plates.map((p) => p.uid)).toContain(
        '00000000-0000-7000-8000-000000000001',
      );
      expect(parseVaultSnapshot(JSON.parse(JSON.stringify(merged.snapshot))).kind).toBe(
        'vaultSnapshotParsed',
      );
    }
  });
});
