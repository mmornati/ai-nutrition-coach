/**
 * Validation and URL joining for the user-configured BYOK endpoint. The endpoint is typed by
 * the person, so it is untrusted input that decides where their key and their photos go:
 *
 * - `https` is required (a key over cleartext is a leaked key); the one exception is a model on
 *   this machine (`localhost`, `127.0.0.1`, `::1`) over plain `http`;
 * - no credentials in the URL, and no query string or fragment (a query is where keys leak);
 * - the chat-completions URL is built by URL resolution, so a trailing slash on the base never
 *   produces `//chat/completions`.
 */
export type ByokEndpointProblem =
  'empty' | 'notAUrl' | 'notHttps' | 'hasCredentials' | 'hasQueryOrFragment';

export type ByokEndpointValidation =
  | {
      readonly kind: 'valid';
      /** Always ends in `/`. */
      readonly base: string;
      /** Lower-case host without port or brackets: what the consent dialog names. */
      readonly host: string;
      /** A `localhost` / loopback endpoint (a model on this device). */
      readonly isLocal: boolean;
      /** `<base>/chat/completions`. */
      readonly chatCompletions: string;
    }
  | { readonly kind: 'invalid'; readonly problem: ByokEndpointProblem };

const invalid = (problem: ByokEndpointProblem): ByokEndpointValidation => ({
  kind: 'invalid',
  problem,
});

/** `localhost`, `127.0.0.1`, `::1` (also as the bracketed URL host `[::1]`). */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

// Exactly `http(s)://` and then a host character: rejects `javascript:`, `file:`, `ftp:`,
// scheme-less strings, `https://` and `https:///path` (which URL parsing would repair).
const HTTP_AUTHORITY = /^https?:\/\/[^/\\\s]/i;

export function validateByokEndpoint(raw: string): ByokEndpointValidation {
  const text = raw.trim();
  if (text === '') return invalid('empty');
  if (!HTTP_AUTHORITY.test(text)) return invalid('notAUrl');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return invalid('notAUrl');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '') return invalid('notAUrl');
  if (url.protocol === 'http:' && !isLoopbackHost(host)) return invalid('notHttps');
  if (url.username !== '' || url.password !== '') return invalid('hasCredentials');
  if (text.includes('?') || text.includes('#')) return invalid('hasQueryOrFragment');
  // Exactly one trailing slash, however many were typed.
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  const base = url.href;
  return {
    kind: 'valid',
    base,
    host,
    isLocal: isLoopbackHost(host),
    chatCompletions: new URL('chat/completions', base).href,
  };
}
