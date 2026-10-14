import { describe, expect, it } from 'vitest';
import { createExportHistory } from './export-history';
import { createExportReminder } from './export-reminder';
import { KV_KEYS, KeyValueStoreLocked, type KeyValueStore } from '../storage/key-value-store';

class MemoryKv implements KeyValueStore {
  readonly data = new Map<string, string>();
  locked = false;
  read(key: string): Promise<string | null> {
    return Promise.resolve(this.locked ? null : (this.data.get(key) ?? null));
  }
  write(key: string, value: string): Promise<void> {
    if (this.locked) return Promise.reject(new KeyValueStoreLocked());
    this.data.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    if (this.locked) return Promise.reject(new KeyValueStoreLocked());
    this.data.delete(key);
    return Promise.resolve();
  }
}

const DAY = 86_400_000;
const T = Date.UTC(2026, 7, 16);

describe('ExportHistory', () => {
  it('reads null before any export, and the recorded instant after', async () => {
    const kv = new MemoryKv();
    const h = createExportHistory(kv);
    expect(await h.lastExportAt()).toBeUndefined();
    await h.record(T);
    expect(kv.data.get(KV_KEYS.exportLastAtUtc)).toBe('2026-08-16T00:00:00.000Z');
    expect(await h.lastExportAt()).toBe(T);
  });

  it('a locked store reads as unknown and a failed write never throws', async () => {
    const kv = new MemoryKv();
    const h = createExportHistory(kv);
    await h.record(T);
    kv.locked = true;
    expect(await h.lastExportAt()).toBeUndefined();
    await expect(h.record(T + DAY)).resolves.toBeUndefined();
    await expect(h.recordReminderDismissed(T)).resolves.toBeUndefined();
    kv.locked = false;
    expect(await h.lastExportAt()).toBe(T);
  });

  it('a throwing read or unparsable value reads as unknown', async () => {
    const throwing: KeyValueStore = {
      read: () => Promise.reject(new Error('boom')),
      write: () => Promise.reject(new Error('boom')),
      delete: () => Promise.reject(new Error('boom')),
    };
    expect(await createExportHistory(throwing).lastExportAt()).toBeUndefined();
    const kv = new MemoryKv();
    kv.data.set(KV_KEYS.exportLastAtUtc, 'not a date');
    expect(await createExportHistory(kv).lastExportAt()).toBeUndefined();
  });

  it('serialises read-modify-write: concurrent records cannot let an older date win', async () => {
    // A store whose reads are slow: without the mutex both calls would read "nothing" and the
    // later write (the OLDER date) would win.
    class SlowKv extends MemoryKv {
      override async read(key: string): Promise<string | null> {
        const value = await super.read(key);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return value;
      }
      override async write(key: string, value: string): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        await super.write(key, value);
      }
    }
    const kv = new SlowKv();
    const h = createExportHistory(kv);
    await Promise.all([h.record(T + DAY), h.record(T)]);
    expect(await h.lastExportAt()).toBe(T + DAY);
    // And the same in the other order.
    const kv2 = new SlowKv();
    const h2 = createExportHistory(kv2);
    await Promise.all([h2.record(T), h2.record(T + DAY)]);
    expect(await h2.lastExportAt()).toBe(T + DAY);
  });

  it('keeps only the dates: exactly the two keys, no counter', async () => {
    const kv = new MemoryKv();
    const h = createExportHistory(kv);
    await h.record(T);
    await h.record(T + DAY);
    await h.recordReminderDismissed(T + DAY);
    expect([...kv.data.keys()].sort()).toEqual([
      'export.lastAtUtc',
      'export.reminderDismissedAtUtc',
    ]);
  });
});

describe('ExportReminder', () => {
  const make = (
    now: number,
  ): { kv: MemoryKv; reminder: ReturnType<typeof createExportReminder> } => {
    const kv = new MemoryKv();
    return {
      kv,
      reminder: createExportReminder({ history: createExportHistory(kv), clock: () => now }),
    };
  };

  it('is quiet with no data, due with data and no export, quiet after a recent export', async () => {
    const { reminder, kv } = make(T);
    expect(await reminder.isDue({ hasData: false })).toBe(false);
    expect(await reminder.isDue({ hasData: true })).toBe(true);
    kv.data.set(KV_KEYS.exportLastAtUtc, new Date(T - 3 * DAY).toISOString());
    expect(await reminder.isDue({ hasData: true })).toBe(false);
    kv.data.set(KV_KEYS.exportLastAtUtc, new Date(T - 15 * DAY).toISOString());
    expect(await reminder.isDue({ hasData: true })).toBe(true);
  });

  it('"Not now" silences it for 14 days, then it may speak again', async () => {
    const { reminder, kv } = make(T);
    await reminder.dismiss();
    expect(await reminder.isDue({ hasData: true })).toBe(false);
    const later = createExportReminder({
      history: createExportHistory(kv),
      clock: () => T + 15 * DAY,
    });
    expect(await later.isDue({ hasData: true })).toBe(true);
  });

  it('while locked it reads as never exported and dismiss does not throw', async () => {
    const { reminder, kv } = make(T);
    kv.locked = true;
    await expect(reminder.dismiss()).resolves.toBeUndefined();
    expect(await reminder.isDue({ hasData: true })).toBe(true);
  });
});
