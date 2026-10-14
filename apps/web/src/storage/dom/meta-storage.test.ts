// localStorage as the non-secret metadata store: reads and writes THROW when the browser refuses
// storage (a swallowed error would look like "no store yet" and lead to wiping real data).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserMetaStorage } from '../meta-storage';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('browserMetaStorage', () => {
  it('reads, writes and removes', () => {
    const storage = browserMetaStorage();
    expect(storage.read('ai_nutrition_coach.a')).toBeNull();
    storage.write('ai_nutrition_coach.a', '1');
    expect(storage.read('ai_nutrition_coach.a')).toBe('1');
    storage.remove('ai_nutrition_coach.a');
    expect(storage.read('ai_nutrition_coach.a')).toBeNull();
  });

  it('lists only the keys this app owns', () => {
    const storage = browserMetaStorage();
    storage.write('ai_nutrition_coach.web.store.meta', 'm');
    storage.write('ai_nutrition_coach.other', 'o');
    storage.write('someone.else', 'x');
    expect(storage.ownedKeys().sort()).toEqual([
      'ai_nutrition_coach.other',
      'ai_nutrition_coach.web.store.meta',
    ]);
  });

  it('THROWS when the browser refuses storage', () => {
    const storage = browserMetaStorage();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => storage.read('k')).toThrow();
    expect(() => storage.write('k', 'v')).toThrow();
  });
});
