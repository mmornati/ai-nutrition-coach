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
  key, quota counters, rung config), any export files **still on this
  device** and the plate photos the camera plugin left in the app's cache
  (see "Photo files" below). Copies you shared or downloaded elsewhere
  are outside the app and are not affected.
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

## Applies to both platforms

### The privacy page and the first-run notice

*Settings → Privacy* ("What this app stores and sends") is the in-app privacy
notice: what is stored and where, what leaves the device and when, what the
server you got the app from sees, what is never collected, how to delete and
export, and a note on shared devices. It is linked from the one-time *About
this app* notice, from the Open Food Facts notice, from the photo consent dialog
and from *Your AI*. Every string is in the ARB file
(`apps/client/lib/l10n/app_en.arb`).

The *About this app* notice (designed for adults; photo recognition is off by
default and only sends a photo to a service you choose, after you say yes;
plates stay on the device, encrypted) appears **once**, before the first Day Board
on mobile and before the passphrase screen on the web. Dismissing it is stored in
the encrypted store (`kv_table`, key `privacy.aboutAckAtUtc`). On the web the
store does not exist yet when it first appears, so the answer is kept for the
session and written as soon as the store is created; if it cannot be read or
written the notice is simply shown again (never silently skipped).

### Deleting one plate

Press and hold a plate on the Day Board (or use the screen reader action
"Remove this plate") and confirm. The plate, its food entries, its coach notes,
the interactions logged against those notes and their dismissal markers are removed
in ONE database transaction (`EncryptedStore.deletePlate`, shared by the native and web stores; it rolls back as a whole on
failure, and a test asserts the absence of rows table by table). The `DeletePlate` use case then also calls
`CoachNoteStore.deleteForPlate`, an idempotent no-op on those stores, so stores that keep notes elsewhere (the in-memory dev store)
cascade too. There is no undo, hence the confirm. Editing a plate is not
supported; remove it and log it again.

### Open Food Facts lookups

The first time a scanned barcode is about to be looked up online, a one-time notice
says so: *"Barcodes you scan are looked up on Open Food Facts (public, no account).
Only the barcode is sent."* **OK** allows lookups; **Don't look up online** keeps the
app on its offline catalog (an unknown barcode opens manual entry). The answer is
stored in the encrypted store (`privacy.offLookup`) and can be changed in
*Settings → Privacy*. Nothing is sent until you have answered: the catalog itself
refuses to send a barcode unless the stored answer is "OK".

### Photo files

The camera plugin (`image_picker`) writes the photo it returns to the app's temp /
cache directory (Android `cache/`, iOS `tmp/image_picker_*`) and never deletes it. The
app deletes that file as soon as it has read the bytes (so before, and whatever the
outcome of, any recognition), removes leftovers older than an hour at start, and
*Erase all local data* removes every one. Only file names the plugin is known to
produce are touched. The photo itself is kept in memory only for the recognition call.

### Exports and erase

Exports are **plain, unencrypted** CSV / JSON files, and say so under the Export
button. *Erase all local data* removes exports still on this device; it cannot
reach a file you shared to another app or downloaded in a browser (Chrome saves to
Downloads without asking, and Downloads may sync to a cloud). Exports cover
plates only: coach notes, AI settings and these notices are not exported, and there is no import (an
installed iOS web app keeps its data separate from Safari's, so only an export
could bridge them, by hand).

### Shared devices

There is one store per device (mobile) or per browser profile (web), and no
profiles inside the app and no app lock on mobile: everyone who can unlock the phone,
or knows the web passphrase, sees the same history. For separate histories use a
separate device or browser profile, each with its own passphrase. This is by design for v1 and
is stated on the privacy page.

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
  header from this browser, and returns to first run. (An AI key and your AI
  settings are stored *inside* the encrypted store and go with it; see
  [`ai-tiers.md`](./ai-tiers.md).) *Erase all local data* in *Your data* does the same.
- If the browser's site data was partly cleared (header without data,
  or data without any header) the app does not guess and never creates
  a new store over what is left: it says the store can't be found and
  offers the same erase. (A header lost from `localStorage` only is
  restored from the IndexedDB copy automatically.)
- **Only one tab at a time.** The store is held by one tab; a second
  tab says OpenPlate is open in another tab and lets you retry once the
  first has locked or closed. A tab hidden for 5 minutes locks itself.
- Exports (CSV/JSON) are plaintext downloads the browser saves (often into a
  Downloads folder, without asking); the app does not keep them and cannot delete
  them later.

- **Protected from clean-up?** Browsers may clear a site's storage when space runs
  low unless the site is *persistent*. After every create/unlock the app asks the
  browser to protect the data (`navigator.storage.persist()`) and *Your data* says
  what the browser answered: "protected from automatic clean-up" or "the browser may
  clear this data if space runs low — export regularly". The answer is the browser's
  to give; export regardless.
- **Last export.** *Your data* shows when you last exported (the date is stored inside the
  encrypted store). If there is data and the last export is older than 14 days, or there
  never was one, one quiet line suggests an export; "Not now" quiets it for another 14
  days. No badge, no modal, no counter.
- **Your AI key and settings** (web) are kept in a small key/value table *inside* the
  encrypted store (schema v5) — readable only after you unlock, protected by the same
  passphrase-derived key, deleted by *Erase all local data*, never in `localStorage`.

Browser coverage: the web store and the installable app are exercised in Chromium and
WebKit (Safari's engine) by the opt-in `scripts/webkit_smoke.sh`
([`pwa.md`](./pwa.md#browser-smoke-webkit-and-chromium)); Firefox is untested. Safari may
clear a *tab's* site data after a period without a visit — an app added to the Home Screen
is exempt, and keeps its own data separate from Safari's (install first, then log). Keep
exports regardless of browser. Exclusion between tabs uses the Web Locks API; a browser
without it gets no exclusion rather than a lock-out, so two tabs could write at once there.

Limits, stated plainly: this protects the data on a locked/closed
browser profile. It does not protect against malware or a malicious
extension in your browser, against someone using your unlocked tab, or
against a weak passphrase. The web build needs a **secure context**
(https or `localhost`) because that is where browsers expose WebCrypto.

## What this means for self-hosters

- The first paint on the web build is the create-passphrase screen
  (first run) or the unlock screen. There is no "auto-unlock"
  affordance and there will never be one.
- Serve the app over https (see `docs/self-host.md`, `docs/pwa.md`); the bundle also
  ships `sqlite3mc-3.5.1.wasm` (versioned file name), fetched at build time by
  `scripts/fetch_web_sqlite.sh` and verified against a pinned SHA-256, and a
  self-hosted zxing-wasm barcode decoder (`scripts/fetch_web_zxing.sh`).
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
- `docs/pwa.md` — the installable, offline-capable web app (service worker, persistence, install, updates).
- `docs/ai-tiers.md` — the AI rung surface; same privacy posture.
- `docs/self-host.md` — the one-command self-host install (Story 4.4).
- `docs/no-dark-patterns-standard.md` — the named-reviewer gate
  (FR-15) that signs off this copy.
