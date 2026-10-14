import { describe, expect, it } from 'vitest';
import { ByokAiRung } from './byok-ai-rung';
import { InMemoryByokKeyStore } from './byok-key-store';
import { NoopAiRung, UnavailableAiRung } from './noop-ai-rung';
import { makeFood } from './testing';
import type { ByokOutcome, ByokProvider } from './types';

class FakeProvider implements ByokProvider {
  calls = 0;
  receivedKeys: string[] = [];
  constructor(private readonly outcome: ByokOutcome | (() => never)) {}
  async recognize(args: { apiKey: string }): Promise<ByokOutcome> {
    this.calls += 1;
    this.receivedKeys.push(args.apiKey);
    if (typeof this.outcome === 'function') return this.outcome();
    return this.outcome;
  }
}

const bytes = new Uint8Array(0);
const rung = (store: InMemoryByokKeyStore, outcome: ByokOutcome) => {
  const provider = new FakeProvider(outcome);
  return { provider, rung: new ByokAiRung({ keyStore: store, provider }) };
};

describe('ByokAiRung', () => {
  it('no stored key: a calm key-missing failure BEFORE any transport call', async () => {
    const { provider, rung: r } = rung(new InMemoryByokKeyStore(), { kind: 'noMatch' });
    const result = await r.recognize(bytes);
    expect(result).toMatchObject({ kind: 'recognitionFailure', cause: 'keyMissing' });
    expect((result as { message: string }).message).toContain('byok key missing');
    expect(provider.calls).toBe(0);
  });

  it('an empty stored key is also "missing"', async () => {
    const { provider, rung: r } = rung(new InMemoryByokKeyStore(''), { kind: 'noMatch' });
    expect(await r.recognize(bytes)).toMatchObject({ cause: 'keyMissing' });
    expect(provider.calls).toBe(0);
  });

  it('recognized -> recognizedPlate', async () => {
    const foods = [makeFood('Apple')];
    const { rung: r } = rung(new InMemoryByokKeyStore('sk-test'), { kind: 'recognized', foods });
    expect(await r.recognize(bytes)).toEqual({ kind: 'recognizedPlate', foods });
  });

  it('noMatch -> noMatch', async () => {
    const { rung: r } = rung(new InMemoryByokKeyStore('sk-test'), { kind: 'noMatch' });
    expect(await r.recognize(bytes)).toEqual({ kind: 'noMatch' });
  });

  it('keyRejected -> failure, and the key is KEPT (no auto-clear)', async () => {
    const store = new InMemoryByokKeyStore('sk-test');
    const { rung: r } = rung(store, { kind: 'keyRejected' });
    const result = await r.recognize(bytes);
    expect(result).toMatchObject({ kind: 'recognitionFailure', cause: 'keyRejected' });
    expect((result as { message: string }).message).toContain('byok key rejected');
    expect(await store.read()).toBe('sk-test');
  });

  it('quotaExhausted -> quotaExhausted, with or without a reset time', async () => {
    const { rung: r1 } = rung(new InMemoryByokKeyStore('sk-test'), { kind: 'quotaExhausted' });
    expect(await r1.recognize(bytes)).toEqual({ kind: 'quotaExhausted' });
    const { rung: r2 } = rung(new InMemoryByokKeyStore('sk-test'), {
      kind: 'quotaExhausted',
      resetAt: 123,
    });
    expect(await r2.recognize(bytes)).toEqual({ kind: 'quotaExhausted', resetAt: 123 });
  });

  it('failure -> recognitionFailure carrying the cause and message', async () => {
    const { rung: r } = rung(new InMemoryByokKeyStore('sk-test'), {
      kind: 'failure',
      cause: 'network',
      message: 'network down',
    });
    expect(await r.recognize(bytes)).toEqual({
      kind: 'recognitionFailure',
      cause: 'network',
      message: 'network down',
    });
  });

  it('passes the stored key to the transport and never puts it in a result', async () => {
    const key = 'sk-secret-must-not-leak';
    const { provider, rung: r } = rung(new InMemoryByokKeyStore(key), {
      kind: 'failure',
      cause: 'unknown',
      message: 'something happened',
    });
    const result = await r.recognize(bytes);
    expect(provider.receivedKeys).toEqual([key]);
    expect(JSON.stringify(result)).not.toContain('sk-secret');
    expect(String(r)).not.toContain('sk-secret');
  });

  it('never throws across the port: a throwing transport or key store is a failure result', async () => {
    const provider = new FakeProvider(() => {
      throw new Error('boom sk-secret');
    });
    const r = new ByokAiRung({ keyStore: new InMemoryByokKeyStore('sk-secret'), provider });
    const result = await r.recognize(bytes);
    expect(result.kind).toBe('recognitionFailure');
    expect(JSON.stringify(result)).not.toContain('sk-secret');

    const broken = new InMemoryByokKeyStore('sk-secret');
    broken.hasKey = () => Promise.reject(new Error('locked'));
    const r2 = new ByokAiRung({
      keyStore: broken,
      provider: new FakeProvider({ kind: 'noMatch' }),
    });
    expect(await r2.recognize(bytes)).toMatchObject({ cause: 'keyMissing' });
  });
});

describe('NoopAiRung and the unavailable rungs', () => {
  it('No AI answers an empty recognized plate (never a failure), whatever the bytes', async () => {
    const rung = new NoopAiRung();
    expect(await rung.recognize()).toEqual({ kind: 'recognizedPlate', foods: [] });
  });

  it('hosted and local make no request and answer "unsupported", never throw', async () => {
    const rung = new UnavailableAiRung();
    const result = await rung.recognize();
    expect(result).toMatchObject({ kind: 'recognitionFailure', cause: 'unsupported' });
  });
});
