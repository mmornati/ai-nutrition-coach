// A real relay on an ephemeral port, an in-memory database and a clock the test moves.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { encodeBase64Url, type RelayEnvelope } from '@anc/core';
import { createRelay } from '../src/app';
import { readConfig, type RelayConfig } from '../src/config';
import { createServerKeys } from '../src/keys';
import { openMemoryStore, type RelayStore } from '../src/store';

export interface Harness {
  readonly url: string;
  readonly store: RelayStore;
  readonly config: RelayConfig;
  readonly errors: string[];
  clock: number;
  advance(ms: number): void;
  close(): Promise<void>;
}

export const SECRET = new TextEncoder().encode('test-secret-0123456789abcdef0123456789');

export async function startRelay(
  env: Record<string, string> = {},
  store: RelayStore = openMemoryStore(),
): Promise<Harness> {
  const config = readConfig({
    SYNC_RATE_IP: '1000',
    SYNC_RATE_HANDLE: '1000',
    SYNC_RATE_SIGNUP: '1000',
    ...env,
  });
  const errors: string[] = [];
  const state = { clock: 1_700_000_000_000 };
  const server: Server = createServer(
    createRelay({
      config,
      store,
      keys: createServerKeys(SECRET),
      now: () => state.clock,
      onError: (name) => errors.push(name),
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    config,
    errors,
    get clock() {
      return state.clock;
    },
    set clock(value: number) {
      state.clock = value;
    },
    advance(ms) {
      state.clock += ms;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const bytes = (length: number, seed = 1): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff);
export const b64 = (length: number, seed = 1): string => encodeBase64Url(bytes(length, seed));

export const envelopeOf = (version: number, vaultId = b64(16, 1), seed = 3): RelayEnvelope => ({
  v: 1,
  vaultId,
  version,
  alg: 'A256GCM',
  nonce: b64(12, 2),
  ct: b64(64, seed + version),
});

export interface Vault {
  handle: string;
  authKey: string;
  vaultId: string;
  token: string;
}

export const post = (h: Harness, path: string, body: unknown, init: RequestInit = {}) =>
  fetch(`${h.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

export const signupBody = (handle: string, extra: Record<string, unknown> = {}, seed = 1) => ({
  handle,
  salt: b64(16, seed),
  authKey: b64(32, seed + 10),
  wrappedKey: b64(60, seed + 20),
  envelope: envelopeOf(1, b64(16, seed + 30)),
  ...extra,
});

export async function signup(h: Harness, handle = 'alice', seed = 1): Promise<Vault> {
  const body = signupBody(handle, {}, seed);
  const response = await post(h, '/sync/v1/signup', body);
  if (response.status !== 201) throw new Error(`signup answered ${response.status}`);
  const session = (await response.json()) as { token: string; vaultId: string };
  return { handle, authKey: body.authKey, vaultId: session.vaultId, token: session.token };
}

export const authed = (vault: Vault, headers: Record<string, string> = {}) => ({
  authorization: `Bearer ${vault.token}`,
  ...headers,
});

export const put = (h: Harness, vault: Vault, envelope: unknown, ifMatch: string | null) =>
  fetch(`${h.url}/sync/v1/vault`, {
    method: 'PUT',
    headers: authed(vault, {
      'content-type': 'application/json',
      ...(ifMatch === null ? {} : { 'if-match': ifMatch }),
    }),
    body: JSON.stringify({ envelope }),
  });

export const getVault = (
  h: Harness,
  vault: Vault,
  headers: Record<string, string> = {},
  query = '',
) => fetch(`${h.url}/sync/v1/vault${query}`, { headers: authed(vault, headers) });
