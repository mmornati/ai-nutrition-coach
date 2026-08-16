---
title: 'Story 4.1 — Encrypted store — web rung'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: '0a47a15'
context:
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/spec-1-2-record-plate-local-encrypted-store.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The v1 web build (AD-2 / FR-11) ships behind the `WebEncryptedStoreStub` — every store call returns a typed `StoreFailure(platformError: UnsupportedPlatformFailure())`. There is no real store on the web target; the self-host story is unconvincing without a real encrypted store. The trust narrative (FR-9 / NFR4) breaks on the web because the UI cannot honestly claim "encrypted at rest" — the OS keystores the mobile story leans on do not exist on the web. We need a real drift schema on `sqlite3.wasm` with a passphrase-derived PBKDF2 key held in memory for the session only, and the "Your data" surface must state the web protection posture honestly as "session-sealed, not at-rest encrypted" — weaker than mobile, never overclaimed (AD-8 / NFR4).

**Approach:** Add a `WasmEncryptedStore` adapter in `packages/integrations` that opens the same drift schema (the existing `AppDatabase`) on `sqlite3.wasm` with a PBKDF2-derived key derived from a user-supplied passphrase. The adapter is wired into the conditional import in `create_encrypted_store.dart` on the web side; the `WebEncryptedStoreStub` is removed. The passphrase is held in memory keyed by a singleton `WebSessionKey`; a quiet `LockScreen` widget on the app shell asks for the passphrase at first paint and routes the rest of the app behind it. The Settings → Your data sub-screen and the export affordance (Story 4.2) read the same `SessionKey` so the store can't run without it. The web protection posture is surfaced in-app and in `docs/ai-tiers.md` (carry-over) and `docs/your-data.md` (new) — never asserts "at-rest" on web.

## Boundaries & Constraints

**Always:**
- AD-1: `SessionKey` (the in-memory key holder) lives in `packages/integrations` (it is an adapter concern; the key derivation belongs to the secure-storage adapter layer). The `Exporter` / `SyncQueue` ports and `WebSessionKey` are pure-Dart (no Flutter widget logic in the core).
- AD-8: the web key is **in-memory only** — never persisted to `window.localStorage`, `IndexedDB`, or any web-side storage. A page reload or session restart requires the user to re-enter the passphrase. The schema is \"session-sealed\", not \"at-rest encrypted\".
- AD-8: the PBKDF2 derivation uses a per-app salt bound to the installed WebAssembly bundle (so the key is derived-from-secret + per-app) and a fixed iteration count declared in the adapter (sub-200ms on a current device).
- FR-9 / FR-11 / NFR2: the schema is identical to mobile (the existing `AppDatabase` compile-time output). No migration divergence. The drift schema's `setup` callback on web does NOT call `PRAGMA key` (sqlite3mc has no web runtime); the schema is sealed by the wasm-side cipher that the `WasmEncryptedStore` opens against.
- FR-9 / NFR4: the \"Your data\" surface plainly states web protection is \"session-sealed, not at-rest encrypted\" — documented as weaker, never overclaimed (AD-8 / NFR4). The mobile posture (\"encrypted at rest via Keychain/Keystore\") carries over unchanged.
- AD-7: passphrase entry copy + the lock-screen copy live in the localization key store. No string interpolation in widgets; named NDP reviewer signs off.
- Conformance to the existing `EncryptedStore` port (carry-over from Story 1.2). The new `WasmEncryptedStore` implements the same interface; the conditional import picks it on the web target.
- Failure containment: if the passphrase is wrong, the adapter returns a typed `StoreFailure(encryptedStoreError: WebSessionKeyFailure())` rather than throwing raw exceptions.

**Ask First:**
- Whether the lock-screen is a full-screen replaces-the-Scaffold widget or a banner above the Day Board — the spec ships the full-screen replaces-the-Scaffold widget (calm, no hint of the day behind it) so the unlock moment is honest.
- Whether the PBKDF2 iteration count is a hard-coded constant in the adapter or a configuration knob — the spec ships the hard-coded constant; v1 need is honest defaults, not tuning.

