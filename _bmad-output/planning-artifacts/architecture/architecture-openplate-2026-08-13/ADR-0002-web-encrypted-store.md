# ADR-0002 — Web store: sqlite3mc-wasm on IndexedDB, passphrase-derived key

- **Status:** Accepted (Phase 2B, security review 2026-10-01, findings W1-W8)
- **Supersedes:** the "session-sealed, not at-rest encrypted" web posture of AD-8 / Story 4.1.
- **Scope:** the web (Flutter web / self-host) local store. Mobile is ADR-0001.

## Context
The web store was a placeholder: the derived key was ignored, the database was an in-memory
SQLite (any passphrase "unlocked" it, nothing persisted), the KDF salt was a global constant
and PBKDF2 ran 100k iterations in pure Dart on the UI thread, the gate never rebuilt, and
there was no create-passphrase flow or lock. The requirement: data on web persists across
reloads, is unreadable without the passphrase, and a wrong passphrase can never open it.

## Decision (the review plan's Option B, "full": a real encrypted web store)
1. **Storage:** drift on **SQLite3MultipleCiphers compiled to WebAssembly** (`sqlite3mc.wasm`,
   published by the `sqlite3` package's release pipeline, same version as `pubspec.lock`),
   persisted through the package's **IndexedDB virtual file system**, driven by drift's
   `WasmDatabase` **in the main isolate**. Cipher: **ChaCha20-Poly1305** - the only cipher that
   wasm build contains, and the one mobile pins (ADR-0001), via the same `attachKeyAndVerify`
   (`PRAGMA cipher`, `PRAGMA hexkey`, forced page decrypt) plus a web-only "schema must exist"
   check for returning users.
2. **Key:** the passphrase is **NFC-normalised, then UTF-8 encoded** (recorded in the header as
   `"pw":"nfc-utf8"`; JS `String.prototype.normalize` in the browser), then
   `PBKDF2-HMAC-SHA256`, **600,000 iterations**, 32-byte output, **random 16-byte
   per-store salt**, run by **WebCrypto** (`crypto.subtle.deriveBits`, native, async). Salt, KDF
   name, iteration count and format version live in a non-secret header in `localStorage`
   (`openplate.web.store.meta`) and **mirrored inside IndexedDB** (database `openplate_header_v1`),
   written only after the keyed database opened. If `localStorage` loses the header the copy
   restores it; if the data exists with no header anywhere the app reports "can't be found" and
   offers the erase - it never creates over it. A header with an
   unknown version/KDF, a short salt or fewer than 600k iterations is refused.
3. **Verification (W3):** the candidate key is verified by actually decrypting (`SELECT
   count(*) FROM sqlite_master` inside drift's `setup`, before any schema work). Only a verified
   key is handed to `WebSessionKey`. A wrong key fails with SQLITE_NOTADB; nothing is written.
4. **Lifecycle (W4/W6/W7):** `WebStoreController` (platform-neutral, VM-tested) owns create /
   unlock / lock / erase. `WebSessionKey` is a `ChangeNotifier`; the app gate listens to the
   controller. First run -> create passphrase (confirm, >=10 chars, >=4 distinct, up-front
   unrecoverability warning); later runs -> unlock. Lock zeroes the key buffer and closes the
   database; it happens manually (Day Board / Your data), after an idle delay (default 15 min,
   configurable 5/15/30/60), and when the page was hidden >= 5 min. Every lock restarts the
   `ProviderScope`, so no decrypted data cached in providers survives. Forgotten passphrase ->
   "Erase and start over" (deletes the IndexedDB database and the header, clears secure storage,
   restarts into first run).
5. **Multiple tabs (review H1):** create and unlock take an exclusive Web Lock
   (`navigator.locks`, `openplate-store`, `ifAvailable`) held until lock/close; a second tab gets a
   typed "open in another tab" outcome and can retry. `createStore` re-reads the header, the
   IndexedDB copy and the data under the lock and refuses (re-initialising to the unlock screen)
   if a store now exists; erase also needs the lock. Browsers without the Web Locks API get a
   no-op lock (exclusion not enforced there).
6. **Dev store (W8/L5):** `OPENPLATE_DEV_IN_MEMORY_STORE` selects an unencrypted in-memory store
   with a red DEV banner, but `BuildConfig` honours it **only** when `OPENPLATE_BUILD=dev`
   (`scripts/run_local_web.sh` sets both); the `selfhost` build and any unlabelled build ignore it.
7. **Hidden page:** a timer locks after the page stays hidden 5 minutes (plus an on-return check
   as fallback for throttled timers); typing and pointer activity reset the idle timer; stored
   idle minutes are clamped to 5/15/30/60.

## Alternatives considered
Plan options (named as in `_bmad-output/review/security-and-quality-review-2026-10-01.md`, Phase 2B):
- **Plan Option A, "label honestly" (unprotected local preview, no passphrase UI) - rejected.** The
  requirement is persistent data that is unreadable without the passphrase.
- **Implementation variant within the full option: sqlite3 wasm in memory + AES-GCM snapshot in
  IndexedDB - rejected.** It also needs a wasm binary, adds a second persistence layer with a
  durability gap (debounced snapshots) and a hand-rolled envelope; the chosen design reuses the
  audited mobile cipher path with no gap.

Storage backend choice (a separate question):
- **OPFS + drift worker - not used.** OPFS sync access handles only exist in workers, which would need a
  custom-compiled drift worker (a second unaudited artifact) and `setup` cannot run in a
  shared worker. The main-thread IndexedDB VFS needs no extra binary; the database is small
  (a food log). Revisit if write latency ever matters.
- **Argon2id.** Stronger against GPUs but needs another wasm blob; PBKDF2-600k is the strongest
  KDF WebCrypto provides natively. The header's KDF field makes a later migration possible.

## Integrity of the binary
`apps/client/web/sqlite3mc.wasm` is **not committed**. `scripts/fetch_web_sqlite.sh` (run by
`melos run build:web`, `infra/Dockerfile`, CI and `scripts/run_local_web.sh`) downloads release
`sqlite3-3.5.1` as `sqlite3mc-3.5.1.wasm` (versioned so nginx's `immutable` caching stays valid
across upgrades; a test keeps the Dart constant and the script pin in step) and verifies SHA-256 `62a34ec7...43a19`, refusing to run if `pubspec.lock`'s
`sqlite3` version differs from the pinned one. The hash was checked three ways: GitHub's release
digest, a local download, and `asset_hashes.dart` inside the `sqlite3` pub package itself.

## Findings from running it in a real browser
- sqlite3mc only keys a database whose VFS is one of its own wrappers; a plain Dart VFS fails with
  "Encryption is not supported by the VFS" (the package README's example fails the same way on
  3.5.1). sqlite3mc creates the wrapper when a database is opened with the VFS name
  `multipleciphers-<vfs>`, so `IndexedDbSqlite3mcBackend` pins that name. The wrapper cannot be
  unregistered from Dart, so each open uses a fresh VFS name.
- `crypto.subtle` exists only in a secure context: self-host must be served over **https** (or
  `localhost`). On plain http the store reports "unavailable", never "wrong passphrase".

## Threat model (honest limits)
- **Protects against:** someone who copies the browser profile / IndexedDB of a locked or closed
  browser (they get ChaCha20-Poly1305 ciphertext and a salt, and must run 600k-iteration PBKDF2
  per guess); a forgotten tab left idle (auto-lock); page-cache/provider residue after a lock
  (restart discards it).
- **Does not protect against:** malware or an extension in the browser while unlocked; a weak
  passphrase (the KDF only slows guessing - the floor of 10 characters is a floor, not
  strength); XSS in the app origin (the key is in wasm/JS memory while unlocked - Phase 4 CSP
  work); memory forensics. Zeroing wipes OUR buffers only: the key was also rendered once as a
  hex `String` and sits inside the wasm heap while unlocked. We do not claim RAM erasure.
- **Unlock throttling** (delay after 3+ consecutive failures) is UX friction only, held in tab
  memory; an offline attacker bypasses it entirely. The real defence is the KDF cost and the
  passphrase. It is never described as a security control.
- **No recovery.** There is no escrow. A forgotten passphrase means the data is gone; the UI says
  so before the passphrase is set and again on the forgot path.
- Header (`localStorage` + IndexedDB copy) and data (IndexedDB): if the data is cleared but the
  header remains, or data remains with no header at all, the app reports "can't be found" and
  offers the erase rather than creating an empty store that any passphrase "opens".
- The rollback journal is encrypted by sqlite3mc; a test holds a write transaction open and
  asserts no plaintext marker in the on-disk `-journal`. (The IndexedDB VFS keeps journals in
  the same encrypted file system.)

## Not verified in automation
WebCrypto PBKDF2, `localStorage`, and the IndexedDB wasm backend only run in a browser. The
`flutter test` suite (VM) covers the controller against real sqlite3mc encryption with a file
standing in for IndexedDB, plus the reference PBKDF2 against published vectors. The browser path
was exercised by hand against the release bundle in Chromium (create, reload, wrong passphrase,
unlock, plate persisted, lock, forgot-and-erase; raw IndexedDB blocks confirmed to be ciphertext).
