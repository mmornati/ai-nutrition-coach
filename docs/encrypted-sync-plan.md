# Encrypted backup, restore and cross-device sync: plan

Status: accepted 2026-10-22 (all five recommendations in §6 chosen) · S0 implemented ([ADR 0007](./adr/0007-encrypted-vault.md)).
Goal: a person can lose a browser's storage (cleared site data, Safari's 7-day eviction, a new phone,
an installed iOS web app that keeps its own storage) and get **all** their history back, and can use
the app on several devices, while the server only ever holds **ciphertext it cannot read**.

---

## 1. What exists today (the check)

### Planned, never built

| Where | What it says |
| --- | --- |
| PRD FR-10 (`_bmad-output/planning-artifacts/prds/prd-openplate-2026-08-12/prd.md:198`) | "sync across their own devices … on user-controlled infrastructure only". The path (self-host relay vs manual export/import) is left open as **OQ-1** (open question 6). |
| Architecture AD-6 (`ARCHITECTURE-SPINE.md:64`) | Writes are local-first; a sync adapter drains a **durable outbox** to user-controlled infra; `synced` only after a durable remote ack; no third-party sync. |
| Story 4.3 (`spec-4-3-durable-outbox-sync-to-user-controlled-infra.md`) | Flutter-era spec: `SyncQueue` + `SyncAdapter` ports, chip `local → pending → synced`; real relay explicitly "v1.1 follow-up". |
| `docs/self-host.md:487` "What's NOT in v1" | "A relay / sync server … a self-host relay and a durable outbox are future work." "Server-side accounts or storage — by design." |

### What the code actually has

- **The seam only.** `packages/core/src/ports/sync-queue.ts`, `sync-adapter.ts`,
  `use-cases/record-sync-op.ts`, `drain-sync-queue.ts`; in the app `apps/web/src/sync/`:
  `InMemorySyncQueue` (in memory **on purpose**, cleared on lock), `localOnlySyncAdapter`
  (`hasTransport: false`, never reports `drained`). The UI says "on this device", never "synced".
- **The local store** (ADR 0005): SQLite3MC (ChaCha20-Poly1305) in a worker on OPFS, key from
  PBKDF2-SHA256 600k over the passphrase; header in `localStorage` + an IndexedDB copy. Schema v3:
  `plate_log`, `food_entry`, `coach_note`, `coach_interaction`, `coach_dismissal`, `kv`,
  `saved_meal(_item)`, `recipe(_item)`.
- **Export without import.** CSV/JSON plaintext export; `your-data.md` states plainly *"there is no
  import"*, and the JSON is not a full-fidelity dump (no coach notes, no AI settings, no language).
- **The server is static.** nginx + an njs AI proxy, read-only container, no volume, no accounts.
  Optional identity already exists for self-hosters: Traefik forward-auth / Authentik overlays.
- **Config discovery pattern** to reuse: `GET /ai/config.json` read strictly by
  `apps/web/src/ai/instance-config.ts`.

### What blocks sync in the current data model

1. **Integer autoincrement ids everywhere.** Two devices both create `plate_log.id = 17`. Merging
   needs a globally unique id per record (UUIDv4/v7).
2. **Hard deletes.** `delete-plate` removes rows in one transaction; another device cannot learn
   that a plate was removed. Sync needs **tombstones**.
3. **No `updated_at`.** Saved meals, recipes and `kv` settings are mutable; merging needs a per-record
   modification clock.
4. **Lossy export.** No full-fidelity serialiser, and no import path at all.

Good news: plates are **insert-or-delete only** (editing = remove and re-log), photos are never
stored, so the dataset is small (thousands of plates ≈ a few MB of JSON, far less gzipped). That
makes a simple, robust design possible.

---

## 2. Design principles (kept from the existing posture)

- **End-to-end encrypted.** The server stores opaque blobs. It never sees the passphrase, a key,
  a food name, a timestamp of a meal. Self-hosters are often the operator *and* the user; we still
  design as if the operator were curious.
- **User-controlled infrastructure only** (FR-10): the relay ships in the self-host image, off by
  default; there is never an OpenPlate-owned server.
- **Local-first stays.** Writes never wait on the network; sync is an adapter behind the existing
  `SyncAdapter` port; the chip says `synced` only after a durable remote ack (AD-6).
- **No telemetry, no new hosts.** The relay is same-origin (`/sync/…`), so CSP `connect-src 'self'`
  is unchanged and `check_no_external_hosts.sh` keeps passing; the import-based telemetry gate
  (`tools/check_telemetry_claims.mjs`) pins the claim.
