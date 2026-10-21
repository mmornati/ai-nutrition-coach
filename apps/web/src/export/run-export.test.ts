import { ALL_HISTORY_SCOPE } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { createCsvExporter } from './csv-exporter';
import type { ExportDeliveryOutcome, ExportDestination } from './export-destination';
import { createExportHistory } from './export-history';
import { createJsonExporter } from './json-exporter';
import { KV_KEYS, KeyValueStoreLocked, type KeyValueStore } from '../storage/key-value-store';
import { createRunExport, exportFilename } from './run-export';
import { FakeStore, entry, plate } from './testing';

const NOW = new Date(2026, 7, 16, 10).getTime();

function setup(
  opts: {
    outcome?: ExportDeliveryOutcome | 'throw';
    locked?: boolean;
    failWith?: 'webSessionKey';
  } = {},
) {
  const store = new FakeStore([plate(1, NOW, [entry(1, 1, 'Egg')])], opts.failWith);
  const written: { filename: string; mimeType: string; text: string }[] = [];
  const destination: ExportDestination = {
    write: ({ filename, mimeType, bytes }) => {
      if (opts.outcome === 'throw') return Promise.reject(new Error('disk'));
      written.push({ filename, mimeType, text: new TextDecoder().decode(bytes) });
      return Promise.resolve(opts.outcome ?? 'downloaded');
    },
  };
  const data = new Map<string, string>();
  const kv: KeyValueStore = {
    read: (k) => Promise.resolve(data.get(k) ?? null),
    write: (k, v) => {
      if (opts.locked) return Promise.reject(new KeyValueStoreLocked());
      data.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      if (opts.locked) return Promise.reject(new KeyValueStoreLocked());
      data.delete(k);
      return Promise.resolve();
    },
  };
  const exporters = { csv: createCsvExporter(store), json: createJsonExporter(store) };
  const history = createExportHistory(kv);
  const run = createRunExport({ exporters, destination, history, clock: () => NOW });
  return { run, written, data, exporters, destination, history };
}

describe('runExport', () => {
  it('exports csv and records the last-export date', async () => {
    const t = setup();
    const r = await t.run({ format: 'csv', scope: ALL_HISTORY_SCOPE });
    expect(r).toEqual({ kind: 'exported', filename: exportFilename('csv', NOW), plateCount: 1 });
    expect(t.written[0]?.filename).toBe('2026-08-16-ai-nutrition-coach.csv');
    expect(t.written[0]?.text).toContain('Egg');
    expect(t.data.get(KV_KEYS.exportLastAtUtc)).toBe(new Date(NOW).toISOString());
  });

  it('exports json with the plates envelope', async () => {
    const t = setup();
    await t.run({ format: 'json', scope: ALL_HISTORY_SCOPE });
    expect(t.written[0]?.mimeType).toBe('application/json');
    expect(Object.keys(JSON.parse(t.written[0]?.text ?? '{}') as object)).toEqual(['plates']);
  });

  it('puts the profile in the json export only, and a failing read just leaves it out', async () => {
    const t = setup();
    const withProfile = createRunExport({
      exporters: t.exporters,
      destination: t.destination,
      history: t.history,
      clock: () => NOW,
      readProfile: () => Promise.resolve({ sex: 'female' }),
    });
    await withProfile({ format: 'json', scope: ALL_HISTORY_SCOPE });
    await withProfile({ format: 'csv', scope: ALL_HISTORY_SCOPE });
    expect(JSON.parse(t.written[0]?.text ?? '{}')).toMatchObject({ profile: { sex: 'female' } });
    expect(t.written[1]?.text).not.toContain('female');
    const failing = createRunExport({
      exporters: t.exporters,
      destination: t.destination,
      history: t.history,
      clock: () => NOW,
      readProfile: () => Promise.reject(new Error('locked')),
    });
    await failing({ format: 'json', scope: ALL_HISTORY_SCOPE });
    expect(Object.keys(JSON.parse(t.written[2]?.text ?? '{}') as object)).toEqual(['plates']);
  });

  it('failing to remember the date never turns a successful export into an error', async () => {
    const t = setup({ locked: true });
    expect((await t.run({ format: 'csv', scope: ALL_HISTORY_SCOPE })).kind).toBe('exported');
    expect(t.data.size).toBe(0);
  });

  it('a dismissed share sheet records nothing', async () => {
    const t = setup({ outcome: 'cancelled' });
    expect((await t.run({ format: 'csv', scope: ALL_HISTORY_SCOPE })).kind).toBe('cancelled');
    expect(t.data.size).toBe(0);
  });

  it('a read failure delivers nothing; a delivery failure is typed', async () => {
    const locked = setup({ failWith: 'webSessionKey' });
    expect(await locked.run({ format: 'csv', scope: ALL_HISTORY_SCOPE })).toEqual({
      kind: 'failed',
      failure: { kind: 'storeClosed' },
    });
    expect(locked.written).toHaveLength(0);
    const broken = setup({ outcome: 'throw' });
    expect(await broken.run({ format: 'csv', scope: ALL_HISTORY_SCOPE })).toEqual({
      kind: 'failed',
      failure: { kind: 'deliveryFailed' },
    });
    expect(broken.data.size).toBe(0);
  });
});
