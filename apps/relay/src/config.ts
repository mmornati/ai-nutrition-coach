// The relay's settings, read once from the environment at start. Every value is validated and a bad
// one refuses to start (the message names the variable, never its value): a relay that silently
// fell back to a looser setting would be worse than one that does not run.

import {
  INVITE_PATTERN,
  SYNC_DEFAULT_MAX_VAULT_MB,
  SYNC_MAX_VAULT_MB_CEILING,
  SYNC_SIGNUP_MODES,
  type SyncSignupMode,
} from '@anc/core';

export interface RelayConfig {
  readonly host: string;
  readonly port: number;
  /** Where the SQLite file (and, unless given by the environment, the server secret) live. */
  readonly dataDir: string;
  /** `SYNC_IDENTITY`. Only `handle` exists in this phase. */
  readonly identity: 'handle';
  /**
   * What the relay does with a signup. `SYNC_SIGNUP` defaults to `invite`; `invite` with no codes
   * in `SYNC_INVITE_CODES` is `closed` here (nobody could ever present a valid code, so the offer
   * says closed instead of asking for a code that cannot exist). Logins always work.
   */
  readonly signup: SyncSignupMode;
  /** `SYNC_SIGNUP` is `invite` (the default) but no code is set: signups are closed until one is. */
  readonly signupNeedsCodes: boolean;
  readonly inviteCodes: readonly string[];
  readonly maxVaultBytes: number;
  readonly maxVaults: number;
  /** Devices (tokens) kept per vault; the oldest is dropped past this. */
  readonly maxDevicesPerVault: number;
  /** Requests per minute per client address across salt, login and signup. */
  readonly rateIpPerMinute: number;
  /** Failed logins per minute per (client address, handle); beyond it that client is refused. */
  readonly rateHandlePerMinute: number;
  /**
   * Failed logins per day for one handle from ANYONE: past it, logins for that handle are refused
   * (429) unless they present a device token of that same vault. Fails closed.
   */
  readonly rateHandlePerDay: number;
  /** Signups per hour per client address. */
  readonly rateSignupPerHour: number;
  /** Writes (PUT) per minute per device. */
  readonly rateWritePerMinute: number;
  /** Vault writes read at the same time (signups get half, min 1); more are told to come back shortly. */
  readonly maxConcurrentUploads: number;
  /** Days a device token may sit unused before it stops working (`SYNC_TOKEN_MAX_IDLE_DAYS`, 0 = never). */
  readonly tokenMaxIdleMs: number;
  /**
   * How long the version kept as "the previous one" is protected from being replaced by a further
   * write (`SYNC_KEEP_PREVIOUS_HOURS`, 0 = every write moves it, as before S4).
   */
  readonly keepPreviousMs: number;
  /** Believe `X-Real-IP` (set by the nginx in front, the only thing that can reach the relay). */
  readonly trustProxy: boolean;
  /** The server secret from the environment; absent: one is created in `dataDir`. */
  readonly serverSecret: string | undefined;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function whole(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[0-9]{1,9}$/.test(raw)) throw new ConfigError(`${name} must be a whole number.`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export function readConfig(env: Env): RelayConfig {
  const identity = env['SYNC_IDENTITY'] ?? 'handle';
  if (identity !== 'handle') {
    throw new ConfigError(
      'SYNC_IDENTITY must be "handle". Single sign-on (forward-auth) is not available yet.',
    );
  }
  // New copies are opt-in: an operator who wants the old open signup says `SYNC_SIGNUP=open`.
  const signup =
    env['SYNC_SIGNUP'] === undefined || env['SYNC_SIGNUP'] === '' ? 'invite' : env['SYNC_SIGNUP'];
  if (!SYNC_SIGNUP_MODES.includes(signup as SyncSignupMode)) {
    throw new ConfigError('SYNC_SIGNUP must be open, invite or closed.');
  }
  const inviteCodes = (env['SYNC_INVITE_CODES'] ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '');
  for (const code of inviteCodes) {
    if (!INVITE_PATTERN.test(code)) {
      throw new ConfigError(
        'SYNC_INVITE_CODES must be a comma-separated list of 4-64 characters from A-Z a-z 0-9 . _ ~ -.',
      );
    }
  }
  // `invite` without a code starts anyway: existing handles can log in, new signups are refused
  // (`closed`), and the start-up line says why (`signupNotice`).
  const signupNeedsCodes = signup === 'invite' && inviteCodes.length === 0;
  const port = whole(env, 'SYNC_PORT', 4100, 1, 65_535);
  const host = env['SYNC_HOST'] ?? '127.0.0.1';
  if (!/^[0-9A-Fa-f:.]{2,45}$/.test(host)) {
    throw new ConfigError('SYNC_HOST must be an IP address.');
  }
  const dataDir = env['SYNC_DATA_DIR'] ?? '/data';
  if (dataDir === '' || dataDir.includes('\0'))
    throw new ConfigError('SYNC_DATA_DIR is not valid.');
  const secret = env['SYNC_SERVER_SECRET'];
  if (secret !== undefined && secret !== '' && !/^[A-Za-z0-9._~+/=:-]{32,256}$/.test(secret)) {
    throw new ConfigError(
      'SYNC_SERVER_SECRET must be 32-256 characters of A-Z a-z 0-9 . _ ~ + / = : -.',
    );
  }
  const trust = env['SYNC_TRUST_PROXY'] ?? '0';
  if (trust !== '0' && trust !== '1') throw new ConfigError('SYNC_TRUST_PROXY must be 0 or 1.');
  return {
    host,
    port,
    dataDir,
    identity,
    signup: signupNeedsCodes ? 'closed' : (signup as SyncSignupMode),
    signupNeedsCodes,
    inviteCodes,
    maxVaultBytes:
      whole(env, 'SYNC_MAX_VAULT_MB', SYNC_DEFAULT_MAX_VAULT_MB, 1, SYNC_MAX_VAULT_MB_CEILING) *
      1024 *
      1024,
    maxVaults: whole(env, 'SYNC_MAX_VAULTS', 50, 1, 100_000),
    maxDevicesPerVault: whole(env, 'SYNC_MAX_DEVICES', 20, 1, 1000),
    rateIpPerMinute: whole(env, 'SYNC_RATE_IP', 30, 1, 100_000),
    rateHandlePerMinute: whole(env, 'SYNC_RATE_HANDLE', 10, 1, 100_000),
    rateHandlePerDay: whole(env, 'SYNC_RATE_HANDLE_DAY', 20, 1, 60_000),
    rateSignupPerHour: whole(env, 'SYNC_RATE_SIGNUP', 5, 1, 100_000),
    rateWritePerMinute: whole(env, 'SYNC_RATE_WRITE', 60, 1, 100_000),
    maxConcurrentUploads: whole(env, 'SYNC_MAX_UPLOADS', 3, 1, 16),
    tokenMaxIdleMs: whole(env, 'SYNC_TOKEN_MAX_IDLE_DAYS', 180, 0, 3650) * 86_400_000,
    keepPreviousMs: whole(env, 'SYNC_KEEP_PREVIOUS_HOURS', 24, 0, 8760) * 3_600_000,
    trustProxy: trust === '1',
    serverSecret: secret === '' ? undefined : secret,
  };
}

/** The one start-up line about a relay whose signups are closed only because no invite code is set. */
export function signupNotice(config: Pick<RelayConfig, 'signupNeedsCodes'>): string | null {
  return config.signupNeedsCodes
    ? 'relay: new signups are closed until invite codes are set (SYNC_INVITE_CODES, or `node /app/relay.mjs admin invites create`), or SYNC_SIGNUP=open; existing handles can still log in'
    : null;
}