- **Honest copy, no dark patterns.** No nagging, no countdowns; the NDP reviewer signs the copy.
- **No escrow.** A forgotten passphrase is still unrecoverable *unless* the person saved a
  recovery key (optional, shown once, never sent to the server).

---

## 3. The proposed design

### 3.1 Shape: an encrypted *vault snapshot* with client-side merge

Instead of a per-operation log, each vault is **one encrypted snapshot** of the logical data plus a
version number. Syncing is *pull → merge → push*:

```
device                                   relay (same origin, /sync)
  │  GET /sync/v1/vault  (If-None-Match)   │
  │ ─────────────────────────────────────▶ │  returns {version, envelope} or 304
  │  decrypt, merge with local by UUID     │
  │  PUT /sync/v1/vault  If-Match: <ver>   │
  │ ─────────────────────────────────────▶ │  412 if someone pushed meanwhile → pull again
  │                       200 {version+1}  │
```

Why snapshot and not an op log: the data is small, plates are append/delete only, the server stays
trivially dumb (a compare-and-swap blob store), there is no log to compact, and **restore on a new
device is the same code path** as sync. If vaults ever grow past a few MB, move to chunked segments
(§7) without changing the crypto.

### 3.2 Keys

```
passphrase ──Argon2id(salt_v, m=64MiB, t=3)──▶ masterKey (32 B)
masterKey ──HKDF "anc/vault/auth"──▶ authKey   → sent to the relay to log in (never the passphrase)
masterKey ──HKDF "anc/vault/kek" ──▶ KEK       → wraps the vault key, stays on the device
random 32 B ─────────────────────────────────▶ vaultKey (DEK) → encrypts snapshots (AES-256-GCM)
optional recovery key (random 32 B, shown as 24 words / QR) ──▶ second wrap of vaultKey
```

- **vaultKey is random**, not derived: changing the passphrase only re-wraps it; a recovery key is
  just another wrap. The relay stores `salt_v`, `wrap(vaultKey, KEK)`, optionally
  `wrap(vaultKey, recoveryKey)`, and `H(authKey)` (salted, peppered; `authKey` is high-entropy, so
  a fast hash is enough server-side).
- **Argon2id for the vault**, not the existing PBKDF2: the relay holds material that allows offline
  guessing, so memory hardness matters. It needs a pinned wasm build (same practice as sqlite3mc:
  fetched at build time, SHA-256 pinned, precached). The local store keeps PBKDF2 (ADR 0005)
  unchanged.
- **One passphrase for the person.** On a device that already has the vault, `vaultKey` and a
  device token are kept in the encrypted `kv` table, so unlocking the local store is enough; no
  second KDF run per unlock. A new device derives once, at restore.
- **Envelope**: `{v:1, vaultId, version, alg:"A256GCM", nonce, ct}`; plaintext =
  gzip (`CompressionStream`) of the JSON snapshot. AAD binds `vaultId` + `version`, so the server
  cannot swap vaults or replay an envelope under another version.
- **Rollback protection**: the client keeps `lastSeenVersion` in `kv` and refuses an older one
  ("the server returned an older copy than this device has seen").

### 3.3 Identity on the relay

Two modes, chosen by the operator (`SYNC_IDENTITY`):

- **`handle`** (default): the person picks a handle (no email). Login = handle + `authKey`. The
  salt lookup for an unknown handle returns a deterministic fake salt (`HMAC(serverSecret, handle)`)
  so handles cannot be enumerated. Signup can be closed or invite-code gated
  (`SYNC_SIGNUP=open|invite|closed`).
- **`forward-auth`**: behind Authentik/Traefik the vault is bound to the SSO user header; the
  passphrase is then only for decryption.

After login the device gets a **revocable device token** (random, stored hashed server-side, kept
in the encrypted `kv`). Rate limits per IP and per handle on login, as the AI proxy does.

### 3.4 Data-model changes (schema v4)

- Add `uid TEXT` (UUIDv7) with a UNIQUE index to every synced table; backfill existing rows in the
  migration. SQLite cannot add a NOT NULL column without a default, so non-null is enforced by a
  BEFORE INSERT trigger per table (a NULL `uid` aborts the insert). Foreign keys in the snapshot use `uid`s; local integer ids stay internal.
- Add `updated_at_hlc TEXT` (hybrid logical clock: wall time + counter + device id) to mutable
  records: `saved_meal`, `recipe`, `kv` rows that sync.
- New `tombstone(uid, table_name, deleted_at_hlc)`; `delete-plate` and template deletes write one in
  the same transaction. Tombstones are pruned after every known device has synced past them, or
  after 180 days.
