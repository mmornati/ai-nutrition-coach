# Epic 4 Context: Your data stays yours (data ownership & self-host)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Encrypted on-device story across every rung (mobile + self-hosted web), portable export that works offline, optional sync drained to user-controlled infrastructure only, and a one-command self-host install. Telemetry stays off by default in every build; the release posture is open-source with a named No-Dark-Patterns Standard.

## Stories

- Story 4.1: Encrypted store — web rung (sqlite3.wasm + PBKDF2, session-sealed honest posture)
- Story 4.2: Exporter — CSV/JSON offline, no account (`Exporter` port, read-only over the store)
- Story 4.3: Durable outbox sync to user-controlled infrastructure (FR10, status chips from queue state)
- Story 4.4: One-command self-host install (FR11 — multi-stage Docker + nginx SPA, `openplate up`)
- Story 4.5: Telemetry and privacy posture (no network by default — verifiable gate)
- Story 4.6: OSS release posture — LICENSE, CONTRIBUTING, No-Dark-Patterns Standard (FR12 at tag time)

## Requirements & Constraints

- FR9 / AD-3: every Plate Log + Coach Note lives in the local encrypted store as the single source of truth; the UI is a derived view. No server mirror, no account required, full feature set works with network revoked (UJ-5).
- FR9 / FR10 / NFR4: "lost my history" must be impossible by construction — covered by (a) the durable outbox (Story 4.3) that lands the commit before any UI reflection, and (b) the read-only Exporter (Story 4.2) that streams Plate Logs as CSV/JSON offline, no account.
- AD-6: writes are local-first; sync is an adapter that never loses data. Status chips (`· local` / `· pending` / `· synced`) derive from the queue state, never a spinner. A log flips to `synced` only after durable remote acknowledgment.
- FR10 / AD-6: third-party sync is banned. The sync adapter drains only to user-controlled infrastructure. The concrete transport (self-host relay vs manual export/import) remains a build-time decision behind the sync adapter — OQ-1.
- AD-8: at-rest encryption is honest and platform-aware. Mobile: AES-256 via sqlite3mc + Keychain/Keystore (carried over from Story 1.2). Web: same drift schema on sqlite3.wasm with a passphrase-derived PBKDF2 key held in memory for the session only. The web client is documented as "session-sealed, not at-rest encrypted" — weaker than mobile, never overclaimed.
- AD-9: export is a read-only port `Exporter` over the store. Streaming CSV/JSON, UTC ISO-8601, fully offline, no account. The port is pure (no I/O done in the core); the adapter writes the bytes to a user-chosen destination.
- FR11 / AD-2 / NFR9: one-command self-host install on a fresh Docker host. The multi-stage build is reproducible (cirruslabs/flutter:stable → `flutter build web --release` → nginx:alpine + `try_files` SPA). `openplate up` is the documented affordance for the container.
- FR12 / NFR4: no telemetry in any shipped build by default. No network calls unless the user enabled sync or BYOK explicitly. The Tip Jar never interrupts a task flow (FR15 / UX-DR9).
- OQ-1 (architecture decision): the sync transport path (self-host relay vs manual export/import) is a build-time adapter choice behind `SyncAdapter`. v1 ships the port + the durable outbox + the chip lifecycle; the concrete transport is a follow-up.
- All copy (Settings → Your data sub-screen, export affordance, sync status lines) lives in the localization key store (AD-7); no string interpolation in widgets; calm non-judgmental; named NDP reviewer signs off.
- Export filenames, sync state, and any visible error messages are domain results — never raw exceptions crossing ports (conventions).

## Technical Decisions

