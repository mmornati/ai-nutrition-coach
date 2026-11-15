// The app's side of the relay protocol (packages/core/src/vault/relay-protocol.ts): same-origin
// requests to /sync/v1/..., each one answered with a typed result and never a throw. The relay is
// untrusted input: every answer is parsed strictly, sizes are capped while they stream
// (`cappedFetch`), redirects are refused, and nothing is sent but the documented fields (the
// request builders take typed values, never an object to forward).

import {
  ENVELOPE_LIMITS,
  etagOf,
  parseAccountResponse,
  parseCountResponse,
  parsePutResponse,
  parseSaltResponse,
  parseSessionResponse,
  parseVaultResponse,
  SYNC_API_BASE,
  syncBodyCap,
  versionOfEtag,
  type AccountInfo,
  type ChangePassphraseRequest,
  type ProofOf,
  type RecoveryMaterial,
  type RelayEnvelope,
  type SaltResponse,
  type SessionResponse,
  type SignupRequest,
  type VaultResponse,
} from '@anc/core';
import { cappedFetch, isSignInAnswer, parseJsonBody, type FetchLike } from '../../net/capped-fetch';

export type RelayError =
  /** The request did not get an answer: no network, a timeout, a redirect. */
  | 'offline'
  /**
   * The sign-in in front of this server turned the call away (a redirect to the identity provider,
   * or a 401 / 403 that is not the relay's own JSON error). A page reload asks the person to sign in.
   */
  | 'signInRequired'
  /** The relay answered something that is not part of the protocol, or failed (5xx, unreadable). */
  | 'unavailable'
  | 'rateLimited'
  /** Login: no vault matches this handle and passphrase. Never says which of the two. */
  | 'noMatch'
  | 'handleTaken'
  | 'signupClosed'
  | 'inviteInvalid'
  | 'serverFull'
  /** The device token is not (or no longer) accepted. */
  | 'unauthorized'
  /** `If-Match` was stale: someone else wrote first. `version` is where the vault is now. */
  | 'conflict'
  | 'tooLarge'
  /** The relay speaks a newer envelope format than this app: update the app. */
  | 'newerFormat'
  | 'invalidRequest'
  | 'notFound';

export type RelayResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | {
      readonly kind: 'error';
      readonly error: RelayError;
      /** With `rateLimited`: the relay's Retry-After, in seconds. */
      readonly retryAfterSeconds?: number;
      /** With `conflict`: the version the vault is at now. */
      readonly version?: number;
    };

export type VaultFetch =
  { readonly kind: 'vault'; readonly vault: VaultResponse } | { readonly kind: 'notModified' };

export interface RelayClient {
  salt(handle: string): Promise<RelayResult<SaltResponse>>;
  signup(request: SignupRequest): Promise<RelayResult<SessionResponse>>;
  /** `label`: what this device is called in the owner's device list. */
  login(handle: string, authKey: string, label?: string): Promise<RelayResult<SessionResponse>>;
  /** Login with the recovery key's proof; the answer's `wrappedKey` is the one under the recovery key. */
  recover(handle: string, authKey: string, label?: string): Promise<RelayResult<SessionResponse>>;
  /** The devices of this vault, whether it has a recovery key, and the version kept before. */
  account(token: string): Promise<RelayResult<AccountInfo>>;
  revokeDevices(
    token: string,
    target: { readonly id: number } | { readonly others: true },
  ): Promise<RelayResult<{ readonly revoked: number }>>;
  /** Needs the token and a proof; every other device is signed out. */
  changePassphrase(
    token: string,
    request: ChangePassphraseRequest,
  ): Promise<RelayResult<{ readonly revoked: number }>>;
  /** Sets or replaces the recovery material, or removes it (`null`). Proof: the passphrase. */
  setRecovery(
    token: string,
    proof: ProofOf,
    recovery: RecoveryMaterial | null,
  ): Promise<RelayResult<null>>;
  /** Removes the server copy. Proof: the passphrase. */
  deleteVault(token: string, proof: ProofOf): Promise<RelayResult<null>>;
  /** The version kept before the current one (404 `invalidRequest`-free: `unavailable` when there is none). */
  getPrevious(token: string): Promise<RelayResult<VaultResponse>>;
  /** With `haveVersion`, an unchanged vault is answered `notModified` without its body. */
  getVault(token: string, haveVersion?: number): Promise<RelayResult<VaultFetch>>;
  /** Compare-and-swap: `expectedVersion` is sent as `If-Match`; the envelope is that version + 1. */
  putVault(
    token: string,
    envelope: RelayEnvelope,
    expectedVersion: number,
  ): Promise<RelayResult<{ readonly version: number }>>;
}

