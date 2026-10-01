# Your data — protection posture

AI Nutrition Coach is yours to run. This page is the honest answer to *"how is
my history protected?"* The answer differs by platform — and the
difference is documented plainly because overclaiming "encrypted at
rest" on a platform that can't honour it would be a trust break.

## Mobile (iOS, Android)

Your history lives in a local SQLite database encrypted at rest with
**ChaCha20-Poly1305** (SQLite3MultipleCiphers' `chacha20`, pinned
explicitly; an authenticated cipher, so tampered pages are detected).
The cipher is *not* AES-256 — earlier copy said so; it was wrong. The
32-byte key is generated on first run and held in the OS keystore
(iOS Keychain, accessible after first unlock and **this device only**;
Android Keystore-wrapped storage). It is not synced, and it is excluded
from backups. There is no server mirror, no third-party sync, no
telemetry. (Stories 1.2 / AD-8; Phase 2A.)

What this means in practice:

- On open the app verifies the database really is encrypted with the
  expected cipher and the key works; if not, it **refuses to open**
  (it never falls back to an unencrypted file).
- **Backups.** Android backup and device-transfer are disabled
  (`allowBackup=false` + `dataExtractionRules`). On iOS the keychain
  item is `first_unlock_this_device`, so a restored backup has no key.
  The encrypted database *file* currently still lives in the app's
  Documents directory, which iOS includes in iCloud / iTunes backups
  (it is useless without the key). Excluding it
  (`NSURLIsExcludedFromBackupKey`) needs a small native hook in
  `AppDelegate` and is a tracked follow-up — see
  `_bmad-output/review/security-and-quality-review-2026-10-01.md`
  (D5). Until then, do not describe the data as "never leaves the
  device" in a backup context; the key does, the ciphertext may.
- **Lost key.** If the database exists but its key is gone (restored
  backup, keystore reset, new device) the app does not invent a new
  key. It shows a calm message and one action, *Erase local data and
  start over*.
- **Erase all local data** (Your data screen, behind a confirmation)
  closes the database and deletes the file and its `-wal` / `-shm` /
  `-journal` sidecars, every secure-storage item (database key, BYOK
  key, quota counters, rung config) and any export files.
- **Exports** are plaintext copies. They are written to the system
  temp directory (not the backed-up Documents directory), handed to
  the system share sheet so *you* choose where they go, and our
  original is deleted straight after the hand-off whatever its outcome.
  On Android the share library first copies the file into the app cache
  (`share_plus/`) and shares that copy; we cannot know when the
  receiving app has finished with it, so those cache copies are purged
  when more than an hour old at the start of the next export, removed by
  *Erase all local data*, or dropped when the OS clears its cache.
  Until then a plaintext copy can exist in the app's private cache.
- **Upgrading from an early build.** Very early builds wrote the
  database unencrypted. On first launch the app detects the plaintext
  header and encrypts the file in place (keeping your data); if that
  fails it refuses to open and offers *Erase local data and start over*
  rather than use the plaintext file.

## Web (self-host, Flutter web build)

Your history lives in the same SQLite schema, opened against
`sqlite3.wasm` in your browser. The 32-byte key is derived from the
passphrase you enter on the lock screen via **PBKDF2-HMAC-SHA256**
(100,000 iterations, per-app salt) and held **in memory for the
session lifetime only** — never written to `localStorage`,
`IndexedDB`, or any web-side storage. A page reload or session
restart requires you to re-enter the passphrase.

This is described as **"session-sealed, not at-rest encrypted"**.
The browser's WASM sandbox + the OS process isolation give the key
real protection while the tab is open, but the key is not
persisted; a stolen unlocked device with the tab open is the same
threat model as a stolen unlocked mobile device, but a stolen
device with the tab closed is **not** the same threat model as a
stolen mobile device. We say so plainly. (Story 4.1 / AD-8.)

## What this means for self-hosters

- The first paint on the web build is a lock screen. There is no
  "auto-unlock" affordance and there will never be one.
- The lock screen's passphrase field masks the input. The key is
  derived in the same Dart runtime as the rest of the app — no
  JavaScript bridge, no browser `window.crypto` call, no telemetry
  on the unlock event (pinned by `melos run check:telemetry`).
- A wrong passphrase renders a single calm line: *"That passphrase
  does not open this store."* No exception is ever thrown across
  the storage port.

## What this means for contributors

- The `WebSessionKey` holder lives in
  `packages/integrations/lib/src/store/web_session_key.dart`. The
  key is in memory; never log it, never serialize it, never
  `toString()` it (the holder's `toString` is redacted to
  `WebSessionKey(isOpen: <bool>)`).
- The `WasmEncryptedStore` lives in
  `packages/integrations/lib/src/store/wasm_encrypted_store.dart`.
  While the session is locked, every `recordPlate` returns
  `StoreFailure(encryptedStoreError: WebSessionKeyFailure())` and
  every `watchRecent` stream is empty. The UI surfaces the calm
  "unlock the store first" line; no exception crosses the port.
- The web build's binary (`sqlite3.wasm` + the drift web worker) is
  the v1.1 follow-up. The architecture is in place so the binding
  drops in behind the same `EncryptedStore` port without a core
  change. The factory's `_openWasmDatabase` placeholder stands in
  for now.
- The AD-1 invariant holds: `packages/domain_core` is free of
  Flutter / SQLite / HTTP / web imports. The web adapter lives in
  `packages/integrations`; the lock screen widget body lives in
  `packages/integrations`; the apps/client `UnlockGate` + provider
  graph wire the two together.

## Cross-references

- `docs/ai-tiers.md` — the AI rung surface; same privacy posture.
- `docs/self-host.md` — the one-command self-host install (Story 4.4).
- `docs/no-dark-patterns-standard.md` — the named-reviewer gate
  (FR-15) that signs off this copy.