- The `Exporter` port (`packages/domain_core/lib/src/ports/exporter.dart`) gains a single read method `streamPlates({ExportFormat format, ExportScope scope}) -> Stream<ExportResult>` where `ExportFormat = csv | json` and `ExportScope = visibleDay | week | allHistory`. The port is pure (returns typed data); the adapter writes the bytes to a destination (download on web, file path on mobile).
- The `SyncQueue` port is added to `domain_core`. It is a durable outbox: a `Future<SyncEnqueueResult> enqueue(SyncOp op)` (writes a row to the queue), `Stream<SyncQueueState> watch()`, and `Future<void> markSynced(String opId)`. The implementation lives in `packages/integrations/lib/src/sync/` and is a pure-Dart adapter that persists to the same drift store the plate-log writes use (AD-3: one store, no second source).
- The sync adapter follows the existing pattern: an `Exporter / sync / …` package slice in `packages/integrations`. The v1 ship is the port + the durable outbox + the chip lifecycle; the concrete transport (relay vs manual export/import) is a build-time adapter choice behind the port (OQ-1).
- The web encrypted store (Story 4.1) is selected via the existing conditional import in `create_encrypted_store.dart`. The web side swaps `WebEncryptedStoreStub` for a `WasmEncryptedStore` that uses `sqlite3.wasm` (the existing drift web stack) with a PBKDF2-derived session key. The passphrase is entered once per session via a quiet `LockScreen` — never persisted. The UI explicitly states "session-sealed — the record is encrypted in your browser and held in memory for this session only".
- The Settings → Your data sub-screen is a new `apps/client/lib/screens/your_data_screen.dart` + `your_data_provider.dart`. It surfaces the export affordance (CSV/JSON, three scopes: today / this week / all history) and the sync queue state (signed-in status, pending count, last sync wall-clock). The sub-screen is reached from the new Settings entry on the Day Board header.
- The Day Board header gains a quiet `Settings` affordance (top-right, 48px target) that opens the Settings → Your AI / Your data chooser. Settings → Your AI is already wired (Story 3.3); Settings → Your data ships the export + sync affordances.
- Status chips (`existing widgets/status_chip.dart`) gain the `pending` / `synced` states. The render reads from the queue state and is reactive to the QueueState stream — a calm flip, never a spinner. The `local` state is the v1 carry-over.
- Stack pins unchanged: Flutter 3.47.0, Dart ^3.13.0, drift 2.34.3, sqlite3.wasm (drift web bundle), `pointycastle` (PBKDF2), `flutter_secure_storage` 11.0.0 (mobile only). The Dockerfile and `nginx.conf` (`infra/`) already declare the multi-stage build; Story 4.4 produces the `openplate up` docs and the CI smoke test.
- `Exporter` and `SyncQueue` ports carry no biometric, no telemetry, no logs that include plate content. Errors are typed domain results.

## UX & Interaction Patterns

- Settings → Your data: one calm list (Export / Sync status — Tip Jar is its own row). The export affordance opens a sub-screen: "export as" (CSV / JSON) and "scope" (today / this week / all history) presented as two quiet pill choices; the "export" button writes the file and renders a single calm line "exported: <file>" — no card, no celebration.
- The passphrase gate on the web client is a single quiet input + a "unlock" pill. The Settings → Your data sub-screen honors the same key: the export can't run until the store is unlocked. The word "encrypted" stays; the word "at-rest" is owned by the mobile story; the web truth is "session-sealed".
- Sync status chips: `· local` (default), `· pending` (queued), `· synced` (sage-tint wash). The flip is a CSS-only opacity transition; no spinner, no countdown. The chip state's aria-announce text is localized.
- The Day Board header gains a small `Settings` affordance (top-right, 48px, hairline-bordered). On tap it opens the Settings chooser — Your AI (existing) / Your data (new) / About. No nav-bar, no drawer — this is a single-sheet chooser, calm.
- Settings → Your data never asks for confirmation on export — the export is a read-only operation, and the chip's `local` state is the durable backing. The affordance is reversible (the file is a copy; the source is untouched).
- Accessibility floor: 48px touch targets on the export choices + the Settings affordance; screen reader announces the export scope + the file name; reduce-motion collapses the chip flip to a fade; dynamic type honored without truncation.

## Cross-Story Dependencies

- Story 4.1 swaps the `WebEncryptedStoreStub` (currently selected via conditional import on web) for a `WasmEncryptedStore` that runs the same drift schema on `sqlite3.wasm` with a PBKDF2-derived session key. The mobile `EncryptedStoreAdapter` (drift + sqlite3mc + AES-256) is unchanged.
- Story 4.2 depends on the `Exporter` port (new in `domain_core`) and a write-to-destination adapter (web download / mobile file path). The encrypted store must be open for export to read; the typed result carries a `StoreClosed` so the UI can render the calm "unlock the store first" line.
- Story 4.3 depends on the `SyncQueue` port (new in `domain_core`) and a sync adapter that drains to user-controlled infrastructure only. The `RecordPlate` use-case (Story 1.2) gains an `enqueue` step after the in-store commit. The status chip widget reads the queue state.
- Story 4.4 depends on the existing `infra/Dockerfile` (multi-stageFlutter build + nginx:alpine). The story produces the `openplate up` docs + the CI smoke test (build + run + curl health check). No new code lands.
- Story 4.5 is a verification story: it pins the no-telemetry invariant by adding a fallback test that asserts no network calls in any build (the existing `dio` adapter tree is the only place that ever opens a socket, and the only dio callers are the OFF/USDA catalog + the AI rung transport — both are user-enabled, not automatic).
- Story 4.6 produces the open-source release posture: `LICENSE` (MIT), `CONTRIBUTING.md` (build / test / smoke commands), `docs/no-dark-patterns-standard.md` (the named reviewer gate). The Conftest-style gate pins these files at tag time.
- The Coach (Epic 2) and the AI rung (Epic 3) do not change — Epic 4 is read/write of the same store, with the queue and the exporter as the two new ports.
- Epic 5 (No-Dark-Patterns QA gate) signs off the export + sync copy at review time. The gate is named in the `no-dark-patterns-standard.md` doc.
