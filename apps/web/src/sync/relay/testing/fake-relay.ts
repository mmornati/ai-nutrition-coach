// Test support for the relay backup. Test-only: nothing in the app imports this, so it is never in a
// bundle. `FakeRelay` is a `RelayClient` that behaves the way the real relay (apps/relay) does where
// the app can tell: one answer for "no such handle" and "wrong passphrase", a deterministic fake
// salt, compare-and-swap on `If-Match` (412 with the current version), the monotonic version, and a
// log of every request body as JSON text so a test can assert that no plaintext ever left.

import {
  encodeBase64Url,
  etagOf,
  SYNC_KDF,
  type AccountInfo,
  type ChangePassphraseRequest,
  type ProofOf,
  type RecoveryMaterial,
  type RelayEnvelope,
  type SessionResponse,
  type SignupRequest,
  type VaultResponse,
} from '@anc/core';
import type { RelayClient, RelayResult, VaultFetch } from '../client';

interface FakeVault {
  readonly handle: string;
  salt: string;
  authKey: string;
  wrappedKey: string;
  readonly vaultId: string;
  version: number;
  envelope: RelayEnvelope;
  previous: RelayEnvelope | null;
  recovery: RecoveryMaterial | null;
}

export interface LoggedRequest {
  readonly method: string;
  readonly path: string;
  /** What would go on the wire as the body (JSON text), or `''`. */
  readonly body: string;
  readonly ifMatch?: string;
  /** The `If-None-Match` of a read: absent for an unconditional one. */
  readonly ifNoneMatch?: string;
}

const ok = <T>(value: T): RelayResult<T> => ({ kind: 'ok', value });
const err = (
  error: Extract<RelayResult<never>, { kind: 'error' }>['error'],
  extra: { retryAfterSeconds?: number; version?: number } = {},
): RelayResult<never> => ({ kind: 'error', error, ...extra });

export class FakeRelay implements RelayClient {
  readonly vaults = new Map<string, FakeVault>();
  readonly tokens = new Map<string, string>();
  readonly requests: LoggedRequest[] = [];
  /** Every call fails as if there were no network. */
  offline = false;
  /** Every call is turned away by the sign-in in front of the server. */
  signInRequired = false;
  /** Every call answers rate limited. */
  rateLimited = false;
  /** Every call answers an unusable reply. */
  broken = false;
  /** Runs just before the next write is judged: another device pushing first, say. */
  racePending: (() => Promise<void>) | null = null;
  /** Runs just before the next read is answered: the person locking the app while it is on the wire. */
  racePull: (() => Promise<void>) | null = null;
  /** How many reads were answered "not modified" (the cheap 304). */
  notModified = 0;
  /** Refuse the device token (as if it had been revoked). */
  revoked = false;
  signupMode: 'open' | 'closed' | 'invite' = 'open';
  #counter = 0;
  #tokens = 0;

  private log(
    method: string,
    path: string,
    body: unknown,
    ifMatch?: number,
    ifNoneMatch?: number,
  ): void {
    this.requests.push({
      method,
      path,
      body: body === undefined ? '' : JSON.stringify(body),
      ...(ifMatch === undefined ? {} : { ifMatch: etagOf(ifMatch) }),
      ...(ifNoneMatch === undefined ? {} : { ifNoneMatch: etagOf(ifNoneMatch) }),
    });
  }

  private gate(): RelayResult<never> | null {
    if (this.offline) return err('offline');
    if (this.signInRequired) return err('signInRequired');
    if (this.rateLimited) return err('rateLimited', { retryAfterSeconds: 42 });
    if (this.broken) return err('unavailable');
    return null;
  }