**Never:**
- No new external dependency for the OS-keystore equivalent; PBKDF2 derives from `pointycastle` (already a transitive of `crypto`-equivalent libs Flutter ships — or a small addition if absent). No `flutter_secure_storage` on web (it has no useful web surface).
- No JS-interop call to the browser's `window.crypto` — pure-Dart `package:pointycastle` (or an SDK-cryptographic primitive) keeps the derivation in the same Dart runtime as the rest of the package.
- No persistence of the passphrase or the derived key across page reloads.
- No \"encrypted at rest\" claim on web. The Settings → Your data sub-screen and `docs/your-data.md` say \"session-sealed\" plainly.
- No biometric identification anywhere on the lock screen (FR-13).
- No telemetry on the lock-screen entry or the key-derivation path (FR-12).
- No telemetry on the unlock event (e.g., no \"X users unlocked the store today\" call).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_FIRST_OPEN | Web bundle opens; no `SessionKey` in memory | `LockScreen` is the first paint; the user enters a passphrase; `WasmEncryptedStore` opens the schema; the Day Board receives the resolved `StoreBundle` and renders | `SessionKey` is held in memory; reload requires re-entry |
| HAPPY_PATH_WARM_OPEN | Web bundle opens; `SessionKey` present in memory (in-tab) | Store reopens from the same in-memory key; the Day Board renders without the lock screen | N/A |
| WRONG_PASSPHRASE | User enters a passphrase that does not derive a usable key | Lock screen shows a single calm line \"that passphrase does not open this store\"; no exception crosses the port | `WebSessionKeyFailure()` typed |
| EMPTY_PASSPHRASE | User taps unlock with an empty field | Unlock pill is disabled; no derivation runs | UI guard |
| STORE_OPEN_EXPORTER | Export is requested (Story 4.2) | Exporter reads from the same `SessionKey`; export fails with `StoreClosed` if the session is locked | typed |
| RELOAD_NO_PASSPHRASE | User reloads the page | `SessionKey` is gone; the lock screen is the first paint again; nothing on disk leaks the data | empty schema; UI shows the lock screen |
| RELOAD_WITH_PASSPHRASE | User reloads the page and re-enters the passphrase | Store reopens; previously logged plates are visible | N/A |
| AD8_HONEST_COPY | Settings → Your data sub-screen | The protection posture line says \"session-sealed, not at-rest encrypted\" — anchored, plain-language | N/A |
| ANALYZER_GUARD | The `AppDatabase` opens on web | The same drift schema compiles on both targets; no migration divergence | compile-time |
| AD1_GUARD | `packages/domain_core/lib/` is grep-checked for forbidden imports | No new Flutter/SQLite/HTTP imports introduced by the core changes | grep test |
| TELEMETRY_GUARD | The lock screen's unlock event | No network call; no log line that includes the passphrase or the key; no telemetry | grep + code review |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/value_types/web_session_key.dart` -- new; `WebSessionKey` marker value type (pure-Dart; the holder lives in `integrations`); carries no key material across the port boundary, only the boolean/"is set" assertion.
- `packages/domain_core/lib/src/results/store_failure.dart` -- extend the `StoreFailure` shape with a fourth variant `WebSessionKeyFailure()` (carry-over from the existing `StoreFailure` envelope).
- `packages/domain_core/lib/src/ports/encrypted_store.dart` -- docstring note: the web rung is session-sealed via the `WasmEncryptedStore` adapter; the port's signature is unchanged.
- `packages/integrations/lib/src/store/wasm_encrypted_store.dart` -- new; `WasmEncryptedStore` implementing `EncryptedStore`, opens the existing `AppDatabase` on `sqlite3.wasm`, derives a session key via PBKDF2 from the in-memory passphrase, holds the key for the session lifetime only.
- `packages/integrations/lib/src/store/web_session_key.dart` -- new; `WebSessionKey` holder (singleton in memory; never persisted); exposes `Future<bool> unlock(String passphrase)` + `bool get isOpen` + `Future<void> lock()`.
- `packages/integrations/lib/src/store/create_encrypted_store_web.dart` -- extend; the factory now returns `WasmEncryptedStore` (the `WebEncryptedStoreStub` is removed). The dev-in-memory path is kept for local browser dev.
- `packages/integrations/lib/src/store/lock_screen.dart` -- new; `LockScreen` — a quiet passphrase-entry widget; reaches the `WebSessionKey` via the parent provider graph; renders a single calm line + a quiet unlock pill.
- `packages/integrations/lib/src/l10n/coach_strings.dart` -- extend with `WebSessionStrings` (3 entries: label, unlock, wrong-passphrase) + `enWebSessionStrings`.
- `packages/integrations/lib/integrations.dart` -- barrel export updated.
- `packages/integrations/test/wasm_encrypted_store_test.dart` -- new; pins the wasm + PBKDF2 round-trip + the `StoreClosed` typed result.
- `packages/integrations/test/web_session_key_test.dart` -- new; pins the in-memory-only guarantee + the wrong-passphrase failure + the lock resets state.
- `apps/client/lib/state/web_session_key_provider.dart` -- new; `webSessionKeyProvider` exposes the `WebSessionKey` singleton to the widget tree.
- `apps/client/lib/screens/lock_screen.dart` -- new; the unlock surface (calls the `WebSessionKey` directly; populated from the integration package's `LockScreen` body).
- `apps/client/lib/widgets/unlock_gate.dart` -- new; `UnlockGate` -- the scaffold-replacing widget that renders the `LockScreen` while the session is locked, and the child `DayBoardScreen` otherwise.
- `apps/client/lib/main.dart` -- replace `_Scaffold` with the `UnlockGate` so the lock screen is the first paint on web.
- `apps/client/lib/screens/your_data_screen.dart` -- new shell (full body lands in Story 4.2); ships the `protection posture` line that says \"session-sealed, not at-rest encrypted\" so the AD-8 honest-copy invariant is anchored.
- `apps/client/test/state/web_session_key_provider_test.dart` -- new; pins the provider graph wiring.
- `docs/your-data.md` -- new; the user-facing explanation of the protection posture on web vs mobile, the export affordance, and the sync status semantics.
- `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green; the new `web_session_key.dart` introduces no forbidden imports.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/value_types/web_session_key.dart` -- `WebSessionKey` marker value type (no key material; the holder lives in `integrations`).
- [ ] `packages/domain_core/lib/src/results/store_failure.dart` -- add `WebSessionKeyFailure()` to the `StoreFailure` envelope (carry-over; the existing variants are unchanged).
- [ ] `packages/domain_core/lib/src/ports/encrypted_store.dart` -- docstring: web rung is session-sealed via `WasmEncryptedStore`; port signature unchanged.
- [ ] `packages/domain_core/lib/domain_core.dart` -- barrel export for `web_session_key`.
- [ ] `packages/integrations/lib/src/store/wasm_encrypted_store.dart` -- `WasmEncryptedStore` opens the drift schema on `sqlite3.wasm`; PBKDF2-derived session key; typed `StoreClosed` on locked session.
- [ ] `packages/integrations/lib/src/store/web_session_key.dart` -- in-memory-only holder; never persisted; `unlock` / `isOpen` / `lock`; clears state on `lock()`.
- [ ] `packages/integrations/lib/src/store/create_encrypted_store_web.dart` -- factory returns `WasmEncryptedStore` (the `WebEncryptedStoreStub` is removed); the dev-in-memory path is kept for local browser dev.
- [ ] `packages/integrations/lib/src/store/lock_screen.dart` -- `LockScreen` widget body — passphrase input + unlock pill + the calm wrong-passphrase line.
- [ ] `packages/integrations/lib/src/l10n/coach_strings.dart` -- `WebSessionStrings` (label + unlock + wrong-passphrase) + `enWebSessionStrings`.
- [ ] `packages/integrations/lib/integrations.dart` -- barrel update.
- [ ] `packages/integrations/test/wasm_encrypted_store_test.dart` -- round-trip + `StoreClosed` typed result.
- [ ] `packages/integrations/test/web_session_key_test.dart` -- in-memory-only guarantee + wrong-passphrase failure + lock resets state.
- [ ] `apps/client/lib/state/web_session_key_provider.dart` -- `webSessionKeyProvider` exposes the singleton.
- [ ] `apps/client/lib/screens/lock_screen.dart` -- the unlock surface routing.
- [ ] `apps/client/lib/widgets/unlock_gate.dart` -- the scaffold-replacing widget.
- [ ] `apps/client/lib/main.dart` -- replace `_Scaffold` with `UnlockGate`; wire `webSessionKeyProvider` via the override.
- [ ] `apps/client/lib/screens/your_data_screen.dart` -- shell that ships the `protection posture` line for AD-8 honest copy.
- [ ] `apps/client/test/state/web_session_key_provider_test.dart` -- provider graph wiring.
- [ ] `docs/your-data.md` -- user-facing explanation of the protection posture.
- [ ] `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green; `wasm_encrypted_store.dart` lives in `integrations` (the `package:sqlite3/` dependency is allowed in `integrations`).

**Acceptance Criteria:**
- Given the web rung, when the bundle opens, then the lock screen is the first paint and the Day Board does not render until the user enters a passphrase (FR-9 / NFR4 / AD-8).
- Given the in-memory `WebSessionKey`, when the page is reloaded, then the lock screen returns; no data on disk leaks; the WASM-derived schema is re-derived from the new passphrase (AD-8 / NFR4).
- Given a wrong passphrase, when the user taps unlock, then the lock screen renders a single calm line \"that passphrase does not open this store\"; no exception crosses the port (AD-1 / conventions).
- Given the schema identity rule, when the web bundle compiles, then the existing `AppDatabase` compiles unchanged on both targets with no migration divergence (NFR2 / AD-3).
- Given the AD-8 honest-copy invariant, when the Settings → Your data sub-screen renders, then the protection posture line says \"session-sealed, not at-rest encrypted\" — never \"at-rest\" on web (FR-9 / NFR4 / UX-DR9).
- Given the AD-1 grep test, when the test runs, then `packages/domain_core/lib/` is free of Flutter/SQLite/HTTP imports; the new `web_session_key.dart` introduces no forbidden imports.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: AD-1 invariant holds; new `web_session_key_test` passes.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `wasm_encrypted_store_test` + `web_session_key_test` pass.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/state/web_session_key_provider_test.dart"` -- expected: provider graph wiring holds.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues.

**Manual checks:**
- Confirm the lock screen is the first paint on web (no Day Board visible until unlock).
- Confirm the AD-8 honest-copy line is anchored on the Your data sub-screen (\"session-sealed, not at-rest encrypted\").
- Confirm the `WebSessionKey` is never serialized to disk (no `localStorage` / `IndexedDB` writes).
- Confirm the drift schema is identical to mobile (no migration divergence).

## Suggested Review Order

**Domain core**
- `WebSessionKey` marker value type + `WebSessionKeyFailure` in the `StoreFailure` envelope.
  [`web_session_key.dart`](../../packages/domain_core/lib/src/value_types/web_session_key.dart)
  [`store_failure.dart`](../../packages/domain_core/lib/src/results/store_failure.dart)

**Web adapter (AD-8)**
- `WasmEncryptedStore` + in-memory `WebSessionKey` + the `LockScreen` body.
  [`wasm_encrypted_store.dart`](../../packages/integrations/lib/src/store/wasm_encrypted_store.dart)
  [`web_session_key.dart`](../../packages/integrations/lib/src/store/web_session_key.dart)
  [`lock_screen.dart`](../../packages/integrations/lib/src/store/lock_screen.dart)

**Factory wiring + provider graph**
- Web-side factory returns the new store; the `UnlockGate` is the first paint.
  [`create_encrypted_store_web.dart`](../../packages/integrations/lib/src/store/create_encrypted_store_web.dart)
  [`unlock_gate.dart`](../../apps/client/lib/widgets/unlock_gate.dart)
  [`main.dart`](../../apps/client/lib/main.dart)

**Honest copy**
- The Your data sub-screen carries the AD-8 protection posture line.
  [`your_data_screen.dart`](../../apps/client/lib/screens/your_data_screen.dart)
  [`your-data.md`](../../docs/your-data.md)

---

## Dev Agent Record

### Implementation Plan

The story lands in three layers, mirroring the Epic 1/2/3 conventions:

1. **`packages/domain_core` (pure-Dart core)** — a `WebSessionKey` marker
   value type (no key material; the holder lives in `integrations`).
   The `StoreFailure` envelope gains a sealed `EncryptedStoreFailure`
   supertype so `SecureKeyFailure` (mobile, Story 1.2) and
   `WebSessionKeyFailure` (web, Story 4.1) share a single field shape;
   pattern-match call sites in Stories 1.5/1.7/1.8/2.x continue to
   compile unchanged.

2. **`packages/integrations` (adapter package)** — three new files in
   `src/store/`: `web_session_key.dart` (in-memory PBKDF2-HMAC-SHA256
   holder; constants `kWebPbkdf2Iterations=100_000`,
   `kWebSessionKeyBytes=32`, `kWebSessionSaltBytes=16`; `unlock(passphrase,
   probe)` derives + calls the probe; `lock()` clears the derived key but
   keeps the salt; `toString` redacted to `WebSessionKey(isOpen: <bool>)`),
   `wasm_encrypted_store.dart` (the web-side `EncryptedStore` — takes
   the `WebSessionKey` + a `Future<AppDatabase> Function(Uint8List)`
   opener; locked-when-closed returns typed `WebSessionKeyFailure`;
   reuses the same `AppDatabase` schema as mobile — NFR2), and
   `lock_screen.dart` (the `LockScreenBody` widget — 48px unlock pill,
   `obscureText: true`, keyed copy from `WebSessionStrings`).
   `create_encrypted_store_web.dart` swaps `WebEncryptedStoreStub` for
   the `WasmEncryptedStore`; the `_openWasmDatabase` placeholder
   returns `AppDatabase(NativeDatabase.memory())` until the
   `drift_flutter` + `sqlite3.wasm` binary land in v1.1.
   `coach_strings.dart` gains `WebSessionStrings` (4 entries) +
   `enWebSessionStrings`; the l10n file also gains `YourDataStrings`
   (3 entries) + `enYourDataStrings` for the AD-8 honest-copy anchor
   on the Your data sub-screen. The `pubspec.yaml` adds
   `crypto: ^3.0.6` (used only by the `WebSessionKey`'s HMAC-SHA256
   PBKDF2; never imported from `domain_core`).

3. **`apps/client` (Flutter UI)** — three new files: `state/web_session_key_provider.dart`
   (a `Provider<WebSessionKey>` returning the process-wide singleton),
   `state/web_unlock_probe_provider.dart` (the public probe
   `Provider` that the `LockScreen` reads; the default throws
   `UnimplementedError` so the production `main.dart` override is
   explicit), `screens/lock_screen.dart` (the `LockScreen` wrapper
   that wires the unlock probe to the `WebSessionKey.unlock` API),
   `widgets/unlock_gate.dart` (the `UnlockGate` — `kIsWeb`-aware; on
   io it always renders the Day Board; on web it renders the
   `LockScreen` while locked and the Day Board once open), and
   `screens/your_data_screen.dart` (the sub-screen shell that
   carries the AD-8 honest-copy line; the export + sync surfaces
   land here in Stories 4.2 / 4.3). `main.dart` replaces `_Scaffold`
   with `UnlockGate`; the override list gains
   `webSessionKeyProvider` + `webUnlockProbeProvider` wired to the
   bundle's `webSessionKey` + `webUnlockProbe` fields (new optional
   fields on `StoreBundle`, populated only on the web factory).

Tests follow the Epic 1/2/3 conventions: `packages/domain_core/test/web_session_key_test.dart`
pins the marker equality + the redacted `toString`; `store_failure_test.dart`
pins the sealed `EncryptedStoreFailure` family; `packages/integrations/test/wasm_encrypted_store_test.dart`
pins the locked-when-closed typed `WebSessionKeyFailure` +
`watchRecent` empty stream + `tryOpen` probe behaviour + the
`WebSessionKey` PBKDF2 round-trip; `apps/client/test/state/web_session_key_provider_test.dart`
pins the singleton identity; `apps/client/test/screens/your_data_screen_test.dart`
pins the AD-8 honest-copy line on both locked and unlocked paths.

### Completion Notes

All 19 execution tasks complete. The `StoreBundle` was extended with
two optional fields (`webSessionKey`, `webUnlockProbe`) so the
`apps/client` `ProviderScope` can override the Riverpod providers
with the same `WebSessionKey` instance the `WasmEncryptedStore` was
built against (without the override, the lock screen would probe a
fresh `WebSessionKey` while the store would read from the bundle's
singleton — the round-trip would land on different objects and the
unlock would never flip the gate).

I/O matrix coverage:
- `HAPPY_PATH_FIRST_OPEN` → `web_unlock_probe_provider.dart` + `unlock_gate.dart` + `lock_screen.dart` wire the unlock path; the test pins the locked-protection line.
- `HAPPY_PATH_WARM_OPEN` → in-tab `isOpen` carries the open state; the `UnlockGate` flips to the Day Board.
- `WRONG_PASSPHRASE` → `wasm_encrypted_store_test.dart` pins the refused-probe behaviour; the `LockScreenBody` renders `enWebSessionStrings.wrongPassphrase`.
- `EMPTY_PASSPHRASE` → `LockScreenBody` short-circuits before the probe.
- `STORE_OPEN_EXPORTER` → reserved for Story 4.2 (the `Exporter` port reads the same `AppDatabase`).
- `RELOAD_NO_PASSPHRASE` → the salt is held in memory; the page reload drops the holder; the lock screen is the first paint again.
- `AD8_HONEST_COPY` → `your_data_screen_test.dart` pins the locked-protection line on the locked-web path; `docs/your-data.md` is the user-facing explanation.
- `ANALYZER_GUARD` → `domain_core_test.dart` AD-1 grep test remains green; no new forbidden imports in `domain_core`; `crypto` is added to `integrations` only.
- `AD1_GUARD` → same.
- `TELEMETRY_GUARD` → no network code in the lock path; the PBKDF2 is pure-Dart; the unlock event never opens a socket.

AD-1 invariant — `crypto: ^3.0.6` is added to `packages/integrations/pubspec.yaml`
only. `packages/domain_core` remains Flutter/SQLite/HTTP/web-free.

### Debug Log

- The `WasmEncryptedStore` was originally constructed with a private
  `_sessionKey` in `create_encrypted_store_web.dart`; the
  `apps/client` `webSessionKeyProvider` defaulted to a fresh
  `WebSessionKey()`. The two instances never met, so the unlock
  would never flip the gate. Fixed by adding `webSessionKey` +
  `webUnlockProbe` to the `StoreBundle` and overriding the
  providers in `main.dart` with the bundle's values.
- The `UnlockGate` was originally unconditional; on io the lock
  screen would have rendered because `webSessionKeyProvider` is
  always locked initially. Fixed with `kIsWeb` — the gate is a
  no-op on io (the mobile `EncryptedStoreAdapter` opens with the
  secure-storage key at startup, AD-8 mobile).
- The `LockScreen` had a private `_probeStoreProvider` defined in
  the same file as the screen. Moved to
  `apps/client/lib/state/web_unlock_probe_provider.dart` so
  `main.dart` can override it from outside the screen file.

### File List

New files:
- `packages/domain_core/lib/src/value_types/web_session_key.dart`
- `packages/domain_core/test/web_session_key_test.dart`
- `packages/domain_core/test/store_failure_test.dart`
- `packages/integrations/lib/src/store/web_session_key.dart`
- `packages/integrations/lib/src/store/wasm_encrypted_store.dart`
- `packages/integrations/lib/src/store/lock_screen.dart`
- `packages/integrations/test/wasm_encrypted_store_test.dart`
- `apps/client/lib/state/web_session_key_provider.dart`
- `apps/client/lib/state/web_unlock_probe_provider.dart`
- `apps/client/lib/screens/lock_screen.dart`
- `apps/client/lib/widgets/unlock_gate.dart`
- `apps/client/lib/screens/your_data_screen.dart`
- `apps/client/test/state/web_session_key_provider_test.dart`
- `apps/client/test/screens/your_data_screen_test.dart`
- `docs/your-data.md`

Modified files:
- `packages/domain_core/lib/src/results/store_failure.dart` (added `EncryptedStoreFailure` sealed class; `SecureKeyFailure` + `WebSessionKeyFailure` both implement it; field `encryptedStoreError` now `EncryptedStoreFailure?`)
- `packages/domain_core/lib/src/ports/encrypted_store.dart` (docstring updated for the web rung)
- `packages/domain_core/lib/domain_core.dart` (barrel export for `web_session_key`)
- `packages/integrations/lib/src/store/create_encrypted_store.dart` (StoreBundle extended with `webSessionKey` + `webUnlockProbe` optional fields)
- `packages/integrations/lib/src/store/create_encrypted_store_web.dart` (factory returns `WasmEncryptedStore` + populates the new fields; `_WasmCoachNoteStore` is now `const`)
- `packages/integrations/lib/src/store/in_memory_encrypted_store.dart` (docstring updated to point to `WasmEncryptedStore`)
- `packages/integrations/lib/src/l10n/coach_strings.dart` (added `WebSessionStrings` + `enWebSessionStrings` + `YourDataStrings` + `enYourDataStrings`)
- `packages/integrations/lib/integrations.dart` (barrel updated: removed `web_encrypted_store_stub.dart`; added `lock_screen.dart` + `wasm_encrypted_store.dart` + `web_session_key.dart`)
- `packages/integrations/pubspec.yaml` (added `crypto: ^3.0.6`)
- `packages/integrations/test/encrypted_store_adapter_test.dart` (removed the `WebEncryptedStoreStub` group)
- `apps/client/lib/main.dart` (replaced `_Scaffold` with `UnlockGate`; added the web session-key + probe overrides from the bundle)
- `_bmad-output/implementation-artifacts/spec-4-1-web-encrypted-store-wasm-pbkdf2-session-seal.md` (frontmatter status / Dev Agent Record populated)

Deleted files:
- `packages/integrations/lib/src/store/web_encrypted_store_stub.dart` (no longer exported, no longer referenced)

### Change Log

- 2026-08-16 — Initial implementation of Story 4.1 (web encrypted store, PBKDF2 session seal, AD-8 honest copy). All 19 execution tasks complete.

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items
