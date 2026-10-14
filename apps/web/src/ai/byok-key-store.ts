import type { ByokKeyStorePort } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

/**
 * The encrypted on-device store for the BYOK key. It never appears in any string a holder
 * produces: `toString` is redacted and the key sits in a private field, so neither
 * `JSON.stringify` nor a console dump of a holder can reveal it.
 */
export type ByokKeyStore = ByokKeyStorePort;

/**
 * The only part of a saved key the UI may ever show: its last four characters, and only when
 * the key is long enough (12+) that four characters are a small fraction of it. Never the start
 * of the key (that identifies the provider and key family).
 */
export function byokKeyEndingHint(key: string | null | undefined): string | null {
  if (key === null || key === undefined || key.length < 12) return null;
  return key.slice(-4);
}

/**
 * The key as one row of the encrypted store (`kv`). It is readable only after the passphrase
 * unlock (a locked store reads as "no key"; a write while locked throws, and the caller reports a
 * storage failure rather than pretending it saved). Never `localStorage`.
 */
export class KvByokKeyStore implements ByokKeyStore {
  readonly #kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.#kv = kv;
  }

  read(): Promise<string | null> {
    return this.#kv.read(KV_KEYS.aiByokKey);
  }

  write(key: string): Promise<void> {
    return this.#kv.write(KV_KEYS.aiByokKey, key);
  }

  clear(): Promise<void> {
    return this.#kv.delete(KV_KEYS.aiByokKey);
  }

  async hasKey(): Promise<boolean> {
    const existing = await this.#kv.read(KV_KEYS.aiByokKey);
    return existing !== null && existing !== '';
  }

  toString(): string {
    return 'KvByokKeyStore()';
  }
}

/** In-memory holder for tests and the dev gallery. */
export class InMemoryByokKeyStore implements ByokKeyStore {
  #key: string | null;

  constructor(seed: string | null = null) {
    this.#key = seed;
  }

  async read(): Promise<string | null> {
    return this.#key;
  }

  async write(key: string): Promise<void> {
    this.#key = key;
  }

  async clear(): Promise<void> {
    this.#key = null;
  }

  async hasKey(): Promise<boolean> {
    return this.#key !== null && this.#key !== '';
  }

  toString(): string {
    return `ByokKeyStore(hasKey: ${this.#key !== null})`;
  }
}

/**
 * A view of `inner` that only yields the key while it is used for the host it was entered for.
 * `boundHost` is the host recorded when the key was saved (empty = unknown, e.g. saved by an
 * older build); `endpointHost` is the host the request would go to. On any mismatch the key
 * reads as ABSENT, so the rung reports "key missing" and nothing is sent: editing the endpoint
 * can never redirect a key to a new server. Writes and clears pass through.
 */
export class HostBoundByokKeyStore implements ByokKeyStore {
  readonly #inner: ByokKeyStore;
  readonly #boundHost: string;
  readonly #endpointHost: string;

  constructor(args: {
    readonly inner: ByokKeyStore;
    readonly boundHost: string;
    readonly endpointHost: string;
  }) {
    this.#inner = args.inner;
    this.#boundHost = args.boundHost.toLowerCase();
    this.#endpointHost = args.endpointHost.toLowerCase();
  }

  get #matches(): boolean {
    return (
      this.#boundHost !== '' && this.#endpointHost !== '' && this.#boundHost === this.#endpointHost
    );
  }

  async read(): Promise<string | null> {
    return this.#matches ? this.#inner.read() : null;
  }

  async hasKey(): Promise<boolean> {
    return this.#matches && (await this.#inner.hasKey());
  }

  write(key: string): Promise<void> {
    return this.#inner.write(key);
  }

  clear(): Promise<void> {
    return this.#inner.clear();
  }

  toString(): string {
    return 'HostBoundByokKeyStore()';
  }
}

/** A paste often drags a newline or spaces along: remove every whitespace and control character. */
export function filterKeyInput(raw: string): string {
  return raw.replace(/[\s\p{Cc}]/gu, '');
}

/** True when `key` (already trimmed) still has whitespace or control characters inside. */
export function keyHasInvalidCharacters(key: string): boolean {
  return /[\s\p{Cc}]/u.test(key);
}

/**
 * Attributes for the key field: obscured, no autofill, no suggestions, no spellcheck, no
 * password-manager capture. Spread onto the `<input>`.
 */
export const KEY_FIELD_ATTRIBUTES = Object.freeze({
  type: 'password',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  inputMode: 'text',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
} as const);
