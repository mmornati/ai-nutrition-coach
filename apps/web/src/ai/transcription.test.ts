import { afterEach, describe, expect, it, vi } from 'vitest';
import { postTranscription } from './transcription';
import { FakeFetch } from './testing';

const HERE = 'https://plate.example.test';
const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

const post = (f: FakeFetch, url: string, apiKey: string | null) =>
  postTranscription({
    url,
    apiKey,
    model: 'whisper-1',
    audio,
    locale: 'en',
    fetch: f.fetch,
    signal: undefined,
  });

afterEach(() => vi.unstubAllGlobals());

describe('postTranscription behind a sign-in', () => {
  it("sends the cookie to this server's own proxy (no key), never with your own key or to another host", async () => {
    vi.stubGlobal('location', { origin: HERE });
    const f = new FakeFetch();
    f.jsonBody = { text: 'two eggs' };
    expect(await post(f, `${HERE}/ai/v1/audio/transcriptions`, null)).toEqual({
      kind: 'text',
      text: 'two eggs',
    });
    expect(f.last.init.credentials).toBe('same-origin');
    expect(f.last.init.redirect).toBe('manual');
    await post(f, 'https://api.example.com/v1/audio/transcriptions', 'sk-test-key-1234567890');
    expect(f.last.init.credentials).toBe('omit');
    // Your own key on this very origin is still a key-bearing call: no cookie.
    await post(f, `${HERE}/v1/audio/transcriptions`, 'sk-test-key-1234567890');
    expect(f.last.init.credentials).toBe('omit');
    await post(f, 'https://api.example.com/v1/audio/transcriptions', null);
    expect(f.last.init.credentials).toBe('omit');
  });

  it('a sign-in redirect or a non-JSON 401 / 403 on this server is "sign in again"; a provider JSON 401 is a rejected key', async () => {
    vi.stubGlobal('location', { origin: HERE });
    const url = `${HERE}/ai/v1/audio/transcriptions`;
    const g = new FakeFetch();
    g.opaqueRedirect = true;
    expect(await post(g, url, null)).toEqual({ kind: 'signInRequired' });
    for (const status of [401, 403]) {
      const h = new FakeFetch();
      h.status = status;
      h.jsonBody = '<html>sign in</html>';
      expect(await post(h, url, null)).toEqual({ kind: 'signInRequired' });
    }
    const j = new FakeFetch();
    j.status = 401;
    j.jsonBody = { error: { message: 'bad key' } };
    expect(await post(j, url, null)).toEqual({ kind: 'keyRejected' });
    // Your own key: a redirect is a plain failure, a 401 a rejected key.
    const k = new FakeFetch();
    k.opaqueRedirect = true;
    expect(
      await post(k, 'https://api.example.com/v1/audio/transcriptions', 'sk-test-key-1234567890'),
    ).toEqual({
      kind: 'failure',
    });
    const m = new FakeFetch();
    m.status = 401;
    m.jsonBody = '<html></html>';
    expect(
      await post(m, 'https://api.example.com/v1/audio/transcriptions', 'sk-test-key-1234567890'),
    ).toEqual({
      kind: 'keyRejected',
    });
  });
});
