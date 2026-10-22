import { describe, expect, it } from 'vitest';
import { KV_KEYS } from '../storage/key-value-store';
import { AiSettings, decodeAiSettings, encodeAiSettings } from './ai-settings';
import { AiSettingsController } from './ai-settings-controller';
import { InMemoryAiSettingsStore, KvAiSettingsStore } from './ai-settings-store';
import {
  HostBoundByokKeyStore,
  InMemoryByokKeyStore,
  KvByokKeyStore,
  byokKeyEndingHint,
  filterKeyInput,
} from './byok-key-store';
import { MemoryKv, TEST_KEY } from './testing';

describe('AiSettings JSON', () => {
  it('round-trips rung, previous rung, endpoint, model, key host and consents', () => {
    const s = new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'vision-1',
      byokKeyHost: 'api.example.com',
      photoConsentHosts: ['api.example.com', 'b.example.org'],
    });
    const back = decodeAiSettings(encodeAiSettings(s));
    expect(back.equals(s)).toBe(true);
    expect(back.byokKeyHost).toBe('api.example.com');
  });

  it('keeps the voice model: empty by default, round-trips, is bounded, and a change is a change', () => {
    expect(AiSettings.defaults.byokTranscriptionModel).toBe('');
    const s = new AiSettings({ byokTranscriptionModel: 'whisper-large-v3' });
    expect(decodeAiSettings(encodeAiSettings(s)).byokTranscriptionModel).toBe('whisper-large-v3');
    expect(s.equals(AiSettings.defaults)).toBe(false);
    expect(s.copyWith({ byokTranscriptionModel: '' }).byokTranscriptionModel).toBe('');
    const hostile = JSON.stringify({ v: 1, kind: 'noOp', txModel: 'x'.repeat(500) });
    expect(decodeAiSettings(hostile).byokTranscriptionModel).toBe('');
    expect(
      decodeAiSettings(JSON.stringify({ v: 1, kind: 'noOp', txModel: 7 })).byokTranscriptionModel,
    ).toBe('');
    // An older blob without the field reads as the default.
    expect(decodeAiSettings(JSON.stringify({ v: 1, kind: 'noOp' })).byokTranscriptionModel).toBe(
      '',
    );
  });

  it('corrupt or hostile blobs fall back to the defaults and never throw', () => {
    for (const raw of [
      null,
      undefined,
      '',
      'not json',
      '[]',
      '42',
      '{"kind": 7}',
      '{"kind": "byok", "consents": "x", "endpoint": 5, "model": []}',
    ]) {
      const s = decodeAiSettings(raw);
      expect(s.byokEndpointUrl).toBe('');
      expect(s.photoConsentHosts.size).toBe(0);
      expect(['noOp', 'byok']).toContain(s.rung.kind);
    }
    expect(decodeAiSettings('not json').equals(AiSettings.defaults)).toBe(true);
  });

  it('rungs that are not available in this build normalise to No AI on load', () => {
    for (const kind of ['hostedQuota', 'local', 'bogus']) {
      expect(decodeAiSettings(`{"v":1,"kind":"${kind}"}`).rung.kind, kind).toBe('noOp');
    }
    const s = decodeAiSettings('{"v":1,"kind":"byok","previous":"hostedQuota"}');
    expect(s.rung.previousRung?.previousKind).toBe('noOp');
    // A BYOK rung with no (or itself as) previous rung remembers No AI.
    expect(decodeAiSettings('{"kind":"byok"}').rung.previousRung?.previousKind).toBe('noOp');
    expect(
      decodeAiSettings('{"kind":"byok","previous":"byok"}').rung.previousRung?.previousKind,
    ).toBe('noOp');
  });

  it('consent hosts are lower-cased and bounded', () => {
    const many = Array.from({ length: 100 }, (_, i) => `"h${i}"`).join(',');
    const s = decodeAiSettings(`{"consents": ["API.Example.COM", "", 5, ${many}]}`);
    expect(s.hasConsentFor('api.example.com')).toBe(true);
    expect(s.hasConsentFor('API.EXAMPLE.COM')).toBe(true);
    expect(s.photoConsentHosts.size).toBeLessThanOrEqual(64);
  });

  it('"ask before every photo" defaults to ON and round-trips', () => {
    expect(AiSettings.defaults.askBeforeEveryPhoto).toBe(true);
    // A blob saved by an older build has no such key: the safe default.
    expect(decodeAiSettings('{"v":1,"kind":"noOp"}').askBeforeEveryPhoto).toBe(true);
    // A hand-edited, non-boolean value is not a way to switch it off.
    expect(decodeAiSettings('{"askEveryPhoto":"no"}').askBeforeEveryPhoto).toBe(true);
    const off = AiSettings.defaults.copyWith({ askBeforeEveryPhoto: false });
    expect(decodeAiSettings(encodeAiSettings(off)).askBeforeEveryPhoto).toBe(false);
    expect(off.equals(AiSettings.defaults)).toBe(false);
    expect(off.toString()).toContain('askEveryPhoto: false');
  });

  it('never prints the endpoint (toString and JSON.stringify)', () => {
    const s = new AiSettings({ byokEndpointUrl: 'https://private.example.com/x' });
    expect(s.toString()).not.toContain('private');
    expect(JSON.stringify(s)).not.toContain('private');
    expect(`${s}`).toContain('endpoint: set');
  });
});