  private fakeSalt(handle: string): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < handle.length; i++)
      bytes[i % 16] = ((bytes[i % 16] ?? 0) * 31 + handle.charCodeAt(i)) & 0xff;
    return encodeBase64Url(bytes);
  }

  private newToken(handle: string): string {
    const bytes = new Uint8Array(32);
    this.#tokens++;
    new DataView(bytes.buffer).setUint32(0, this.#tokens);
    bytes.set(new TextEncoder().encode(handle).subarray(0, 20), 4);
    const token = encodeBase64Url(bytes);
    this.tokens.set(token, handle);
    return token;
  }

  private session(vault: FakeVault): SessionResponse {
    return {
      token: this.newToken(vault.handle),
      vaultId: vault.vaultId,
      wrappedKey: vault.wrappedKey,
      version: vault.version,
    };
  }

  private vaultOf(token: string): FakeVault | null {
    if (this.revoked) return null;
    const handle = this.tokens.get(token);
    return handle === undefined ? null : (this.vaults.get(handle) ?? null);
  }

  salt(handle: string) {
    this.log('POST', '/salt', { handle });
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaults.get(handle);
    return Promise.resolve(ok({ salt: vault?.salt ?? this.fakeSalt(handle), kdf: SYNC_KDF }));
  }

  signup(request: SignupRequest) {
    this.log('POST', '/signup', request);
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    if (this.signupMode === 'closed') return Promise.resolve(err('signupClosed'));
    if (this.signupMode === 'invite' && request.invite !== 'let-me-in') {
      return Promise.resolve(err('inviteInvalid'));
    }
    if (this.vaults.has(request.handle)) return Promise.resolve(err('handleTaken'));
    const vault: FakeVault = {
      handle: request.handle,
      salt: request.salt,
      authKey: request.authKey,
      wrappedKey: request.wrappedKey,
      vaultId: request.envelope.vaultId,
      version: 1,
      envelope: request.envelope,
      previous: null,
      recovery: request.recovery ?? null,
    };
    this.vaults.set(request.handle, vault);
    return Promise.resolve(ok(this.session(vault)));
  }

  login(handle: string, authKey: string) {
    this.log('POST', '/login', { handle, authKey });
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaults.get(handle);
    if (vault === undefined || vault.authKey !== authKey) return Promise.resolve(err('noMatch'));
    return Promise.resolve(ok(this.session(vault)));
  }

  recover(handle: string, authKey: string) {
    this.log('POST', '/recover', { handle, authKey });
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaults.get(handle);
    if (vault?.recovery == null || vault.recovery.authKey !== authKey) {
      return Promise.resolve(err('noMatch'));
    }
    return Promise.resolve(ok({ ...this.session(vault), wrappedKey: vault.recovery.wrappedKey }));
  }

  account(token: string): Promise<RelayResult<AccountInfo>> {
    this.log('GET', '/account', undefined);
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    const devices = [...this.tokens].filter(([, h]) => h === vault.handle);
    return Promise.resolve(
      ok({
        hasRecovery: vault.recovery !== null,
        previousVersion: vault.previous === null ? null : vault.previous.version,
        devices: devices.map(([t], i) => ({
          id: i + 1,
          label: '',
          createdAt: 0,
          lastSeenAt: 0,
          current: t === token,
        })),
      }),
    );
  }

  revokeDevices(token: string, target: { id: number } | { others: true }) {
    this.log('POST', '/devices/revoke', target);
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    let revoked = 0;
    if ('id' in target) {
      // The ids `account` lists: the position among this vault's tokens, from 1.
      const mine = [...this.tokens].filter(([, h]) => h === vault.handle);
      const hit = mine[target.id - 1];
      if (hit !== undefined) {
        this.tokens.delete(hit[0]);
        revoked++;
      }
    } else if ('others' in target) {
      for (const [t, h] of [...this.tokens]) {
        if (h === vault.handle && t !== token) {
          this.tokens.delete(t);
          revoked++;
        }
      }
    }
    return Promise.resolve(ok({ revoked }));
  }

  private proves(vault: FakeVault, proof: ProofOf): boolean {
    return proof.kind === 'passphrase'
      ? proof.authKey === vault.authKey
      : vault.recovery !== null && proof.authKey === vault.recovery.authKey;
  }

  changePassphrase(token: string, request: ChangePassphraseRequest) {
    this.log('POST', '/passphrase', request);
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    if (!this.proves(vault, request.proof)) return Promise.resolve(err('noMatch'));
    vault.salt = request.salt;
    vault.authKey = request.authKey;
    vault.wrappedKey = request.wrappedKey;
    let revoked = 0;
    for (const [t, h] of [...this.tokens]) {
      if (h === vault.handle && t !== token) {
        this.tokens.delete(t);
        revoked++;
      }
    }
    return Promise.resolve(ok({ revoked }));
  }

  setRecovery(token: string, proof: ProofOf, recovery: RecoveryMaterial | null) {
    this.log('POST', '/recovery', { proof, recovery });
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    if (proof.kind !== 'passphrase' || !this.proves(vault, proof)) {
      return Promise.resolve(err('noMatch'));
    }
    vault.recovery = recovery;
    return Promise.resolve(ok(null));
  }

  deleteVault(token: string, proof: ProofOf) {
    this.log('POST', '/delete', { proof });
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    if (!this.proves(vault, proof)) return Promise.resolve(err('noMatch'));
    this.vaults.delete(vault.handle);
    for (const [t, h] of [...this.tokens]) if (h === vault.handle) this.tokens.delete(t);
    return Promise.resolve(ok(null));
  }

  getPrevious(token: string): Promise<RelayResult<VaultResponse>> {
    this.log('GET', '/vault?previous=1', undefined);
    const blocked = this.gate();
    if (blocked) return Promise.resolve(blocked);
    const vault = this.vaultOf(token);
    if (vault === null) return Promise.resolve(err('unauthorized'));
    if (vault.previous === null) return Promise.resolve(err('notFound'));
    return Promise.resolve(
      ok({ vaultId: vault.vaultId, version: vault.previous.version, envelope: vault.previous }),
    );
  }

  async getVault(token: string, haveVersion?: number): Promise<RelayResult<VaultFetch>> {
    this.log('GET', '/vault', undefined, undefined, haveVersion);
    const blocked = this.gate();
    if (blocked) return blocked;
    const race = this.racePull;
    if (race !== null) {
      this.racePull = null;
      await race();
    }
    const vault = this.vaultOf(token);
    if (vault === null) return err('unauthorized');
    if (haveVersion === vault.version) {
      this.notModified++;
      return ok({ kind: 'notModified' });
    }
    return ok({
      kind: 'vault',
      vault: { vaultId: vault.vaultId, version: vault.version, envelope: vault.envelope },
    });
  }

  async putVault(
    token: string,
    envelope: RelayEnvelope,
    expectedVersion: number,
  ): Promise<RelayResult<{ readonly version: number }>> {
    this.log('PUT', '/vault', { envelope }, expectedVersion);
    const blocked = this.gate();
    if (blocked) return blocked;
    const vault = this.vaultOf(token);
    if (vault === null) return err('unauthorized');
    const race = this.racePending;
    if (race !== null) {
      this.racePending = null;
      await race();
    }
    if (expectedVersion !== vault.version) {
      return err('conflict', { version: vault.version });
    }
    if (envelope.vaultId !== vault.vaultId || envelope.version !== expectedVersion + 1) {
      return err('invalidRequest');
    }
    vault.previous = vault.envelope;
    vault.envelope = envelope;
    vault.version = envelope.version;
    return ok({ version: vault.version });
  }

  /** Every body sent so far, as one string, for "nothing readable left the device". */
  get wire(): string {
    return this.requests.map((r) => r.body).join('\n');
  }

  nextId(): number {
    return ++this.#counter;
  }
}
