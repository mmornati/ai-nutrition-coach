# Your data — protection posture

AI Nutrition Coach is yours to run. This page is the honest answer to *"how is
my history protected?"* The answer differs by platform — and the
difference is documented plainly because overclaiming "encrypted at
rest" on a platform that can't honour it would be a trust break.

## Mobile (iOS, Android)

Your history lives in a local SQLite database encrypted at rest with
AES-256. The 32-byte key is held in the OS keystore
(iOS Keychain / Android EncryptedSharedPreferences) and never leaves
the device. There is no server mirror, no third-party sync, no
telemetry. (Stories 1.2 / AD-8.)

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
  on the unlock event.
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