export interface RelayClientOptions {
  readonly fetch?: FetchLike | undefined;
  /** Prefix for the paths; empty is this page's own origin. */
  readonly base?: string;
}

const SMALL_BYTES = 64 * 1024;
const VAULT_BYTES = syncBodyCap(ENVELOPE_LIMITS.maxCiphertextBytes);
const SMALL_TIMEOUT_MS = 30_000;
const VAULT_TIMEOUT_MS = 120_000;

const fail = (
  error: RelayError,
  extra: { retryAfterSeconds?: number; version?: number } = {},
): RelayResult<never> => ({ kind: 'error', error, ...extra });

function errorCode(body: Uint8Array): string | undefined {
  const parsed = parseJsonBody(body);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const code = (parsed as Record<string, unknown>)['error'];
  return typeof code === 'string' ? code : undefined;
}

export function createRelayClient(options: RelayClientOptions = {}): RelayClient {
  const base = options.base ?? '';

  async function call(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    init: {
      token?: string;
      headers?: Record<string, string>;
      body?: unknown;
      large?: boolean;
    } = {},
  ): Promise<
    | {
        readonly ok: true;
        readonly status: number;
        readonly headers: Headers;
        readonly body: Uint8Array;
      }
    | { readonly ok: false; readonly result: RelayResult<never> }
  > {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    if (init.token !== undefined) headers['Authorization'] = `Bearer ${init.token}`;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await cappedFetch(`${base}${SYNC_API_BASE}${path}`, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      // The relay is this server's own path: behind a sign-in proxy it needs the session cookie.
      sameOriginCredentials: true,
      maxBytes: init.large ? VAULT_BYTES : SMALL_BYTES,
      headersTimeoutMs: init.large ? VAULT_TIMEOUT_MS : SMALL_TIMEOUT_MS,
      bodyTimeoutMs: init.large ? VAULT_TIMEOUT_MS : SMALL_TIMEOUT_MS,
      readBodyWhen: () => true,
      ...(options.fetch ? { fetchImpl: options.fetch } : {}),
    });
    if (response.kind === 'failure') {
      return {
        ok: false,
        result: fail(
          response.reason === 'tooLarge'
            ? 'unavailable'
            : response.reason === 'redirect'
              ? 'signInRequired'
              : 'offline',
        ),
      };
    }
    // The relay always answers 401 / 403 with its own `{ "error": code }`; one without it came
    // from the sign-in proxy in front.
    if (isSignInAnswer(response.status) && errorCode(response.body) === undefined) {
      return { ok: false, result: fail('signInRequired') };
    }
    return { ok: true, status: response.status, headers: response.headers, body: response.body };
  }

  /** The error every non-success status maps to; `context` says what a 401/403/409 mean there. */
  function mapError(
    status: number,
    headers: Headers,
    body: Uint8Array,
    context: 'login' | 'signup' | 'vault' | 'salt',
  ): RelayResult<never> {
    const code = errorCode(body);
    // A wrong proof of a secret (passphrase or recovery key) on an authenticated call.
    if (status === 401 && code === 'noMatch') return fail('noMatch');
    if (status === 404 && context === 'vault') return fail('notFound');
    switch (status) {
      case 429: {
        const retry = Number(headers.get('retry-after'));
        return fail(
          'rateLimited',
          Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {},
        );
      }
      case 401:
        return fail(context === 'login' ? 'noMatch' : 'unauthorized');
      case 403:
        return fail(
          code === 'signupClosed'
            ? 'signupClosed'
            : code === 'inviteInvalid'
              ? 'inviteInvalid'
              : 'invalidRequest',
        );
      case 409:
        return fail(context === 'signup' ? 'handleTaken' : 'invalidRequest');
      case 412: {
        const version = versionOfEtag(headers.get('etag'));
        return fail('conflict', version === null ? {} : { version });
      }
      case 413:
        return fail('tooLarge');
      case 507:
        return fail('serverFull');
      case 400:
      case 415:
      case 428:
        return fail('invalidRequest');
      default:
        return fail('unavailable');
    }
  }

  type Called = Awaited<ReturnType<typeof call>>;

  async function session(
    path: '/login' | '/recover',
    body: unknown,
  ): Promise<RelayResult<SessionResponse>> {
    const r = await call('POST', path, { body });
    if (!r.ok) return r.result;
    if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'login');
    const parsed = parseSessionResponse(parseJsonBody(r.body));
    return parsed === null ? fail('unavailable') : { kind: 'ok', value: parsed };
  }

  function counted(r: Called): RelayResult<{ readonly revoked: number }> {
    if (!r.ok) return r.result;
    if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
    const revoked = parseCountResponse(parseJsonBody(r.body), 'revoked');
    return revoked === null ? fail('unavailable') : { kind: 'ok', value: { revoked } };
  }

  function empty(r: Called): RelayResult<null> {
    if (!r.ok) return r.result;
    if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
    return { kind: 'ok', value: null };
  }

  return {
    async salt(handle) {
      const r = await call('POST', '/salt', { body: { handle } });
      if (!r.ok) return r.result;
      if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'salt');
      const salt = parseSaltResponse(parseJsonBody(r.body));
      return salt === null ? fail('unavailable') : { kind: 'ok', value: salt };
    },

    async signup(request) {
      const r = await call('POST', '/signup', { body: request, large: true });
      if (!r.ok) return r.result;
      if (r.status !== 201) return mapError(r.status, r.headers, r.body, 'signup');
      const session = parseSessionResponse(parseJsonBody(r.body));
      return session === null ? fail('unavailable') : { kind: 'ok', value: session };
    },

    async login(handle, authKey, label) {
      return session('/login', { handle, authKey, ...(label ? { label } : {}) });
    },

    async recover(handle, authKey, label) {
      return session('/recover', { handle, authKey, ...(label ? { label } : {}) });
    },

    async account(token) {
      const r = await call('GET', '/account', { token });
      if (!r.ok) return r.result;
      if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
      const info = parseAccountResponse(parseJsonBody(r.body));
      return info === null ? fail('unavailable') : { kind: 'ok', value: info };
    },

    async revokeDevices(token, target) {
      return counted(await call('POST', '/devices/revoke', { token, body: target }));
    },

    async changePassphrase(token, request) {
      return counted(await call('POST', '/passphrase', { token, body: request }));
    },

    async setRecovery(token, proof, recovery) {
      return empty(await call('POST', '/recovery', { token, body: { proof, recovery } }));
    },

    async deleteVault(token, proof) {
      return empty(await call('POST', '/delete', { token, body: { proof } }));
    },

    async getPrevious(token) {
      const r = await call('GET', '/vault?previous=1', { token, large: true });
      if (!r.ok) return r.result;
      if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
      const parsed = parseVaultResponse(parseJsonBody(r.body), ENVELOPE_LIMITS.maxCiphertextBytes);
      return parsed.kind === 'ok'
        ? { kind: 'ok', value: parsed.value }
        : fail(parsed.kind === 'newerFormat' ? 'newerFormat' : 'unavailable');
    },

    async getVault(token, haveVersion) {
      const r = await call('GET', '/vault', {
        token,
        large: true,
        ...(haveVersion === undefined ? {} : { headers: { 'If-None-Match': etagOf(haveVersion) } }),
      });
      if (!r.ok) return r.result;
      if (r.status === 304) return { kind: 'ok', value: { kind: 'notModified' } };
      if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
      const parsed = parseVaultResponse(parseJsonBody(r.body), ENVELOPE_LIMITS.maxCiphertextBytes);
      if (parsed.kind === 'ok')
        return { kind: 'ok', value: { kind: 'vault', vault: parsed.value } };
      return fail(
        parsed.kind === 'newerFormat'
          ? 'newerFormat'
          : parsed.kind === 'tooLarge'
            ? 'tooLarge'
            : 'unavailable',
      );
    },

    async putVault(token, envelope, expectedVersion) {
      const r = await call('PUT', '/vault', {
        token,
        large: true,
        headers: { 'If-Match': etagOf(expectedVersion) },
        body: { envelope },
      });
      if (!r.ok) return r.result;
      if (r.status !== 200) return mapError(r.status, r.headers, r.body, 'vault');
      const put = parsePutResponse(parseJsonBody(r.body));
      // The acknowledgement must be for the version this write was supposed to create.
      return put === null || put.version !== envelope.version
        ? fail('unavailable')
        : { kind: 'ok', value: put };
    },
  };
}

let shared: RelayClient | null = null;

/** The production client (this page's own origin). */
export function browserRelayClient(): RelayClient {
  shared ??= createRelayClient();
  return shared;
}