describe('settings stores', () => {
  it('KvAiSettingsStore keeps one JSON row under ai.settings and reads defaults when unreadable', async () => {
    const kv = new MemoryKv();
    const store = new KvAiSettingsStore(kv);
    expect((await store.read()).equals(AiSettings.defaults)).toBe(true);
    const s = new AiSettings({
      byokEndpointUrl: 'https://x.example.com',
      byokModel: 'm',
      photoConsentHosts: ['x.example.com'],
    });
    await store.write(s);
    expect([...kv.map.keys()]).toEqual([KV_KEYS.aiSettings]);
    expect((await store.read()).equals(s)).toBe(true);
    kv.failReads = true;
    expect((await store.read()).equals(AiSettings.defaults)).toBe(true);
    kv.failReads = false;
    await store.clear();
    expect((await store.read()).equals(AiSettings.defaults)).toBe(true);
  });
});

describe('AiSettingsController', () => {
  it('persists FIRST and only then publishes', async () => {
    const order: string[] = [];
    const store = new InMemoryAiSettingsStore();
    const write = store.write.bind(store);
    store.write = async (s) => {
      order.push('persist');
      await write(s);
    };
    const c = new AiSettingsController({ store, initial: AiSettings.defaults });
    c.subscribe(() => order.push('publish'));
    await c.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
    expect(order).toEqual(['persist', 'publish']);
    expect(c.getSnapshot().rung.kind).toBe('byok');
  });

  it('a failed write publishes nothing and keeps the old state', async () => {
    const kv = new MemoryKv();
    const c = await AiSettingsController.load(new KvAiSettingsStore(kv));
    let published = 0;
    c.subscribe(() => (published += 1));
    kv.failWrites = true;
    await expect(c.grantPhotoConsent('api.example.com')).rejects.toThrow();
    expect(published).toBe(0);
    expect(c.getSnapshot().hasConsentFor('api.example.com')).toBe(false);
  });

  it('serialises read-modify-write: concurrent changes do not lose each other', async () => {
    const store = new InMemoryAiSettingsStore();
    const write = store.write.bind(store);
    store.write = async (s) => {
      await new Promise((r) => setTimeout(r, 5));
      await write(s);
    };
    const c = new AiSettingsController({ store, initial: AiSettings.defaults });
    await Promise.all([
      c.grantPhotoConsent('a.example.com'),
      c.grantPhotoConsent('B.example.com'),
      c.setByokTarget({ endpointUrl: ' https://a.example.com/v1 ', model: ' m ' }),
      c.setAskBeforeEveryPhoto(false),
    ]);
    const s = c.getSnapshot();
    expect([...s.photoConsentHosts].sort()).toEqual(['a.example.com', 'b.example.com']);
    expect(s.byokEndpointUrl).toBe('https://a.example.com/v1');
    expect(s.byokModel).toBe('m');
    expect(s.askBeforeEveryPhoto).toBe(false);
    expect((await store.read()).equals(s)).toBe(true);
  });

  it('revokes one host only, case-insensitively, and an unchanged value is not written', async () => {
    const store = new InMemoryAiSettingsStore();
    let writes = 0;
    const write = store.write.bind(store);
    store.write = async (s) => {
      writes += 1;
      await write(s);
    };
    const c = new AiSettingsController({ store, initial: AiSettings.defaults });
    await c.grantPhotoConsent('a.example.com');
    await c.grantPhotoConsent('b.example.com');
    await c.revokePhotoConsent('A.EXAMPLE.com');
    expect([...c.getSnapshot().photoConsentHosts]).toEqual(['b.example.com']);
    const before = writes;
    await c.setAskBeforeEveryPhoto(true); // already true
    expect(writes).toBe(before);
  });

  it('reload() picks up what was persisted (after an unlock)', async () => {
    const store = new InMemoryAiSettingsStore();
    const c = new AiSettingsController({ store, initial: AiSettings.defaults });
    await store.write(new AiSettings({ byokModel: 'later' }));
    await c.reload();
    expect(c.getSnapshot().byokModel).toBe('later');
  });
});

