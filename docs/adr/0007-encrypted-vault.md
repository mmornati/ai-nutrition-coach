# ADR 0007: Encrypted vault: backup, restore and cross-device sync

Status: accepted for S0 (groundwork, implemented); S1 to S4 are accepted as a plan and still pending · 2026-10-22
Resolves: PRD open question OQ-1 (the sync path left open by FR-10), `_bmad-output/planning-artifacts/prds/prd-openplate-2026-08-12/prd.md`.
Builds on: [ADR 0005](0005-web-encrypted-store.md) (the local encrypted store, unchanged by this ADR). The full plan, with phases and rough sizes, is [`docs/encrypted-sync-plan.md`](../encrypted-sync-plan.md); this ADR keeps the decisions.

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
- **The relay** (`apps/relay`, phase S2) ships in the self-host image behind an opt-in compose profile and is reached through nginx at `/sync/`, so the CSP `connect-src 'self'` and the external-host scan are unchanged. There is never an OpenPlate-owned server. A file-based encrypted backup (phase S1) needs no relay at all and is the fallback on every instance.
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

## Identity and relay limits (phase S2)

- **Handle** (default): a self-chosen handle, no email; login is handle plus `authKey`. An unknown handle gets a deterministic fake salt so handles cannot be enumerated. Signup is `open`, `invite` or `closed`.
- **Forward-auth** (optional): behind Authentik or Traefik the vault is bound to the SSO subject and the passphrase only decrypts.
- After login a device gets a revocable token, stored hashed on the server. Rate limits per IP and per handle.
- Limits: a maximum vault size (default 20 MB), a body cap, a cap on the number of vaults. The relay keeps **one previous envelope** per vault so a bad push can be rolled back by the client. Same container hardening as the app (read-only, `cap_drop: ALL`, non-root, healthcheck). A plain file backup of the relay volume is safe, since it holds ciphertext only.

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

- **AD-6 and the status chip.** The chip may say `synced` only after a durable remote acknowledgement of the data; the in-memory queue is replaced by a persisted dirty flag in phase S2.
- **`docs/your-data.md`** describes what exists (it says plainly that there is still no import and no sync) and is updated with each phase; `docs/self-host.md` and `docs/telemetry-posture.md` follow in S4 and the telemetry gate (`tools/check_telemetry_claims.mjs`) is updated for the one new user-enabled path.
- **Copy sign-off.** Every string about backup, restore and sync (English and French) is reviewed by the NDP reviewer; no nagging, no countdowns.
- **Rollout:** S1 (encrypted backup file and restore, no server), S2 (relay and restore on a new device), S3 (real multi-device sync, two-device end-to-end test, schema-skew refusal), S4 (recovery key, change passphrase, device list and revoke, delete my copy, docs). Each phase is its own change and is useful alone.
