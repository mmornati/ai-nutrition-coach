// The relay's HTTP surface (docs/encrypted-sync-plan.md §3.5). A small, strict compare-and-swap blob
// store: it authenticates a handle by a keyed hash of a value derived from the passphrase, hands out
// device tokens, and stores/returns sealed envelopes. It parses every request with the shared strict
// parsers (an exact field set; nothing else is ever accepted, so no plaintext field can be stored
// by a well-formed client or smuggled in by a hostile one), keeps no log of what passes through,
// and tells "no such handle" from "wrong passphrase" nowhere.

import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  decodeBase64Url,
  etagOf,
  HANDLE_PATTERN,
  parseLoginRequest,
  parsePutVaultRequest,
  parseSaltRequest,
  parseSignupRequest,
  serializeRelayEnvelope,
  SYNC_API_BASE,
  SYNC_CONFIG_PATH,
  SYNC_FIELD_BYTES,
  SYNC_KDF,
  SYNC_SMALL_BODY_BYTES,
  syncBodyCap,
  versionOfEtag,
  type RequestParse,
  type SyncConfigBody,
  type SyncErrorBody,
  type SyncErrorCode,
} from '@anc/core';
import { addressKey } from './address';
import type { RelayConfig } from './config';
import { RateLimiter } from './limiter';
import { newToken, sameDigest, type ServerKeys } from './keys';
import type { RelayStore, VaultRow } from './store';

export interface RelayDeps {
  readonly config: RelayConfig;
  readonly store: RelayStore;
  readonly keys: ServerKeys;
  readonly now?: () => number;
  /** Told the NAME of an unexpected error (never a request, never a value). */
  readonly onError?: (name: string) => void;
}

const STATUS: Readonly<Record<SyncErrorCode, number>> = {
  noMatch: 401,
  rateLimited: 429,
  handleTaken: 409,
  signupClosed: 403,
  inviteInvalid: 403,
  serverFull: 507,
  unauthorized: 401,
  invalidRequest: 400,
  tooLarge: 413,
  unsupportedMediaType: 415,
  preconditionRequired: 428,
  versionConflict: 412,
  notFound: 404,
  methodNotAllowed: 405,
  unavailable: 503,
};

interface Reply {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

const json = (status: number, value: unknown, headers?: Record<string, string>): Reply => ({
  status,
  body: JSON.stringify(value),
  ...(headers ? { headers } : {}),
});

const fail = (
  code: SyncErrorCode,
  extra?: { version?: number; headers?: Record<string, string> },
): Reply => {
  const body: SyncErrorBody =
    extra?.version === undefined ? { error: code } : { error: code, version: extra.version };
  return json(STATUS[code], body, extra?.headers);
};

const limited = (retryAfterSeconds: number): Reply =>
  fail('rateLimited', { headers: { 'Retry-After': String(retryAfterSeconds) } });

class BodyError extends Error {
  constructor(readonly code: 'tooLarge' | 'invalidRequest' | 'unsupportedMediaType') {
    super(code);
  }
}

/** How much past the cap a refused body is read and thrown away before the connection is given up on. */
const DRAIN_LIMIT_BYTES = 16 * 1024 * 1024;
/** A body that stops arriving for this long is abandoned (it holds an upload slot meanwhile). */
const BODY_IDLE_MS = 30_000;

/**
 * The JSON body of a request, bounded while it is read (never buffered past `cap`). Past the cap the
 * collecting stops, the rest of the body is read and thrown away (up to `DRAIN_LIMIT_BYTES`), and
 * only then is the refusal reported. Throwing out of a `for await` would destroy the request, and
 * answering at once would close the socket under a client that is still sending: either way the
 * client sees a reset instead of the 413.
 */
function readJson(req: IncomingMessage, cap: number): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) {
    return Promise.reject(new BodyError('unsupportedMediaType'));
  }
  const declared = req.headers['content-length'];
  if (declared !== undefined && !/^[0-9]{1,12}$/.test(declared)) {
    return Promise.reject(new BodyError('invalidRequest'));
  }
  const declaredBytes = declared === undefined ? 0 : Number(declared);
  if (declaredBytes > cap + DRAIN_LIMIT_BYTES) return Promise.reject(new BodyError('tooLarge'));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    let over = declaredBytes > cap;
    let idle: NodeJS.Timeout | undefined;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      run();
    };
    const refuse = (code: BodyError['code']): void => {
      chunks.length = 0;
      finish(() => reject(new BodyError(code)));
    };
    const watch = (): void => {
      clearTimeout(idle);
      idle = setTimeout(() => refuse('invalidRequest'), BODY_IDLE_MS);
    };
    watch();
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      watch();
      total += chunk.length;
      if (total > cap) {
        over = true;
        chunks.length = 0;
      }
      if (total > cap + DRAIN_LIMIT_BYTES) {
        refuse('tooLarge');
        return;
      }
      if (!over) chunks.push(chunk);
    });
    req.on('end', () => {
      if (over) {
        refuse('tooLarge');
        return;
      }
      finish(() => {
        try {
          resolve(
            JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
            ) as unknown,
          );
        } catch {
          reject(new BodyError('invalidRequest'));
        }
      });
    });
    // The client went away mid-body: nobody is left to answer.
    req.on('error', () => refuse('invalidRequest'));
    req.on('close', () => refuse('invalidRequest'));
  });
}

