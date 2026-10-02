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

Your history lives in the same SQLite schema, in your browser's
**IndexedDB**, encrypted at rest with the same **ChaCha20-Poly1305**
as mobile (SQLite3MultipleCiphers compiled to WebAssembly,
`sqlite3mc.wasm`). The 32-byte key is derived from a **passphrase you
choose** with **PBKDF2-HMAC-SHA256, 600,000 iterations, and a random
per-store salt**, computed by the browser's WebCrypto. The key is held
in memory only while the store is unlocked and is **never written to
disk**. What is written next to the data is not secret: the salt, the
KDF name and cost, and a format version, kept in `localStorage` with a
copy inside IndexedDB so clearing `localStorage` alone does not orphan
your data. Your passphrase is Unicode-normalised (NFC) before use, so
the same visible passphrase works whatever keyboard typed it. (Phase 2B /
AD-8; design and threat model: ADR-0002.)

What this means in practice:

- **First run** asks you to create a passphrase (typed twice, at
  least 10 characters). It says plainly, before you set it, that a
  forgotten passphrase **cannot be recovered**: there is no copy, no
  reset link, no escrow.
- **Every later visit** starts at an unlock screen. A wrong passphrase
  can never open the store: the database pages simply do not decrypt.
  After a few wrong attempts the screen adds a short wait. That wait is
  friction for fat fingers, **not** a security control: someone who
  copies your IndexedDB can guess offline at the cost of 600,000 hashes
  per guess. Pick a long passphrase.
- **Locking** zeroes the key buffer and closes the database. It
  happens when you press *Lock*, after an idle delay (15 minutes by
  default; 5 / 15 / 30 / 60 in *Your data*), and when the page has been
  hidden for 5 minutes. Locking restarts the app view, so nothing
  decrypted is kept around in memory by the UI. (We wipe the buffers we
  own; the key was also used once as text and lives inside the
  WebAssembly memory while unlocked, so we do not claim the key is
  erased from RAM.)
- **Forgot the passphrase?** The unlock screen offers *Erase and start
  over*, behind a confirmation. It deletes the encrypted database and the
  header from this browser, and returns to first run. (An AI key is never
  stored in the browser at all — it lives in memory for the unlocked
  session only; see [`ai-tiers.md`](./ai-tiers.md).) *Erase all local data* in *Your data* does the same.
- If the browser's site data was partly cleared (header without data,
  or data without any header) the app does not guess and never creates
  a new store over what is left: it says the store can't be found and
  offers the same erase. (A header lost from `localStorage` only is
  restored from the IndexedDB copy automatically.)
- **Only one tab at a time.** The store is held by one tab; a second
  tab says OpenPlate is open in another tab and lets you retry once the
  first has locked or closed. A tab hidden for 5 minutes locks itself.
- Exports (CSV/JSON) are plaintext downloads the browser saves wherever
  you choose; the app does not keep them.

Not yet verified (so not promised): the web store is untested in Safari
and Firefox (including how their storage-eviction rules treat IndexedDB — keep
exports regardless of browser). Exclusion between tabs uses the Web Locks API; a
browser without it gets no exclusion rather than a lock-out, so two tabs could
write at once there.

Limits, stated plainly: this protects the data on a locked/closed
browser profile. It does not protect against malware or a malicious
extension in your browser, against someone using your unlocked tab, or
against a weak passphrase. The web build needs a **secure context**
(https or `localhost`) because that is where browsers expose WebCrypto.

## What this means for self-hosters

- The first paint on the web build is the create-passphrase screen
  (first run) or the unlock screen. There is no "auto-unlock"
  affordance and there will never be one.
- Serve the app over https (see `docs/self-host.md`); the bundle also
  ships `sqlite3mc-3.5.1.wasm` (versioned file name), fetched at build time by
  `scripts/fetch_web_sqlite.sh` and verified against a pinned SHA-256.
- The passphrase fields mask input; the key never leaves the browser;
  no telemetry on the unlock event (pinned by `melos run
  check:telemetry`).
- A wrong passphrase renders a single calm line: *"That passphrase
  does not open this store."* No exception is ever thrown across the
  storage port.

## What this means for contributors

- `WebStoreController`
  (`packages/integrations/lib/src/store/web_store_controller.dart`) owns
  create / unlock / lock / erase, throttling and auto-lock, against three
  injected seams: `PassphraseKdf` (WebCrypto in the browser, a pure-Dart
  reference in tests), `WebStoreStorage` (`localStorage`) and
  `WebDatabaseBackend` (IndexedDB + sqlite3mc-wasm; a temp-file sqlite3mc
  database in tests), plus a `WebStoreLock` (Web Locks; an in-memory lock
  shared by two controllers plays two tabs). Everything but those three web adapters runs in
  `flutter test`.
- `WebSessionKey` is a `ChangeNotifier` holding the verified key; it zeroes
  on lock; never log it, never serialize it (its `toString` is redacted).
- `WasmEncryptedStore` / `WasmCoachNoteStore` are views over the
  controller's open database. While locked every `recordPlate` returns
  `StoreFailure(encryptedStoreError: WebSessionKeyFailure())`; no exception
  crosses the port.
- `OPENPLATE_DEV_IN_MEMORY_STORE=true` is the only unencrypted web path
  (red DEV banner) and is honoured only with `OPENPLATE_BUILD=dev`; every
  other build ignores it.
- The AD-1 invariant holds: `packages/domain_core` is free of Flutter /
  SQLite / HTTP / web imports.

## Cross-references

- `_bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ADR-0002-web-encrypted-store.md`
  — the web store design, threat model and what is not verified in automation.
- `docs/ai-tiers.md` — the AI rung surface; same privacy posture.
- `docs/self-host.md` — the one-command self-host install (Story 4.4).
- `docs/no-dark-patterns-standard.md` — the named-reviewer gate
  (FR-15) that signs off this copy.
