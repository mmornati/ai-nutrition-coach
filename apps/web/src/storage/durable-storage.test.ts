import { describe, expect, it, vi } from 'vitest';
import { requestDurableStorage } from './durable-storage';

describe('requestDurableStorage', () => {
  it('reports unsupported when the browser has no persist()', async () => {
    expect(await requestDurableStorage({})).toBe('unsupported');
    expect(await requestDurableStorage(undefined)).toBe('unsupported');
  });

  it('does not ask again when the data is already persisted', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await requestDurableStorage({ persist, persisted: () => Promise.resolve(true) })).toBe(
      'persisted',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports the browser answer, granted or not', async () => {
    expect(await requestDurableStorage({ persist: () => Promise.resolve(true) })).toBe('persisted');
    expect(await requestDurableStorage({ persist: () => Promise.resolve(false) })).toBe(
      'notPersisted',
    );
  });

  it('a throwing browser is "unsupported", never an error', async () => {
    expect(await requestDurableStorage({ persist: () => Promise.reject(new Error('x')) })).toBe(
      'unsupported',
    );
  });
});