- Merge rules (pure functions in `packages/core`, heavily unit-tested):
  - plates (+ entries, coach notes, interactions): union by `uid`; tombstone wins.
  - saved meals / recipes: last-writer-wins on `updated_at_hlc`, whole record including items.
  - `kv`: LWW per key, **allow-list** of keys that sync (language, numbers pref, profile, the
    About-notice acknowledgement, export reminder state). Device-only keys never leave: auto-lock
    choice, device token, `lastSeenVersion`, the device id, AI settings and every consent to a
    network destination (AI coaching/describe consents and the Open Food Facts answer are given per
    device). **BYOK AI key: excluded by default** (decision 4).
  - coach dismissals: union.

### 3.5 The relay service

A small TypeScript service, `apps/relay`, shipped as an **opt-in container** (`--profile sync`),
reached through nginx at `/sync/` (same origin). SQLite on a named volume; the nginx container
stays read-only and data-free.

- Endpoints: `GET /sync/config.json` (offered? identity mode, limits; read strictly like
  `/ai/config.json`), `POST /sync/v1/salt`, `POST /sync/v1/signup`, `POST /sync/v1/login`,
  `GET|PUT /sync/v1/vault` (ETag/If-Match), `GET|DELETE /sync/v1/devices[/id]`,
  `PUT /sync/v1/keys` (re-wrap on passphrase change), `DELETE /sync/v1/vault`.
- Stores per vault: handle or SSO subject, `salt_v`, wrapped keys, `H(authKey)`, current envelope,
  version, size, `updated_at`; device tokens (hashed) with last-seen.
- Limits: max vault size (`SYNC_MAX_VAULT_MB`, default 20), body cap, rate limits, number of vaults.
- Keeps **one previous envelope** per vault so a bad push can be rolled back by the client.
- Logs nothing about content, no IPs beyond the existing access-log policy.
- Same hardening as the app container: `read_only`, `cap_drop: ALL`, non-root, healthcheck.

Operator backup becomes possible and safe: the volume holds ciphertext only, so a plain file
backup of the relay volume is a backup of every vault without exposing any of them.

---

## 4. Phased plan

Each phase is a PR (stacked, as with P0–P5), each usable on its own.

### Phase S0: ADR and groundwork (no user-visible change)
- [x] ADR 0007 ["Encrypted vault: backup, restore and sync"](./adr/0007-encrypted-vault.md) resolving OQ-1 (this document, shortened).
- [x] Schema v4: `uid`, `updated_at_hlc`, `tombstone`; deletes write tombstones; backfill migration;
  contract tests for the migration on a v3 database. (The kv stamp is a column on `kv`, not a
  `kv_meta` table; a deleted synced kv key is a tombstone `kv:<key>`.)
- [x] `packages/core`: full-fidelity `VaultSnapshot` type and strict `parseVaultSnapshot`,
  `mergeVaultSnapshots(local, remote)` (pure, typed refusals), HLC with a drift bound, UUIDv7, the kv allow-list, one shared decision function used by merge and by the stores' apply; the stores read a
  snapshot (`VaultStore.readSnapshot`) and apply one (`applySnapshot`). Property tests: merge is
  commutative, associative, idempotent, tombstones win.
- **Done when:** a v3 store migrates losslessly; snapshot → empty store → snapshot round-trips byte
  for byte; merge property tests pass.

