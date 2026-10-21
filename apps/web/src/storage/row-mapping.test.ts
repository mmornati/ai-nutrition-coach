// Corrupt rows are skipped with a content-free report and counted; a bad row never poisons a read.
import { describe, expect, it } from 'vitest';
import type { EntryRow, NoteRow } from './ops';
import { mapNoteRows, mapPlateRows, parseStoredInstant, toStoredInstant } from './row-mapping';

const entry = (over: Partial<EntryRow> = {}): EntryRow => ({
  id: 1,
  plateLogId: 1,
  sourceRef: 'manual:x',
  displayName: 'X',
  source: 'manual',
  foodGroup: 'protein',
  quantityLow: '1',
  quantityHigh: '2',
  quantityUnit: 'piece',
  quantityDisplayLabel: '~1',
  ...over,
});

const reports: string[] = [];
const report = (id: number, reason: string) => reports.push(`${id}:${reason}`);
const map = (plates: { id: number; loggedAtUtc: string }[], entries: EntryRow[]) => {
  reports.length = 0;
  return mapPlateRows({ plates, entries }, report);
};

describe('schema v2 columns', () => {
  const when = '2026-08-16T12:00:00.000Z';
  const one = (over: Partial<EntryRow>) => {
    const plates = map([{ id: 1, loggedAtUtc: when }], [entry(over)]);
    return plates[0]?.entries[0];
  };

  it('maps grams, the estimate flag, nutrients and extra', () => {
    const e = one({
      quantityGrams: '125',
      quantityGramsEstimated: 1,
      nutrientsPer100g: '{"energyKcal":61,"protein":3.5}',
      foodExtra: '{"nutriscoreGrade":"b","novaGroup":3}',
    });
    expect(e?.quantity).toMatchObject({ grams: 125, gramsEstimated: true });
    expect(e?.databaseFood.nutrientsPer100g).toEqual({ energyKcal: 61, protein: 3.5 });
    expect(e?.databaseFood.extra).toEqual({ nutriscoreGrade: 'b', novaGroup: 3 });
  });

  it('null or missing columns (a v1 row) map to absent fields', () => {
    const e = one({});
    expect(e?.quantity).not.toHaveProperty('grams');
    expect(e?.databaseFood).not.toHaveProperty('nutrientsPer100g');
    expect(e?.databaseFood).not.toHaveProperty('extra');
  });

  it('garbage in the new columns never drops the row', () => {
    const e = one({
      quantityGrams: 'lots',
      quantityGramsEstimated: 7,
      nutrientsPer100g: '{not json',
      foodExtra: '[1,2]',
    });
    expect(e).toBeDefined();
    expect(e?.quantity).not.toHaveProperty('grams');
    expect(e?.databaseFood).not.toHaveProperty('nutrientsPer100g');
    expect(one({ quantityGrams: '99999' })?.quantity).not.toHaveProperty('grams');
    expect(reports).toEqual([]);
  });
});

describe('timestamps', () => {
  it('are UTC ISO-8601 with millisecond precision, fixed width', () => {
    expect(toStoredInstant(Date.UTC(2026, 7, 16, 12, 0, 0, 123))).toBe('2026-08-16T12:00:00.123Z');
    expect(toStoredInstant(Date.UTC(2026, 0, 2))).toHaveLength(24);
  });

  it('parse back exactly, and only that shape', () => {
    const ms = Date.UTC(2026, 7, 16, 12, 0, 0, 123);
    expect(parseStoredInstant(toStoredInstant(ms))).toBe(ms);
    for (const bad of [
      'not-a-date',
      '',
      '2026-08-16',
      '2026-08-16T12:00:00Z',
      '2026-08-16T12:00:00.123456Z', // legacy microseconds
      '2026-08-16T12:00:00.123+02:00',
      '2026-13-45T99:99:99.999Z',
    ]) {
      expect(parseStoredInstant(bad)).toBeNull();
    }
  });
});

describe('a bad timestamp skips and reports the plate; others still map', () => {
  it('is skipped with a content-free reason', () => {
    const plates = map(
      [
        { id: 1, loggedAtUtc: 'not-a-date' },
        { id: 2, loggedAtUtc: '2026-01-02T00:00:00.000Z' },
      ],
      [entry({ id: 5, plateLogId: 2 })],
    );
    expect(plates.map((p) => p.id)).toEqual([2]);
    expect(reports).toEqual(['1:plate: unparseable timestamp']);
    expect(JSON.stringify(reports)).not.toContain('not-a-date');
  });
});

describe('an invalid quantity skips the entry, not the plate', () => {
  it.each(['NaN', 'Infinity', '-Infinity', '', '   ', 'garbage', '-1'])(
    'low=%j is skipped',
    (low) => {
      const plates = map(
        [{ id: 1, loggedAtUtc: '2026-01-02T00:00:00.000Z' }],
        [
          entry({ id: 1, quantityLow: low }),
          entry({ id: 2, quantityLow: '0.5', quantityHigh: '1.5' }),
        ],
      );
      expect(plates[0]?.entries).toHaveLength(1);
      expect(plates[0]?.entries[0]?.quantity.low).toBe(0.5);
      expect(reports).toEqual(['1:entry: invalid quantity']);
    },
  );

  it('an inverted range is skipped', () => {
    const plates = map(
      [{ id: 1, loggedAtUtc: '2026-01-02T00:00:00.000Z' }],
      [entry({ quantityLow: '3', quantityHigh: '2' })],
    );
    expect(plates[0]?.entries).toEqual([]);
    expect(reports).toHaveLength(1);
  });
});

describe('reading a stored row never throws', () => {
  it('an unknown group reads back as other and an unknown source as manual', () => {
    const plates = map(
      [{ id: 1, loggedAtUtc: '2026-01-02T00:00:00.000Z' }],
      [entry({ foodGroup: 'sweets', source: 'martian' })],
    );
    const food = plates[0]?.entries[0]?.databaseFood;
    expect(food?.foodGroup).toBe('other');
    expect(food?.source).toBe('manual');
  });

  it('a plate without entries is still returned', () => {
    expect(map([{ id: 1, loggedAtUtc: '2026-01-02T00:00:00.000Z' }], [])[0]?.entries).toEqual([]);
  });

  it('snapshots are frozen', () => {
    const plates = map([{ id: 1, loggedAtUtc: '2026-01-02T00:00:00.000Z' }], [entry()]);
    expect(Object.isFrozen(plates)).toBe(true);
    expect(Object.isFrozen(plates[0]?.entries)).toBe(true);
  });
});

describe('notes', () => {
  const note = (over: Partial<NoteRow> = {}): NoteRow => ({
    id: 1,
    plateLogId: 1,
    anchor: 'postResolve',
    questionKey: 'q',
    noteText: 'text',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('skips a corrupt timestamp row and reports it', () => {
    reports.length = 0;
    const notes = mapNoteRows([note({ id: 1, generatedAt: 'garbage' }), note({ id: 2 })], report);
    expect(notes.map((n) => n.id)).toEqual([2]);
    expect(reports).toEqual(['1:note: unparseable timestamp']);
  });

  it('a future anchor falls back to postResolve instead of crashing the read', () => {
    expect(mapNoteRows([note({ anchor: 'someFutureAnchor' })], report)[0]?.anchor).toBe(
      'postResolve',
    );
  });
});
