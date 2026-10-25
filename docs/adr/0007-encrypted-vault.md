# ADR 0007: Encrypted vault: backup, restore and cross-device sync

Status: accepted; S0 (groundwork), S1 (encrypted backup file, no server) and S2 (the relay, restore on a new device, automatic backup) are implemented; S3 and S4 are accepted as a plan and still pending (join-device flow added 2026-10-25) · 2026-10-22
Resolves: PRD open question OQ-1 (the sync path left open by FR-10), `_bmad-output/planning-artifacts/prds/prd-openplate-2026-08-12/prd.md`.
Builds on: [ADR 0005](0005-web-encrypted-store.md) (the local encrypted store, unchanged by this ADR). The full plan, with phases and rough sizes, is [`docs/encrypted-sync-plan.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/encrypted-sync-plan.md); this ADR keeps the decisions.

## Context

FR-10 asks for "sync across their own devices … on user-controlled infrastructure only", and leaves the path (a self-hosted relay or manual export and import) open as OQ-1. AD-6 already says writes are local-first, a sync adapter drains a durable outbox to user-controlled infrastructure, and a record is `synced` only after a durable remote acknowledgement. The repository has only the seam: ports, an in-memory queue and a local-only adapter that never reports `drained`. Export exists, import does not, and the JSON export is not a full-fidelity dump.

The data lives only in one browser's OPFS (ADR 0005). It is lost whenever that storage is lost:

- **Safari's seven-day eviction** of script-writable storage for a site that is not installed and not used;
- **an installed iOS web app**, which keeps its own storage, separate from Safari's;
- **a new device or a new browser profile**: nothing to restore from;
- **cleared site data**, by the person or by a "clean up" tool.

A person in any of these cases loses their whole history. The server is a static file server with no accounts and no storage by design, so any remedy must keep it that way unless the operator opts in, and must never let the operator read the data.

## Decision

**The unit of backup, restore and sync is one encrypted, full-fidelity snapshot of the person's data, merged on the client. An optional, opt-in relay, same origin, stores ciphertext it cannot read.**

- **Snapshot and client-side merge.** Syncing is pull, merge by uid, push: the device downloads the vault envelope, decrypts it, merges it with its own state using pure functions in `packages/core`, and uploads the result with a compare-and-swap (`If-Match`). Restore on a new device is the same code path as sync. The dataset is small (plates are insert-or-delete only, photos are never stored), so a whole snapshot is cheap and the server stays a dumb blob store with no log to compact.
- **The relay** (`apps/relay`, phase S2, implemented) ships in the self-host image behind an opt-in compose profile and is reached through nginx at `/sync/`, so the CSP `connect-src 'self'` and the external-host scan are unchanged. There is never an OpenPlate-owned server. A file-based encrypted backup (phase S1) needs no relay at all and is the fallback on every instance.
- **S0 (this change, no user-visible effect)** adds the groundwork to the existing store: schema v4, the pure vault code in the core, and the store methods to read and apply a snapshot. Nothing calls them yet.

## Alternatives rejected

- **Server-side merge or a server that understands the data.** It would need the server to see the data, which contradicts the whole posture. Rejected.
- **An operation log with CRDT replication.** Heavier on the wire and on the server, needs compaction and per-operation encryption, and gains little for append-or-delete data. A snapshot reduces the server to one compare-and-swap blob and makes restore trivial. If a vault ever grows past a few megabytes, move to chunked segments (monthly, each its own envelope) without changing the crypto.
- **Third-party sync (iCloud, Google Drive, Dropbox, a hosted backend).** Violates FR-10 and the no-third-party-host rule enforced by `tools/check_no_external_hosts.sh`. Rejected.
- **Relay-only, no backup file.** A file works on every instance, proves the format and the import, and needs no operator. S1 ships before S2.

## Keys (phases S1 and S2)

```
passphrase ──Argon2id(salt, m=64 MiB, t=3)──▶ masterKey (32 B)
masterKey ──HKDF "anc/vault/auth"──▶ authKey   sent to the relay to log in (never the passphrase)
masterKey ──HKDF "anc/vault/kek" ──▶ KEK       wraps the vault key; stays on the device
random 32 B ─────────────────────────────────▶ vaultKey   encrypts snapshots (AES-256-GCM)
optional recovery key (random 32 B, shown once) ──▶ a second wrap of vaultKey
```

- **Argon2id, from a pinned wasm build**, fetched at build time and SHA-256 pinned like sqlite3mc. The relay holds material that allows offline guessing, so memory hardness matters; the local store keeps PBKDF2 (ADR 0005).
- **The vault key is random, not derived.** Changing the passphrase re-wraps it and does not re-encrypt the data; a recovery key is another wrap of the same key.
- **No escrow.** A forgotten passphrase is unrecoverable unless the person saved a recovery key, which is shown once and never sent to the server.
- **Envelope:** `{v, vaultId, version, alg: "A256GCM", nonce, ct}` over the gzip of the snapshot JSON, with `vaultId` and `version` bound as associated data, so the server cannot swap vaults or replay an envelope under another version. The client keeps the last version it saw and refuses an older one.

## Phase S1: the encrypted backup file (implemented)

*Your data → Save an encrypted backup* writes `ai-nutrition-coach-YYYY-MM-DD.ancvault`; *Restore from a backup* (in *Your data*, and on the create-passphrase screen) reads it. No server, no new host, and the file works on every instance.

- **Envelope** (`packages/core/src/vault/envelope.ts`, shared with the relay later): `{ v: 1, vaultId, version, alg: "A256GCM", kdf: { name: "argon2id", v: 19, m, t, p }, salt, nonce, ct }`, an exact field set, binary fields in canonical unpadded base64url. `ct` is AES-256-GCM over the gzip of the canonical snapshot JSON. For a file, `vaultId` is 16 random bytes per file and `version` is 1; S2 gives them their relay meaning.
- **Associated data** is every field except `ct`, serialised with sorted keys (`envelopeAadText`): editing `vaultId`, `version`, `kdf`, `salt` or `nonce` fails authentication (a vault swap, a version replay, a KDF downgrade).
- **Keys:** `passphrase --Argon2id(salt 16 B, m = 65536 KiB, t = 3, p = 1, 32 B)--> master key --HKDF-SHA256(empty salt, info "anc/vault/backup-file")--> AES-256-GCM key` (WebCrypto, non-extractable; the master key bytes are zeroed once imported). The relay will use a random vault key wrapped by a key-encryption key instead; sealing and opening take a `CryptoKey`, and the KDF is a separate step (`sync/vault/kdf.ts`), so that is a change of caller, not of format.
- **KDF bounds, checked by the parser before anything is derived:** `p` must be 1; `m < 65536` or `t < 3` is refused as a *downgrade*; `m > 262144` or `t > 10` is refused as a *denial of service*. The Argon2id source is hash-wasm 4.12.0 (MIT), fetched and SHA-256-pinned like sqlite3mc and zxing (`scripts/fetch_web_argon2.sh`), served from our origin, precached, and run in a module worker that is terminated after each derivation; the unit tests check it against the RFC reference vector and against Node's `crypto.argon2Sync`.
- **Size limits:** a file over 32 MiB is refused before it is read; the ciphertext is bounded at 24 MiB; the decompressed snapshot at 96 MiB, counted as it streams (a gzip bomb is cut off, not buffered). Then `JSON.parse`, then the strict `parseVaultSnapshot`. A snapshot from a newer schema or snapshot version, or an envelope from a newer format, is reported as "newer" (update the app) before the parser could call it malformed.
- **Outcomes** are typed and content-free: `opened`, `wrongPassphraseOrDamaged` (GCM cannot tell a wrong key from a changed byte, and the UI does not pretend to), `notABackup`, `tooLarge`, `schemaTooNew`, `invalidContent`, `unavailable` (the KDF could not run: not a wrong passphrase). Nothing is written on any failure.
- **Restore into a new store** (the create-passphrase screen) opens and validates first, checks the clock-drift bound, and only then creates the store with the backup's passphrase (which must pass the app's strength floor) and applies the snapshot; if the apply fails the empty store is erased again, and if that erase fails too the store is locked and the unlock screen says an empty store was left behind (never "nothing changed"). The gunzip input is fed 32 KiB at a time and the output counted, so a bomb stops after a slice or two of input. **Restore into the open store** is `applySnapshot`, a merge.
- A backup counts as an export for the export reminder, which now suggests it.

## Phase S2: the relay, restore on a new device, automatic backup (implemented)

### The relay (`apps/relay`)

A TypeScript service on Node 24 with no runtime dependency: `node:http` and `node:sqlite` (one SQLite file on a volume), bundled to one file by esbuild and sharing the wire format with the app through `@anc/core` (`vault/relay-protocol.ts`). It is a compare-and-swap blob store plus a login: it never decrypts anything, and it logs nothing about a request (one line at start).

| Endpoint | What it does |
|---|---|
| `GET /sync/config.json` | `{enabled, v: 1, identity: "handle", signup, maxVaultMb}`. The app reads it strictly (anything else means "no relay offered" and the app shows nothing about sync). |
| `POST /sync/v1/salt` `{handle}` | `{salt, kdf}`. An unknown handle gets a deterministic fake salt, `HMAC(serverSecret, "salt", handle)`, of exactly the same shape. |
| `POST /sync/v1/signup` | `{handle, salt, authKey, wrappedKey, envelope (version 1), invite?}` → 201 `{token, vaultId, wrappedKey, version}`; 409 `handleTaken` (the one answer that names its cause); 403 `signupClosed` / `inviteInvalid`; 507 `serverFull`. |
| `POST /sync/v1/login` `{handle, authKey}` | 200 with a new device token, the wrapped vault key and the version; otherwise **one** answer, 401 `noMatch`, for "no such handle" and "wrong passphrase" alike (a dummy comparison keeps the time the same). |
| `GET /sync/v1/vault` | `Authorization: Bearer <token>`; `ETag: "<version>"`; `If-None-Match` → 304. `?previous=1` returns the one previous envelope (404 if none), so a client can roll back a bad push. |
| `PUT /sync/v1/vault` `{envelope}` | **`If-Match` is required** (428 without; only the exact `"<n>"` form is accepted). The envelope must be for this vault and for version `n + 1`. A stale `If-Match` is 412 `versionConflict` with the current version and ETag; two writers with the same `If-Match` get exactly one 200. |

Devices list/revoke, key re-wrap and vault delete are S4 and are not routes yet. A device token is revocable by design (stored hashed, one row per device); the relay keeps 20 per vault and, past that, drops the one used least recently (last seen, refreshed at most once a minute), so a phone that syncs is not signed out by a pile of look-ups made since.

- **Strict input.** Every body has an exact field set (`parseSaltRequest`, `parseSignupRequest`, ... in the core), `Content-Type: application/json` only (415), a body cap of `ceil(4/3 · SYNC_MAX_VAULT_MB) + 2 KiB` read while it streams (413, connection closed; a body past the cap stops being collected, is read and discarded up to 16 MiB more so the client still gets its answer, and one that stalls for 30 s is dropped), the vault size itself (the ciphertext) capped at `SYNC_MAX_VAULT_MB` (default 20, at most 24). A request that carries a plaintext field, a snapshot or a file envelope is a 400; the only thing stored is an envelope that passed the strict relay-envelope parser. A browser request that says it came from another site (`Sec-Fetch-Site`) is refused.
- **Secrets on the server.** `H(authKey)` is stored as `HMAC-SHA256(serverSecret, "auth", handle, authKey)` and compared in constant time; device tokens are 32 random bytes stored as an HMAC. `serverSecret` is `SYNC_SERVER_SECRET` or, by default, 32 random bytes written to `server.secret` (mode 0600) in the data directory at the first start. It keeps fake salts stable across restarts, so it belongs in the volume backup. `authKey` has 256 bits, so a fast keyed hash is enough; what makes guessing a passphrase offline expensive is the Argon2id run that precedes `authKey` on the client.
- **Rate limits** (in memory, fixed windows, 429 with `Retry-After`): per client address across salt, login and signup (30 per minute; an IPv6 client is its /64), **failed** logins per handle (10 per minute; counted for unknown handles too, which is what keeps the two indistinguishable; looking a handle up, a correct login and a signup do not count, so a stranger cannot lock a person out of restoring by merely asking, though someone who can fail ten logins a minute from enough addresses still can), signups per address (5 per hour), writes per device (60 per minute). Each kind has its own bounded table and each entry its own window; the tables that guard guessing and signing up turn new keys away when full rather than forget a counter. The address is the socket's, or `X-Real-IP` when `SYNC_TRUST_PROXY=1` (compose sets it: the app container's nginx is the only caller and sets that header). Behind a reverse proxy that does not forward the client address (Traefik, Caddy), everyone shares one bucket, as with the AI proxy; configuring nginx's `real_ip` for that proxy is left to the operator.
- **Memory.** A vault body is held in memory while it is checked, so: the vault count is checked before a signup body is read (a full server says so without reading it), at most `SYNC_MAX_UPLOADS` (default 3) bodies are read at the same time (503 with `Retry-After`, which the app retries), and the app container's nginx allows 8 requests in flight per address on `/sync/v1/`.
- **Signup** is `SYNC_SIGNUP=open|invite|closed` (`invite` needs `SYNC_INVITE_CODES`; codes are compared in constant time), `SYNC_MAX_VAULTS` (default 50).
- **Identity: handle only.** `SYNC_IDENTITY` accepts only `handle`; any other value, `forward-auth` included, refuses to start. **Forward-auth (a vault bound to an SSO subject) is deferred to S4**: it changes who may create a vault and what login means, and belongs with the device list and revocation it depends on. The deployments that put Authentik in front of the whole app already keep strangers out of `/sync/` too.

### Keys and formats as built

```
passphrase --Argon2id(salt 16 B, m = 65536 KiB, t = 3, p = 1)--> masterKey (32 B)     (SYNC_KDF = BACKUP_KDF, a constant)
masterKey --HKDF-SHA256(empty salt, info "anc/vault/auth")--> authKey   32 B, sent to the relay as base64url
masterKey --HKDF-SHA256(empty salt, info "anc/vault/kek") --> KEK       AES-256-GCM, non-extractable, never sent
random 32 B --------------------------------------------------> vaultKey seals every snapshot
wrappedKey = nonce (12 B) || AES-256-GCM(KEK, vaultKey, aad "anc/vault/wrap/v1|<vaultId>")      60 B, base64url
```

- **Wrap algorithm: AES-256-GCM, not AES-KW.** The same primitive as the envelope, and it takes associated data, so a wrapped key is bound to its vault id (a relay cannot hand a person another vault's wrap). The nonce is random 96-bit; one wrap exists per passphrase change, so there is no collision budget to worry about.
- **The master key bytes are wiped** once both HKDF outputs exist; the KEK and the opened vault key are non-extractable `CryptoKey`s. The vault key is kept (base64url) in the encrypted `kv` as a device-only key, so unlocking the local store is enough on a device that already has the vault: no second Argon2 run.
- **Envelope variant.** The relay's envelope is the S1 container without the passphrase step: `{ v: 1, vaultId, version, alg: "A256GCM", nonce, ct }`, in the same `envelope.ts` (`RelayEnvelope`, `parseRelayEnvelope`, `relayEnvelopeAadText`). It has no `kdf` and no `salt`, because it is sealed with the random vault key, not a passphrase-derived one. The two variants are told apart by their exact field set, and each reader refuses the other's as malformed. The associated data is every field but `ct`, sorted keys, no whitespace, so `vaultId` and `version` are authenticated: the relay cannot swap vaults or replay an old envelope under a newer number. `vaultId` is 16 random bytes chosen once by the first device; `version` is the compare-and-swap counter, +1 per accepted write. Plaintext is the same gzip of the canonical snapshot JSON as a backup file (`sync/vault/snapshot-codec.ts`), with the same size caps and the same "newer app" detection. A random 96-bit nonce per seal is safe for the thousands of writes one vault key will ever see.
- **KDF downgrade.** The salt response must name exactly the one KDF this build uses; a relay that advertises a cheaper one is treated as unusable.
- **Device-only `kv` keys** (never in a snapshot, never exported): `sync.handle`, `sync.token`, `sync.vaultKey`, `sync.vaultId`, `sync.lastSeenVersion`, `sync.dirty`. A connection is read only as a complete, valid set.

### The app

- **First-run screen: *Restore from this server*** (Case A), **Your data: *Back up to this server*** (Case C) and ***Connect to this server's copy*** (Case B), exactly as the plan's §3.6 and the section below describe. They appear only when `/sync/config.json` says a relay is offered. A found copy is opened and validated completely before anything is written; Case B shows the dry-run merge (`mergeVaultSnapshots`) first, with *Combine* as the primary button; a profile that differs by content is asked about once and the chosen value is written again, after the copy has been applied (so this device's clock has seen the other device's stamps, even if its own is behind), and gets a fresh stamp that wins everywhere; *Start fresh* sits behind *Other options*, offers the encrypted-backup button first and a named confirmation, checks the copy's passphrase (it becomes this device's) and clock before anything is erased, then hands the opened copy to the Gate across the erase (memory only, used once) so the new store is created from it without typing anything again.
- **Automatic backup.** The in-memory outbox is replaced by one persisted flag (`sync.dirty`, `DirtyFlagSyncQueue`, a `SyncQueue`): the storage layer tells the app after every write that landed (`StoreController.onWrite`, which wraps the open database; writes to device-only `kv` keys, such as the backup's own bookkeeping, do not count), the flag is set, and `SyncService` pushes about 30 s after the last write, at once when the page goes to the background, when the browser comes back online, and a few seconds after an unlock that finds the flag set. Only while the store is unlocked (the session is built on unlock and disposed on lock) and only while online. A failure retries after 1, 2, 4 ... 15 minutes.
- **A push never overwrites blindly.** One round (`runSyncCycle`) is: `GET` with `If-None-Match: "<last seen>"`; a newer version is opened (associated data checked), merged into the store with the same decision functions the stores use, and remembered; the snapshot is read again, sealed as version + 1 and sent with `If-Match`; a 412 means another device pushed first, so the round starts again, at most four times. The flag is cleared only by an acknowledgement of a push that began after the last write (a generation counter), so a write that lands during a push keeps it set.
- **Rollback protection.** The client keeps `sync.lastSeenVersion` and, if the relay returns an older version, a different vault, or an acknowledgement for a version other than the one written, it stops: nothing is merged or overwritten, and the screen says so.
- **Refusals that retrying cannot fix stop the automatic backup** and say why on *Your data* (a copy from a newer app, a rolled-back relay, a revoked token, a vault too large for the server, a damaged copy); *Back up now* tries once more. Stopping from this device only forgets the connection (the relay's copy is untouched).
- **The status chip is NOT lit (until S3, see "Phase S3" below).** It stays "On this device" everywhere. AD-6 allows `synced` only after a durable acknowledgement *of the data*, and the relay acknowledges whole snapshots, not plates: deriving a per-plate `synced` honestly needs the pull side (S3) and a record of what each acknowledged version contained. Until then the only place that says "backed up" is *Your data*, and only after an acknowledgement of a push that covered the last write. The relay `SyncAdapter` (`createRelaySyncAdapter`) answers `drained` only on such an acknowledgement and is otherwise a typed failure.
- **Telemetry gate.** Two files are allow-listed for the network, both same-origin through the capped fetch helper: `sync/relay/offer.ts` (`GET /sync/config.json`, no identifier) and `sync/relay/client.ts` (the `/sync/v1` calls of a person who turned the backup on). The Privacy page names the opt-in path (EN and FR, awaiting the NDP reviewer).

### Self-hosting

An opt-in compose profile `sync` (`sync-relay`: read-only root, `cap_drop: ALL`, `no-new-privileges`, non-root, health check, `tmpfs` for `/tmp`, a named volume `sync-data` for `/data`, **no published port**), its own image (`infra/Dockerfile.relay`, node pinned by version and digest, strict lockfile, one bundle), an nginx proxy for `/sync/config.json` and `/sync/v1/` only (rendered at start by `50-render-sync.sh`; `/sync/config.json` answers `{"enabled":false}` (as `/ai/config.json` does, so there is no red line in a console) and the rest of `/sync/` is a 404 unless `AI_NUTRITION_COACH_SYNC=1`; the vault is streamed, not buffered, because `/tmp` is a small tmpfs; the CSP is unchanged because everything is same-origin), and `bin/ai-nutrition-coach up --sync` (implies compose; also with `--tls` and `--traefik`). `scripts/smoke_self_host.sh` brings the profile up and exercises it. Operator backup is a plain copy of the volume (ciphertext, handles and keyed hashes only), together with `server.secret`.

## Phase S3: real multi-device sync (implemented)

`SyncService` (`apps/web/src/sync/relay/sync-service.ts`) now owns pulls as well as pushes; `runSyncCycle` is unchanged in shape (pull, merge, push only if needed, retry on 412) and a pull is simply a cycle with nothing to send.

### Pull triggers

| Trigger | Rule |
|---|---|
| Unlock | One cycle about 1 s after the session starts (5 s, and a push first, when changes were left unsent). |
| `visibilitychange` to visible, window `focus` | One cycle, at most one per **45 s** (measured from the last attempt, whatever its outcome); the two events that fire together are one request. Not while offline, stopped or already running. |
| `online` | A cycle at once (no throttle: the wait was real), never two at the same time. |
| A write, `visibilitychange` to hidden | As in S2: a push ~30 s after the last write, and at once when the page is hidden, only if changes wait. |

The pull is `GET` with `If-None-Match: "<last seen>"`, so an idle vault costs a 304 and nothing is decrypted, merged or applied. **A pulled copy is not a change to send** (S2's rewind rule, unchanged): the cycle pushes only if the device had unsent changes or what it holds now differs canonically from the relay's copy. Two idle devices therefore never ping-pong; a test drives two simulated devices through 100 focus events and asserts zero writes and an unmoved version.

### What the screens do with a pulled copy

Applying a snapshot already tells the store watches (`plates`, `notes`, `dismissals`), so the day board, the week, the plate page and the coach notes update through the same live reads as a local write, from a single transaction (no half-applied state is ever readable). What is cached beyond those watches is refreshed when the cycle reports that the pulled copy **changed** what the device holds (`onApplied`, decided by comparing the canonical snapshot before and after): the profile and the numbers preference (observable, so every screen follows), the interface language (applied at once, with the plaintext hint), the recipes in the food search, and the saved lists (`useSavedLists` re-reads on a revision count). Nothing replaces a component's own state: a plate being composed, a food search, a saved meal being renamed (keyed by its stable local id, since an apply updates a saved meal in place) and the allergy field keep what was typed. If the record being looked at was removed elsewhere, the plate page goes back to Today (as it did for a local removal). The refresh code only reads.

### What `synced` means (AD-6)

A **ledger** (`ledger.ts`) records which plates the relay is known to hold. The cycle feeds it with exactly three facts and nothing else:

1. a snapshot **fetched** from the relay (it holds it, whether or not applying succeeds);
2. the snapshot that was **sealed and acknowledged** (HTTP 200 to the `If-Match` PUT): the snapshot is the one read *before* sealing, so a record written after that read is not in it;
3. with nothing to send, the snapshot **read in a round where no write landed** (generation unchanged).

A plate is `synced` if its uid is in the ledger, `pending` if not, and `failed` ("Retry later") instead of `pending` while the last round failed or sync is stopped. The statuses are derived by the service and published through `SyncQueue.watchPerPlate` (`DirtyFlagSyncQueue.setPlateStatuses`); the relay `SyncAdapter` is the transport that produces the acknowledgements. A plate's record is written once and never edited, so its uid identifies its state; coach notes, saved meals and settings are separate records and do not move the plate's chip (the persisted dirty flag still covers them, and the header chip, below). The bridge from the screens' local ids to uids is one small store op (`readPlateUids`, ids and uids only).

**Persistence.** The ledger is stored in the device-only `sync.baseline` key (never in a snapshot or export), as fixed-width tokens (a 53-bit hash of each plate uid, not the uid), rewritten when it changes and seeded by create/join/restore with what the relay was just given or handed over. After a reload a held plate is still `synced` and an unacknowledged one is `pending`; an absent or malformed baseline is "unknown", which reads as `pending` until the unlock pull establishes it. It errs one way only: a write that fails leaves an older baseline, never a larger one. Past 50,000 plates it is kept in memory only.

**Header chip** (`chip.ts`): "On this device" without a connection; `pending` while changes wait or the device does not yet know; `synced` only when nothing waits and the ledger is known; `failed` ("Retry later") for a stopped sync or a failed push; and a distinct calm "update the app" state for schema skew. The page-level `SyncAnnouncer` is wired to the counts of pending and retry-later plates (aggregate, polite, never per plate, never on first render). A deletion's confirmation adds "It will also be removed from your other devices." only when the device is connected.

### Schema skew

A snapshot (or envelope) from a newer app, met on a pull, ends the cycle as `needsUpdate`: the copy is never applied, nothing is pushed (the pull comes first and a refusal ends the cycle), the stored version is not advanced, automatic sync stops (no further pulls or pushes from focus, writes or the hidden page) and the chip and *Your data* say "Update the app on this device to keep syncing". *Back up now* looks once more and still never writes. Updating the app and reloading starts a fresh session that syncs again.

### Lifecycle

Every guard from S2 (`isCurrent`) now also covers the pull: a cycle that outlives a lock, a disconnect or an erase applies nothing, writes no version, baseline or acknowledgement and tells no one. A revoked token (401) is `signedOut`, a rolled-back relay `rolledBack`, a copy dated beyond the drift bound `paused` (the store refuses the apply, nothing is written), a relay that cannot be reached `offline`/`failed` with the growing wait; each is a stated phase on *Your data*, a chip that does not say `synced` for anything unsent, and each is covered by a test.

## Identity and relay limits (as planned; see "Phase S2" above for what was built)

- **Handle** (default): a self-chosen handle, no email; login is handle plus `authKey`. An unknown handle gets a deterministic fake salt so handles cannot be enumerated. Signup is `open`, `invite` or `closed`.
- **Forward-auth** (optional, deferred to S4): behind Authentik or Traefik the vault is bound to the SSO subject and the passphrase only decrypts.
- After login a device gets a revocable token, stored hashed on the server. Rate limits per IP and per handle.
- Limits: a maximum vault size (default 20 MB), a body cap, a cap on the number of vaults. The relay keeps **one previous envelope** per vault so a bad push can be rolled back by the client. Same container hardening as the app (read-only, `cap_drop: ALL`, non-root, health check). A plain file backup of the relay volume is safe, since it holds ciphertext only.

## Joining a device and conflicts (phases S2 and S3, decided 2026-10-25)

The merge settles almost everything without a question; a choice is offered only where it cannot know what the person means. Details and copy are in the plan, §3.6.

- **Handle and passphrase are always asked together.** Handles cannot be enumerated (fake salts), so the app cannot test a handle alone; a failed lookup is one ambiguous line ("nothing matches this handle and passphrase"). Rate limiting has its own message. Signup may say a handle is taken.
- **A new device** restores without a question: the local store is created with the vault passphrase and the snapshot applied; a failure leaves no store behind.
- **A device with its own data** joins through a **dry-run merge and a preview** (server count, device count, combined count) before anything is written. **Combine** is the default and deletes nothing. If the synced `profile` differs by content, the person picks which one to keep once, and that value is re-stamped so it wins everywhere (pre-v4 profiles carry legacy stamps, so last-writer-wins would choose by device id). Other synced keys stay last-writer-wins. **Start fresh from the server copy** is an advanced option: it names the records that will leave this device, offers an encrypted backup file first, erases the local store and restores; the server is untouched.
- **"Replace the server copy with this device" is rejected.** Under a union merge, other devices merge the data back on their next sync; a working reset needs a vault epoch every device obeys, which is destructive for little gain. Starting over is *Delete my copy on this server* (S4), then a new vault.
- **Automatic, silent sync after joining.** A persisted dirty flag in `kv`, a debounced push (about 30 s after the last write, and when the page is hidden) while unlocked and online; every push is a compare-and-swap (`If-Match`), and a conflict (412) pulls, merges and retries. A push never overwrites blindly, from S2 on. A pulled copy is not itself a change to send: applying it does not mark the device dirty, so two idle devices do not bump the version for each other; a push follows a pull only if the device had unsent changes or what it holds now differs (canonically) from the relay's copy. S3 adds the pull on unlock and focus and the honest `synced` chip.

## Data model (S0, implemented in schema v4)

- **uid.** Every synced row gets a `uid`, a UUIDv7 (RFC 9562): 48-bit millisecond time, a 12-bit counter, random tail. One store's generator is strictly increasing, and it starts past the newest uid already stored (ignored when implausibly far ahead), so for rows written on a device, uid order is write order, which is how the entries of one plate are read back in order. Existing rows are numbered in id order during the migration (their creation time is not encoded). Non-null is enforced by an insert trigger per table, with a unique index. Integer ids stay internal to a store.
- **Hybrid logical clock.** A stamp is the text `<13-digit wall ms>-<4 hex counter>-<16 hex device id>`, so a string comparison orders it (wall, then counter, then device). `tick` never goes backwards, even if the wall clock does; `receive` orders a stamp after everything seen. The device id is 8 random bytes, made when the store opens and kept in `kv` under the device-only key `sync.deviceId`; it is embedded in every stamp, so it travels inside the ciphertext by design.
- **Drift bound.** A stamp more than 24 hours ahead of the device's wall clock is not believed: `receive` ignores it, the clock does not seed from one found in the store, and applying a snapshot that carries one is refused with a typed `clockAhead` result. A device with a wrong clock therefore cannot drag every other device (and every later write) into the future. The counter overflow (65,536 events in one millisecond) borrows the next millisecond; at the end of the 13-digit range it saturates rather than throw.
- **Stamps.** `updated_at_hlc` is set on create and on every change of a saved meal and a recipe, and sits on the `kv` row itself (not in a side table), written by the same upsert as the value. Records written before v4 get a legacy stamp: creation time on a device that does not exist for templates; wall time 0 on this device for settings, so they lose to any real write and two devices' legacy values for one key are ordered by device id, not by content.
- **Tombstones.** `tombstone(table_name, uid, deleted_at_hlc)`, keyed by table and uid. Deleting a plate writes tombstones for the plate, its entries, notes and interactions in the same transaction as the delete; deleting the notes of a plate does the same for notes and interactions; deleting a saved meal or recipe does it for the record and its items; deleting a synced `kv` key writes `kv:<key>`. **Pruning is not implemented.** The policy, for a later phase, is to drop a tombstone after every known device has synced past it, or after 180 days, whichever comes first. Until then tombstones are kept until the person erases all local data, which removes them with everything else.

## Merge rules

Pure functions in `packages/core/src/vault`, deterministic, with property tests (commutative, associative, idempotent, tombstone wins, convergence under any merge order):

| Record | Rule |
|---|---|
| Plates, food entries, coach notes, interactions | Union by uid. A tombstone always wins and removes the record, and a plate's tombstone removes everything under it. |
| Saved meals, recipes | Last writer wins on `updated_at_hlc`, as a whole record including its items. A tombstone wins unless the record was written strictly after it. |
| `kv` | Last writer wins per key, with the same tombstone rule. |
| Coach dismissals | Union, the latest time per key. A dismissal of a note travels with the note and goes when the note or its plate goes. |
| Tombstones | Union, the latest stamp per (table, uid). Never dropped by a merge. |

**Tie-breaks.** Stamps are unique per device, so a tie occurs only for legacy rows or a faulty device. Then the record with the larger canonical JSON (sorted keys) wins, so the choice is symmetric.

**Invariant: applying a snapshot uses the same decision function as merging.** `pickStamped` and `survivesTombstone` (`packages/core/src/vault/decide.ts`) are used by `mergeVaultSnapshots` and by both store implementations (SQL and in-memory) when a snapshot is applied to what is stored. Two devices that disagreed on a tie would never converge. A contract test checks that `read(apply(L, R))` equals `merge(read(L), R)` against both stores, with generators that produce same-uid, same-stamp, different-content records.

**Refusals (typed, nothing written).** A merge or an apply is refused when a uid means something else on the two sides (another table, or another parent), when the remote comes from a newer store schema than the local one, or when a stamp is beyond the drift bound.

## The kv allow-list

Which `kv` keys may enter a snapshot is an allow-list, and the default is exclusion (fail closed). A key added to the app later stays on the device until someone decides otherwise, and a web test forces every key in `KV_KEYS` into exactly one list.

- **Travel:** the profile, the interface language, the nutrition-numbers preference, the About-notice acknowledgement, and the export reminder state.
- **Never travel:** the BYOK AI key (a secret that spends money), the AI settings (the rung and endpoint chosen on this device), the AI coaching and describe consents, and the Open Food Facts answer (consent to contact a network destination is given per device), and the device id key. The auto-lock choice is not in `kv` at all (it is a plain browser setting).

## Snapshot format

A `VaultSnapshot` has `snapshotVersion: 1` and the `schemaVersion` of the store it came from. Records are linked by uid, columns are carried as the strings the store holds, and everything is in one canonical order, so equal states serialise identically. `parseVaultSnapshot(unknown)` is the strict parser for untrusted input (a backup file, a server response). It checks exact field sets; the form of every string the store writes (millisecond UTC instants, finite numbers, JSON objects, the kv value per key); sizes against `SNAPSHOT_LIMITS`; uid uniqueness across all tables; that a tombstone does not sit beside the record it removed; and that a note dismissal has its note. It reports a content-free path, never a value. A device on an older app refuses a snapshot from a newer schema and says to update the app; it never overwrites.

## Threat model (summary; the table is in the plan)

The relay operator or anyone who steals its volume learns the **size** of a vault, **when** it changed, and the **handle**, and nothing else; a malicious relay can serve an old or another vault's envelope, which the associated data and the version check expose. A network attacker learns TLS metadata. Someone who knows a handle can try online logins, which are rate limited. A lost passphrase without a recovery key means the data is gone, stated plainly. A stolen unlocked device exposes everything, as today. Not protected: a compromised app bundle served by the operator could exfiltrate keys, true of every web end-to-end-encrypted app.

## Consequences

- **Tombstones grow** until the pruning job exists; for a person's own history this is small.
- **Device ids are inside the ciphertext** (in every stamp); the server never sees them.
- **The whole snapshot is re-uploaded on every push.** That is cheap for thousands of plates and gets costlier with size; the size cap and the chunked-segment fallback bound it.
- **A corrupt local row** that fails the strict parser makes reading a snapshot fail (a typed `storeOperation`) rather than silently dropping the row from a backup.
- **A restore applies, it does not replace**: rows absent from the snapshot are not deleted from the store.
- The schema change is automatic, lossless and re-runnable; nothing about it is visible to the person.

## Obligations

- **AD-6 and the status chip.** The chip may say `synced` only after a durable remote acknowledgement of the data. The in-memory queue is replaced by a persisted dirty flag (done in S2), the chip was deliberately left at "On this device" until S3 could derive a per-plate answer honestly; S3 does (see "Phase S3": the ledger and the three facts that feed it).
- **`docs/your-data.md`** describes what exists (the encrypted backup, its restore, the opt-in backup to a server) and is updated with each phase. `docs/self-host.md` (enabling the profile, backing up the volume) and the telemetry gate's allow-list (two same-origin files) were updated in S2; `docs/telemetry-posture.md` and the threat-model write-up are completed in S4.
- **Copy sign-off.** Every string about backup, restore and sync (English and French) is reviewed by the NDP reviewer; no nagging, no countdowns.
- **Rollout:** S1 (encrypted backup file and restore, no server), S2 (relay and restore on a new device), S3 (real multi-device sync, two-device end-to-end test, schema-skew refusal), S4 (recovery key, change passphrase, device list and revoke, delete my copy, docs). Each phase is its own change and is useful alone.