describe('byokKeyEndingHint', () => {
  it('shows only the last four, only for keys of 12+ characters', () => {
    expect(byokKeyEndingHint('sk-or-v1-abcdefgh1234')).toBe('1234');
    expect(byokKeyEndingHint('123456789012')).toBe('9012');
    expect(byokKeyEndingHint('short')).toBeNull();
    expect(byokKeyEndingHint('12345678901')).toBeNull();
    expect(byokKeyEndingHint(null)).toBeNull();
    expect(byokKeyEndingHint('')).toBeNull();
  });
});

describe('filterKeyInput', () => {
  it('removes the whitespace a paste drags along', () => {
    expect(filterKeyInput('  sk-abc\n def\t')).toBe('sk-abcdef');
  });
});

describe('key stores', () => {
  it('InMemoryByokKeyStore: write, read, clear, hasKey', async () => {
    const store = new InMemoryByokKeyStore();
    expect(await store.hasKey()).toBe(false);
    expect(await store.read()).toBeNull();
    await store.write('sk-test-1234');
    expect(await store.hasKey()).toBe(true);
    expect(await store.read()).toBe('sk-test-1234');
    await store.clear();
    expect(await store.hasKey()).toBe(false);
  });

  it('toString and JSON never reveal the key', async () => {
    for (const store of [new InMemoryByokKeyStore(TEST_KEY), new KvByokKeyStore(new MemoryKv())]) {
      await store.write(TEST_KEY);
      expect(String(store)).not.toContain('sk-');
      expect(JSON.stringify(store)).not.toContain('sk-');
    }
    expect(String(new InMemoryByokKeyStore(TEST_KEY))).toContain('ByokKeyStore');
    expect(
      String(
        new HostBoundByokKeyStore({
          inner: new InMemoryByokKeyStore(TEST_KEY),
          boundHost: 'a',
          endpointHost: 'a',
        }),
      ),
    ).not.toContain('sk-');
  });

  it('KvByokKeyStore keeps the key under ai.byokKey and a write while locked throws', async () => {
    const kv = new MemoryKv();
    const store = new KvByokKeyStore(kv);
    await store.write(TEST_KEY);
    expect(kv.map.get(KV_KEYS.aiByokKey)).toBe(TEST_KEY);
    expect(await store.hasKey()).toBe(true);
    kv.failWrites = true;
    await expect(store.write('x')).rejects.toThrow();
    await expect(store.clear()).rejects.toThrow();
  });

  it('HostBoundByokKeyStore releases the key only for the host it was entered for', async () => {
    const inner = new InMemoryByokKeyStore(TEST_KEY);
    const bound = (boundHost: string, endpointHost: string) =>
      new HostBoundByokKeyStore({ inner, boundHost, endpointHost });
    expect(await bound('api.example.com', 'API.example.com').read()).toBe(TEST_KEY);
    expect(await bound('api.example.com', 'api.example.com').hasKey()).toBe(true);
    // Another host, an unknown (older build) binding, or no endpoint host: the key reads as absent.
    for (const [b, e] of [
      ['api.example.com', 'evil.example.com'],
      ['', 'api.example.com'],
      ['api.example.com', ''],
    ] as const) {
      expect(await bound(b, e).read(), `${b}|${e}`).toBeNull();
      expect(await bound(b, e).hasKey(), `${b}|${e}`).toBe(false);
    }
    // Writes and clears pass through.
    await bound('x', 'y').clear();
    expect(await inner.hasKey()).toBe(false);
  });
});