/** The client address the limits are keyed on; IPv6 is bucketed by its /64 (see `address.ts`). */
function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  let address = req.socket.remoteAddress ?? 'unknown';
  if (trustProxy) {
    const forwarded = req.headers['x-real-ip'];
    if (typeof forwarded === 'string' && /^[0-9A-Fa-f:.]{2,45}$/.test(forwarded))
      address = forwarded;
  }
  return addressKey(address);
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  return match === null ? null : (match[1] ?? null);
}

const equalText = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createRelay(deps: RelayDeps): RequestListener {
  const { config, store, keys } = deps;
  const clock = deps.now ?? Date.now;
  // One table per kind of limit. Those that guard guessing or signing up refuse new keys when full
  // rather than forget a counter, so a flood of other addresses can never reset them.
  const ipLimiter = new RateLimiter();
  const failedLogins = new RateLimiter({ whenFull: 'refuse' });
  const signups = new RateLimiter({ whenFull: 'refuse' });
  const writeLimiter = new RateLimiter();
  // Uploads being read right now (signup and vault writes): each can hold tens of MB in memory.
  let uploadsInFlight = 0;
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const bodyCap = syncBodyCap(config.maxVaultBytes);
  // What an unknown handle's login is compared against, so it costs the same as a known one.
  const dummyDigest = keys.authDigest('', new Uint8Array(SYNC_FIELD_BYTES.authKey));

  const offer: SyncConfigBody = {
    enabled: true,
    v: 1,
    identity: 'handle',
    signup: config.signup,
    maxVaultMb: Math.round(config.maxVaultBytes / (1024 * 1024)),
  };

  const ipLimit = (req: IncomingMessage): Reply | null => {
    const decision = ipLimiter.hit(
      clientKey(req, config.trustProxy),
      config.rateIpPerMinute,
      MINUTE,
      clock(),
    );
    return decision.allowed ? null : limited(decision.retryAfterSeconds);
  };
  /** Is this handle locked out by failed logins? Looking is free: only a wrong proof counts. */
  const handleLocked = (handle: string): Reply | null => {
    const decision = failedLogins.peek(handle, config.rateHandlePerMinute, clock());
    return decision.allowed ? null : limited(decision.retryAfterSeconds);
  };
  const noteFailedLogin = (handle: string): void => {
    failedLogins.hit(handle, config.rateHandlePerMinute, MINUTE, clock());
  };

  /**
   * Runs `work` holding one of a few upload slots, or answers 503 when they are all taken. The
   * slot is taken BEFORE the body is read, so only that many bodies are ever in memory at once.
   */
  async function withUploadSlot(work: () => Promise<Reply>): Promise<Reply> {
    if (uploadsInFlight >= config.maxConcurrentUploads) {
      return fail('unavailable', { headers: { 'Retry-After': '5' } });
    }
    uploadsInFlight += 1;
    try {
      return await work();
    } finally {
      uploadsInFlight -= 1;
    }
  }

  async function parseBody<T>(
    req: IncomingMessage,
    cap: number,
    parse: (input: unknown) => RequestParse<T>,
  ): Promise<{ value: T } | { reply: Reply }> {
    let input: unknown;
    try {
      input = await readJson(req, cap);
    } catch (error) {
      if (error instanceof BodyError) return { reply: fail(error.code) };
      throw error;
    }
    const parsed = parse(input);
    if (parsed.kind === 'ok') return { value: parsed.value };
    return { reply: fail(parsed.kind === 'tooLarge' ? 'tooLarge' : 'invalidRequest') };
  }

  async function salt(req: IncomingMessage): Promise<Reply> {
    const blocked = ipLimit(req);
    if (blocked) return blocked;
    const body = await parseBody(req, SYNC_SMALL_BODY_BYTES, parseSaltRequest);
    if ('reply' in body) return body.reply;
    // The same shape, whether or not the handle exists.
    const row = store.vaultByHandle(body.value.handle);
    return json(200, { salt: row?.salt ?? keys.fakeSalt(body.value.handle), kdf: SYNC_KDF });
  }

  function session(row: VaultRow, status: number): Reply {
    const token = newToken();
    store.addDevice(row.rowId, keys.tokenDigest(token), clock(), config.maxDevicesPerVault);
    return json(status, {
      token,
      vaultId: row.vaultId,
      wrappedKey: row.wrappedKey,
      version: row.version,
    });
  }

  async function login(req: IncomingMessage): Promise<Reply> {
    const blocked = ipLimit(req);
    if (blocked) return blocked;
    const body = await parseBody(req, SYNC_SMALL_BODY_BYTES, parseLoginRequest);
    if ('reply' in body) return body.reply;
    const { handle, authKey } = body.value;
    const locked = handleLocked(handle);
    if (locked) return locked;
    const row = store.vaultByHandle(handle);
    const proof = keys.authDigest(handle, decodeBase64Url(authKey) ?? new Uint8Array(0));
    const matches = sameDigest(proof, row?.authDigest ?? dummyDigest);
    // One answer for "no such handle" and "wrong passphrase".
    if (row === null || !matches) {
      noteFailedLogin(handle);
      return fail('noMatch');
    }
    return session(row, 200);
  }

  async function signup(req: IncomingMessage): Promise<Reply> {
    const blocked = ipLimit(req);
    if (blocked) return blocked;
    const perHour = signups.hit(
      clientKey(req, config.trustProxy),
      config.rateSignupPerHour,
      HOUR,
      clock(),
    );
    if (!perHour.allowed) return limited(perHour.retryAfterSeconds);
    if (config.signup === 'closed') return fail('signupClosed');
    // Before a single byte of the body is read: a full server must not buffer megabytes to say so.
    if (store.vaultCount() >= config.maxVaults) return fail('serverFull');
    return withUploadSlot(async () => {
      const body = await parseBody(req, bodyCap, (input) =>
        parseSignupRequest(input, config.maxVaultBytes),
      );
      if ('reply' in body) return body.reply;
      const request = body.value;
      if (config.signup === 'invite') {
        const given = request.invite ?? '';
        // Every code is compared, so the time does not say which one was close.
        const valid = config.inviteCodes.map((code) => equalText(code, given)).includes(true);
        if (!valid) return fail('inviteInvalid');
      }
      // Asked again: the vaults could have filled up while the body was arriving.
      if (store.vaultCount() >= config.maxVaults) return fail('serverFull');
      const created = store.createVault(
        {
          handle: request.handle,
          vaultId: request.envelope.vaultId,
          salt: request.salt,
          authDigest: keys.authDigest(
            request.handle,
            decodeBase64Url(request.authKey) ?? new Uint8Array(0),
          ),
          wrappedKey: request.wrappedKey,
          envelope: serializeRelayEnvelope(request.envelope),
          size: Math.floor((request.envelope.ct.length * 3) / 4),
        },
        clock(),
      );
      if (created === 'handleTaken') return fail('handleTaken');
      const row = store.vaultByHandle(request.handle);
      return row === null ? fail('unavailable') : session(row, 201);
    });
  }

  /** The vault the bearer token belongs to, or the 401 reply. */
  function authenticate(req: IncomingMessage): VaultRow | Reply {
    const token = bearer(req);
    if (token === null) return fail('unauthorized');
    const rowId = store.vaultForDevice(keys.tokenDigest(token), clock());
    const row = rowId === null ? null : store.vaultByRowId(rowId);
    return row === null ? fail('unauthorized') : row;
  }

  const isReply = (value: VaultRow | Reply): value is Reply => 'status' in value;

  function getVault(req: IncomingMessage, url: URL): Reply {
    const row = authenticate(req);
    if (isReply(row)) return row;
    const previous = url.searchParams.get('previous');
    if (previous !== null) {
      if (previous !== '1') return fail('invalidRequest');
      if (row.previousEnvelope === null || row.previousVersion === null) return fail('notFound');
      return {
        status: 200,
        body: `{"vaultId":${JSON.stringify(row.vaultId)},"version":${row.previousVersion},"envelope":${row.previousEnvelope}}`,
        headers: { ETag: etagOf(row.previousVersion) },
      };
    }
    const etag = { ETag: etagOf(row.version) };
    if (versionOfEtag(req.headers['if-none-match']) === row.version)
      return { status: 304, headers: etag };
    return {
      status: 200,
      body: `{"vaultId":${JSON.stringify(row.vaultId)},"version":${row.version},"envelope":${row.envelope}}`,
      headers: etag,
    };
  }

  async function putVault(req: IncomingMessage): Promise<Reply> {
    const row = authenticate(req);
    if (isReply(row)) return row;
    const writes = writeLimiter.hit(String(row.rowId), config.rateWritePerMinute, MINUTE, clock());
    if (!writes.allowed) return limited(writes.retryAfterSeconds);
    const expected = versionOfEtag(req.headers['if-match']);
    if (expected === null) return fail('preconditionRequired');
    return withUploadSlot(async () => {
      const body = await parseBody(req, bodyCap, (input) =>
        parsePutVaultRequest(input, config.maxVaultBytes),
      );
      if ('reply' in body) return body.reply;
      const { envelope } = body.value;
      if (envelope.vaultId !== row.vaultId) return fail('invalidRequest');
      const conflict = (version: number): Reply =>
        fail('versionConflict', { version, headers: { ETag: etagOf(version) } });
      if (expected !== row.version) return conflict(row.version);
      // The counter moves by exactly one: no skipping ahead, no going back.
      if (envelope.version !== expected + 1) return fail('invalidRequest');
      const result = store.putEnvelope(
        row.rowId,
        expected,
        serializeRelayEnvelope(envelope),
        Math.floor((envelope.ct.length * 3) / 4),
        clock(),
      );
      if (result.kind === 'conflict') {
        return result.version === null ? fail('unauthorized') : conflict(result.version);
      }
      return json(200, { version: result.version }, { ETag: etagOf(result.version) });
    });
  }

  async function route(req: IncomingMessage): Promise<Reply> {
    const url = new URL(req.url ?? '/', 'http://relay.invalid');
    const method = req.method ?? 'GET';
    const path = url.pathname;

    // Only this site's own pages may use the relay from a browser. (Requests carry a bearer token,
    // not a cookie, so there is nothing to forge; this just keeps other sites from signing people
    // up through a visitor's browser.)
    const site = req.headers['sec-fetch-site'];
    if (method !== 'GET' && site !== undefined && site !== 'same-origin') {
      return { status: 403, body: JSON.stringify({ error: 'invalidRequest' }) };
    }

    const allow = (...methods: string[]): Reply | null =>
      methods.includes(method)
        ? null
        : fail('methodNotAllowed', { headers: { Allow: methods.join(', ') } });

    switch (path) {
      case '/sync/health':
        return allow('GET', 'HEAD') ?? json(200, { ok: true });
      case SYNC_CONFIG_PATH:
        return allow('GET', 'HEAD') ?? json(200, offer);
      case `${SYNC_API_BASE}/salt`:
        return allow('POST') ?? (await salt(req));
      case `${SYNC_API_BASE}/login`:
        return allow('POST') ?? (await login(req));
      case `${SYNC_API_BASE}/signup`:
        return allow('POST') ?? (await signup(req));
      case `${SYNC_API_BASE}/vault`:
        return allow('GET', 'PUT') ?? (method === 'GET' ? getVault(req, url) : await putVault(req));
      default:
        return fail('notFound');
    }
  }

  return (req, res) => {
    void route(req)
      .catch((error: unknown): Reply => {
        deps.onError?.(error instanceof Error ? error.name : 'error');
        return fail('unavailable');
      })
      .then((reply) => write(res, reply));
  };
}

function write(res: ServerResponse, reply: Reply): void {
  if (res.headersSent) return;
  const body = reply.body;
  res.writeHead(reply.status, {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // A refused oversize body may still be arriving: do not keep the connection for it.
    ...(reply.status === 413 ? { Connection: 'close' } : {}),
    ...reply.headers,
  });
  res.end(reply.status === 304 ? undefined : body);
}

/** For tests: is this text a handle the relay would accept. */
export const isHandle = (text: string): boolean => HANDLE_PATTERN.test(text);
