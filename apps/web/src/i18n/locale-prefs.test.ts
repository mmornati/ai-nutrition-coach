import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KV_KEYS, KeyValueStoreLocked, type KeyValueStore } from '../storage/key-value-store';
import { LOCALE_HINT_KEY } from '../storage/constants';
import { browserLocaleHint, type LocaleHint } from './locale-hint';
import { currentLocale, setCurrentLocale } from './index';
import { DEFAULT_LOCALE, type Locale } from './locale';
import { applyStoredLocale, LocalePrefs } from './locale-prefs';

class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, string>();
  async read(key: string) {
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

const lockedKv: KeyValueStore = {
  isOpen: () => false,
  read: async () => null,
  write: async () => {
    throw new KeyValueStoreLocked();
  },
  delete: async () => {
    throw new KeyValueStoreLocked();
  },
};

const unreadableKv: KeyValueStore = {
  read: async () => {
    throw new Error('unreadable');
  },
  write: async () => undefined,
  delete: async () => undefined,
};

/** An in-memory kv that can be locked and unlocked, like the real one. */
class LockableKv extends MemoryKv {
  open = true;
  isOpen = () => this.open;
  override async read(key: string) {
    return this.open ? super.read(key) : null;
  }
}

class MemoryHint implements LocaleHint {
  value: Locale | null = null;
  read = () => this.value;
  write = (locale: Locale | null) => {
    this.value = locale;
  };
}

beforeEach(() => {
  window.localStorage.clear();
  setCurrentLocale(DEFAULT_LOCALE);
});

describe('LocalePrefs', () => {
  it('defaults to "Match my device" when nothing is stored', async () => {
    expect(await new LocalePrefs(new MemoryKv(), new MemoryHint()).readStored()).toBe('system');
    expect(new LocalePrefs(new MemoryKv(), new MemoryHint()).current()).toBe('system');
  });

  it('round-trips a pick, stores it under ui.locale and survives a new instance', async () => {
    const kv = new MemoryKv();
    await new LocalePrefs(kv, new MemoryHint()).write('fr');
    expect(kv.map.get(KV_KEYS.uiLocale)).toBe('fr');
    expect(await new LocalePrefs(kv, new MemoryHint()).readStored()).toBe('fr');
  });

  it('"system" removes the stored value and the hint', async () => {
    const kv = new MemoryKv();
    const hint = new MemoryHint();
    const prefs = new LocalePrefs(kv, hint);
    await prefs.write('fr');
    expect(hint.value).toBe('fr');
    await prefs.write('system');
    expect(kv.map.has(KV_KEYS.uiLocale)).toBe(false);
    expect(hint.value).toBeNull();
    expect(await prefs.readStored()).toBe('system');
    expect(prefs.current()).toBe('system');
  });

  it('an unsupported stored value reads as system; an unreadable or locked store is unknown (null)', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.uiLocale, 'klingon');
    expect(await new LocalePrefs(kv, new MemoryHint()).readStored()).toBe('system');
    expect(await new LocalePrefs(unreadableKv, new MemoryHint()).readStored()).toBeNull();
    expect(await new LocalePrefs(lockedKv, new MemoryHint()).readStored()).toBeNull();
  });

  it('remembers the last known preference for a synchronous first paint', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.uiLocale, 'fr');
    const prefs = new LocalePrefs(kv, new MemoryHint());
    expect(prefs.current()).toBe('system');
    await prefs.readStored();
    expect(prefs.current()).toBe('fr');
    await prefs.write('en');
    expect(prefs.current()).toBe('en');
  });

  it('a failed write keeps the pick in memory for this session and does not throw', async () => {
    const hint = new MemoryHint();
    const prefs = new LocalePrefs(lockedKv, hint);
    await expect(prefs.write('fr')).resolves.toBeUndefined();
    expect(await prefs.readStored()).toBe('fr');
    expect(hint.value).toBe('fr');
    // A new instance (the next session) has only the store to go on, and it is locked: unknown.
    expect(await new LocalePrefs(lockedKv, new MemoryHint()).readStored()).toBeNull();
  });
});

describe('applyStoredLocale', () => {
  it('shows the stored pick and refreshes a disagreeing hint', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.uiLocale, 'fr');
    const hint = new MemoryHint();
    hint.value = 'en';
    await applyStoredLocale(new LocalePrefs(kv, hint));
    expect(currentLocale()).toBe('fr');
    expect(hint.value).toBe('fr');
  });

  it('with "system" it follows the browser and clears a stale hint', async () => {
    const hint = new MemoryHint();
    hint.value = 'fr';
    await applyStoredLocale(new LocalePrefs(new MemoryKv(), hint));
    expect(currentLocale()).toBe('en'); // jsdom's navigator.language is en-US
    expect(hint.value).toBeNull();
  });
});

describe('applyStoredLocale when the store cannot be read', () => {
  it('keeps the hint and the locale when the store was locked between the session and the read', async () => {
    const kv = new LockableKv();
    kv.map.set(KV_KEYS.uiLocale, 'fr');
    const hint = new MemoryHint();
    hint.value = 'fr';
    setCurrentLocale('fr');
    kv.open = false; // locked after createSession, before the read
    await applyStoredLocale(new LocalePrefs(kv, hint));
    expect(hint.value).toBe('fr');
    expect(currentLocale()).toBe('fr');
  });

  it('keeps the hint and the locale when the read throws', async () => {
    const hint = new MemoryHint();
    hint.value = 'fr';
    setCurrentLocale('fr');
    await applyStoredLocale(new LocalePrefs(unreadableKv, hint));
    expect(hint.value).toBe('fr');
    expect(currentLocale()).toBe('fr');
  });

  it('an absent row on an open store still means system', async () => {
    const hint = new MemoryHint();
    hint.value = 'fr';
    setCurrentLocale('fr');
    await applyStoredLocale(new LocalePrefs(new LockableKv(), hint));
    expect(hint.value).toBeNull();
    expect(currentLocale()).toBe('en');
  });
});

describe('browserLocaleHint', () => {
  it('writes, reads and removes the plaintext key', () => {
    const hint = browserLocaleHint();
    expect(hint.read()).toBeNull();
    hint.write('fr');
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBe('fr');
    expect(hint.read()).toBe('fr');
    hint.write(null);
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBeNull();
  });

  it('ignores an unsupported value', () => {
    window.localStorage.setItem(LOCALE_HINT_KEY, 'de');
    expect(browserLocaleHint().read()).toBeNull();
  });

  it('never throws when storage refuses', () => {
    const refuse = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse),
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse),
    ];
    try {
      const hint = browserLocaleHint();
      expect(hint.read()).toBeNull();
      expect(() => hint.write('fr')).not.toThrow();
      expect(() => hint.write(null)).not.toThrow();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