### Phase S1: encrypted backup file + import (no server)
This alone fixes "local storage lost" for anyone who keeps the file, on every instance.
- *Your data → Save an encrypted backup*: writes `ai-nutrition-coach-YYYY-MM-DD.ancvault`
  (same envelope as the relay, key from the passphrase via Argon2id with the file's own salt).
- *Restore from a backup* on the create-passphrase screen and in *Your data* (merge into the
  current store, or fill a new one).
- The existing export reminder can point at the encrypted backup instead of plaintext export.
- **Done when:** e2e: log plates → backup → erase → restore → identical day board, in Chromium and
  WebKit; a wrong passphrase or a tampered file gives one calm line, never a partial import.

### Phase S2: relay + restore on a new device
- `apps/relay`, compose profile `sync`, nginx `/sync/` location, `bin/ai-nutrition-coach up --sync`.
- App: *Your data → Back up to this server* (create vault: handle, optional recovery key) and, on the
  first-run screen, *Restore from this server* (handle + passphrase → new local store).
- Automatic backup: a persisted dirty flag in `kv` replaces the in-memory outbox; push debounced
  (e.g. 30 s after the last write, and on `visibilitychange` hidden) while unlocked and online.
- **Done when:** self-host smoke brings up the profile; e2e restores on a fresh browser context;
  relay tests show it never receives plaintext (assert on captured request bodies).

### Phase S3: real multi-device sync
- Pull on unlock and on focus, merge, push with If-Match, retry on 412; `SyncAdapter` gets a real
  transport, so the status chip finally reaches `synced` honestly (AD-6).
- Two-device e2e: two browser contexts, interleaved writes and deletes, both converge.
- Handle schema skew: a device on an older app version refuses a newer snapshot schema and says
  "update the app on this device", never overwrites.

### Phase S4: account hygiene
- Recovery key flow (show once, confirm a few words, restore with it).
- Change passphrase (re-wrap only), list/revoke devices, "Delete my copy on this server",
  "Erase all local data" stays local and says so.
- Docs: `your-data.md`, `self-host.md` (backup the relay volume, threat model), privacy screen copy
  (EN + FR), NDP sign-off; telemetry gate updated for the one new user-enabled path.

### Later (only if needed)
- Chunked/segmented vaults if a vault passes ~5 MB (monthly segments, each its own envelope).
- WebAuthn PRF to unlock the device without typing the passphrase.

Rough size: S0 ~3–4 days, S1 ~3 days, S2 ~5 days, S3 ~4 days, S4 ~3 days (agent-loop pace,
plus review).

---

## 5. Threat model in one table

| Attacker | Gets | Mitigation |
| --- | --- | --- |
| Curious relay operator / stolen volume | ciphertext, sizes, update times, handle | E2EE; Argon2id makes offline guessing expensive; long-passphrase rule (≥ 10 chars already, consider ≥ 12 + strength hint for vaults) |
| Malicious relay | could serve an old or another vault's envelope | AAD binds vaultId + version; client refuses older versions |
| Network attacker | nothing beyond TLS metadata | HTTPS required (already, secure context) |
| Someone with the handle | can try online logins | rate limits; no enumeration via fake salts |
| Lost passphrase, no recovery key | data gone | stated plainly, as today |
| Stolen unlocked device | everything, as today | auto-lock, device revoke from another device |

Not protected, stated plainly: a compromised app bundle served by the operator could exfiltrate keys
(true of every web E2EE app; the self-host model means the operator is usually the user).

---

## 6. Decisions (taken 2026-10-22: the recommended option for each)

1. **Relay language/runtime**: TypeScript/Node in the monorepo (shares the envelope and snapshot
   types with `packages/core`) **(recommended)**, or a Go static binary (smaller image, two
   languages).
2. **Vault KDF**: Argon2id via pinned wasm **(recommended)**, or PBKDF2-SHA256 at a higher cost
   (no new wasm, weaker against a GPU attacker with the relay's data).
3. **Identity**: handle + passphrase by default, forward-auth as an option **(recommended)**; or
   forward-auth only (simpler, but excludes plain instances).
4. **BYOK AI key in the vault**: excluded (re-enter on each device) **(recommended)**, or included
   (it is E2EE, but a key that spends money travelling to every device is a bigger blast radius).
5. **Start with S1 (backup file) before the relay?** Recommended: it is useful on every instance,
   proves the format and the import, and is the fallback when no relay is offered.

---

## 7. Files this will touch (map)

- `packages/core/src/`: new `vault/` (snapshot, merge, HLC, envelope types), `ports/sync-adapter.ts`
  (real transport shape), `use-cases/delete-plate.ts` (tombstones).
- `apps/web/src/storage/schema.ts`, `constants.ts`, `web-encrypted-store.ts`,
  `web-saved-store.ts`, `key-value-store.ts` (uid, HLC, tombstones, kv allow-list).
- `apps/web/src/sync/`: replace `InMemorySyncQueue` with a persisted dirty-state queue, add
  `relay-sync-adapter.ts`, `vault-crypto.ts` (WebCrypto AES-GCM + HKDF, Argon2id wasm),
  `relay-config.ts` (strict reader, like `ai/instance-config.ts`).
- `apps/web/src/screens/gate/CreatePassphraseScreen.tsx` (restore entry points),
  `screens/settings/YourDataScreen.tsx` (backup, server copy, devices), `components/day/StatusChip.tsx`.
- `apps/relay/` (new), `infra/docker-compose.yml` (profile `sync`, volume), `infra/nginx/templates/`
  (`/sync/` location), `bin/ai-nutrition-coach`, `scripts/smoke_self_host.sh`.
- Docs: `docs/your-data.md`, `docs/self-host.md`, `docs/telemetry-posture.md`, new ADR 0007.
