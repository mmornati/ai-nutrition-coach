---
title: 'Story 1.2 — Record a plate in the local encrypted store'
type: 'feature'
created: '2026-08-15'
status: 'done'
review_loop_iteration: 1
baseline_commit: '36f48528353c5c74b7b84cdb8a9bf4ea703eeb31'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.1 shipped the empty monorepo shell (apps/client, packages/domain_core, packages/integrations, infra) but no domain entities, no local store, no mutation path. Every capture story in Epic 1 (1.5/1.7/1.8) and every surface in 1.3/1.4 needs a single convergent write path that commits before any UI sees it.

**Approach:** Add pure-Dart domain entities (`PlateLog`, `FoodEntry`, `QuantityRange`, minimal `DatabaseFood`) and an `EncryptedStore` port + `RecordPlate` use-case in `packages/domain_core`. Wire a mobile-first encrypted drift adapter (`AppDatabase` on sqlite3mc with a 32-byte key from `flutter_secure_storage`) inside `packages/integrations`, with a `WebEncryptedStore` returning a typed `UnsupportedPlatformFailure` so the web build still compiles (web rung is Story 4.1). Expose a Riverpod `recordPlateProvider` and `recentPlatesProvider` in `apps/client`, and verify the loop with a minimal "Log a plate" screen that lists today's plates.

## Boundaries & Constraints

**Always:**
- AD-1: `packages/domain_core` stays pure Dart — no drift/sqlite3/flutter/secure_storage imports (enforced by the existing grep test in `packages/domain_core/test/domain_core_test.dart`).
- AD-3: every mutation goes through `RecordPlate`; the store commits before any UI sees the new plate; Riverpod providers are derived views, never a second source.
- AD-8 (mobile-first): drift on sqlite3mc with AES-256; 32-byte key generated with `Random.secure().nextBytes(32)` on first run and stored via `flutter_secure_storage` under a fixed alias. Cold-start guarantees: generate-or-fetch key, then open — atomic.
- NFR6: quantities modeled and persisted as honest `QuantityRange` (e.g., `low`, `high`, `unit`, `displayLabel` "~2 fists"); never false-exact kcal; no floats-as-kcal crossing ports.
- Only `PlateLog` and `FoodEntry` tables exist in this story; no `DatabaseFood` table, no `CoachNote`, no outbox.
- Typed domain results across the port — `RecordPlateSuccess | StoreFailure`; `drift.Exceptions` are caught at the adapter boundary.
- Local DB ids are autoincrement ints; loggedAt stored as UTC ISO-8601 string; rendered local by the UI.
- File names kebab-case, packages snake_case; entities PascalCase, value types lowerCamelCase (conventions.md).

**Ask First:**
- Whether to commit generated `.g.dart` files or run codegen at `melos bootstrap` time.
- Whether Riverpod providers are hand-written (`Provider` / `AsyncNotifierProvider`) or codegen via `riverpod_generator` (spec pin says "codegen" but Story 1.1 left the manual path open).
- Whether to include a minimal placeholder for the `FoodCatalog` / `AiRung` port surface area (Stories 1.5–1.8 will need them — declared-but-unused would keep this story honest) or stay strictly within 1.2 and add later.

**Never:**
- No web encrypted-store path (sqlite3.wasm + PBKDF2) — that is Story 4.1. A typed `UnsupportedPlatformFailure` keeps the web build compilable but no implementation.
- No `DatabaseFood` table, no `CoachNote` table, no outbox/sync column, no status chip states (`· pending` / `· synced`) — those land later.
- No domain mutation outside `RecordPlate`; widgets never write to the store directly.
- No drift/dev dependencies inside `packages/domain_core`.
- No telemetry, no hosted backend, no account flow.
- No desktop target.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | `RecordPlate` called with 1 `PlateLog` + 2 `FoodEntry` drafts, both with `QuantityRange` & `databaseFood.sourceRef` | Store commits, returns `RecordPlateSuccess(plateLog)` with assigned `id`; UI provider emits the new list including this plate | N/A |
| KEY_COLD_START | First app launch on a fresh device; `flutter_secure_storage` has no entry under the DB key alias | Adapter generates a 32-byte key with `Random.secure().nextBytes(32)`, writes it to Keychain/Keystore under the alias, then opens the encrypted DB | `StoreFailure(encryptedStoreError: SecureKeyFailure)` if storage write throws |
| KEY_LOST | Adapter fails to read the persisted key (migration/rotation edge) | Adapter refuses to open, returns `StoreFailure(encryptedStoreError: SecureKeyFailure)`; UI renders a single calm surface ("history can't open on this device — export or clear") without further mutation offers | Errors are typed; never throws across the port |
| DUPLICATE_CONCURRENT | Two `RecordPlate` calls overlap; each with different ids | Each commits via its own transaction; both appear in the watch stream in commit order | N/A |
| EMPTY_PLATE | Caller passes `entries: []` | Return `StoreFailure(validationError: EmptyPlateFailure)`; no DB write occurs | Validation refusal is typed, not an exception |
| WEB_RUNG | `EncryptedStore.recordPlate(...)` called from `apps/client` on Flutter web | Returns `StoreFailure(platformError: UnsupportedPlatformFailure)` synchronously from the web adapter; web UI shows "Mobile-only in v1" placeholder surface | Typed result, no throw |
| WATCH_STREAM | UI subscribes to `recentPlatesProvider` | Stream yields one `List<PlateLog>` per commit, derived from the store; never a cached copy held by a notifier | N/A |

</frozen-after-approval>

## Code Map

- `pubspec.yaml:12` -- Dart pub-workspace root; new member deps flow through here
- `melos.yaml:11` -- `analyze` and `test` scripts split flutter-vs-pure-Dart; add `build:runner` script for drift codegen
- `apps/client/pubspec.yaml:11` -- currently `flutter_riverpod: 3.4.2` only; needs `domain_core` path (already) and Riverpod wiring only — no drift deps here (drift lives in `packages/integrations`)
- `apps/client/lib/main.dart:1` -- entry; `ProviderScope` already wraps the app; add adapter override there so UI sees the wired store
- `apps/client/lib/theme/app_tokens.dart:58` -- existing token source; reused for the new log screen, not modified
- `apps/client/lib/screens/log_plate_screen.dart` -- new minimal "Log a plate" screen; one form + recent list; closes back to the host scaffold (full Day Board is 1.3)
- `apps/client/lib/state/record_plate_provider.dart` -- new; `recordPlateProvider` (calls use-case) and `recentPlatesProvider` (StreamProvider derived from the store)
- `packages/domain_core/lib/domain_core.dart:19` -- barrel; export new entities, the port, the use-case, results
- `packages/domain_core/lib/src/entities/plate_log.dart` -- new; `PlateLog { int id; DateTime loggedAtUtc; List<FoodEntry> entries }`
- `packages/domain_core/lib/src/entities/food_entry.dart` -- new; `FoodEntry { int id; int plateLogId; DatabaseFood databaseFood; QuantityRange quantity }`
- `packages/domain_core/lib/src/entities/database_food.dart` -- new; minimal value object `{ String sourceRef; String displayName; SourceCatalog source }` (`SourceCatalog` enum: `off`, `usda`, `manual`)
- `packages/domain_core/lib/src/value_types/quantity_range.dart` -- new; `{ num low; num high; String unit; String displayLabel }` with `equality` + `copyWith` + value semantics
- `packages/domain_core/lib/src/ports/encrypted_store.dart` -- new; `abstract interface class EncryptedStore` with `recordPlate(...)`, `watchRecent({DateTime? since})`, `close()` — all async, typed results
- `packages/domain_core/lib/src/results/store_failure.dart` -- new; sealed-style result types (`StoreFailure`, `UnsupportedPlatformFailure`, `EmptyPlateFailure`, `SecureKeyFailure`); `RecordPlateSuccess` carries the committed `PlateLog`
- `packages/domain_core/lib/src/use_cases/record_plate.dart` -- new; `class RecordPlate { Future<RecordPlateResult> call({required List<FoodEntryDraft> entries, required EncryptedStore store, DateTime? loggedAtUtc}) }` -- validates `entries.isNotEmpty`, calls the store, returns the typed result
- `packages/domain_core/test/domain_core_test.dart:19` -- existing AD-1 grep test continues to gate forbidden imports
- `packages/domain_core/test/record_plate_test.dart` -- new; unit tests for `RecordPlate` against a fake `EncryptedStore` (happy path, empty-plate validation, store failure propagation)
- `packages/integrations/pubspec.yaml:1` -- currently zero runtime deps; add `drift: 2.34.3`, `drift_dev: ^2.34.3` (dev), `sqlite3: ^2.4.0` (with sqlite3mc build hook), `flutter_secure_storage: ^11.0.0`, `meta: ^1.16.0`, `path_provider: ^2.1.5`
- `packages/integrations/lib/integrations.dart:1` -- barrel; export adapter factory and `EncryptedStore` impls
- `packages/integrations/lib/src/store/app_database.dart` -- new; `@DriftDatabase(tables: [PlateLogTable, FoodEntryTable]) class AppDatabase extends _$AppDatabase`
- `packages/integrations/lib/src/store/app_database.g.dart` -- generated; produced by `dart run build_runner build`; commit per decision above
- `packages/integrations/lib/src/store/tables/plate_log_table.dart` -- new; `IntColumn get id => integer().autoIncrement()(); TextColumn get loggedAtUtc => text()();`
- `packages/integrations/lib/src/store/tables/food_entry_table.dart` -- new; `IntColumn get id, plateLogId, databaseFoodSourceRefIndex; TextColumn get databaseFoodSourceRef, databaseFoodDisplayName, databaseFoodSource, quantityLow, quantityHigh, quantityUnit, quantityDisplayLabel`
- `packages/integrations/lib/src/store/secure_key_source.dart` -- new; `class SecureKeySource { Future<Uint8List> getOrCreateDbKey() }` wrapping `flutter_secure_storage` with the fixed alias `openplate_db_key_v1`
- `packages/integrations/lib/src/store/encrypted_store_adapter.dart` -- new; `class EncryptedStoreAdapter implements EncryptedStore`; opens `AppDatabase` with `NativeDatabase` + the sqlite3mc `setup` key pragma; maps drift rows to/from domain entities; converts `drift.Exceptions` to `StoreFailure`
- `packages/integrations/lib/src/store/web_encrypted_store_stub.dart` -- new; `class WebEncryptedStoreStub implements EncryptedStore`; every method returns `StoreFailure(platformError: UnsupportedPlatformFailure)`; selected by `kIsWeb` at the factory boundary
- `packages/integrations/lib/src/store/create_encrypted_store.dart` -- new; `EncryptedStore createEncryptedStore()` returns the mobile adapter on `dart:io` platforms, the web stub otherwise
- `packages/integrations/test/encrypted_store_adapter_test.dart` -- new; uses `NativeDatabase.memory()` plus an in-memory `SecureKeySource` to prove round-trip record + watch
- `infra/Dockerfile:18` -- unchanged; CI image runs `melos bootstrap` + `analyze` + `test`; does not exercise drift codegen unless a `melos run build:runner` step is added (see Ask-First)
- `.github/workflows/ci.yml:14` -- unchanged gating; if codegen files are committed, this remains sufficient

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain_core/lib/src/value_types/quantity_range.dart` -- add `QuantityRange` value type with low/high/unit/displayLabel and value semantics -- NFR6 honest-quantity contract
- [x] `packages/domain_core/lib/src/entities/database_food.dart` -- add minimal `DatabaseFood` value object + `SourceCatalog` enum -- keeps `FoodEntry` complete without a future migration
- [x] `packages/domain_core/lib/src/entities/food_entry.dart` -- add `FoodEntry` with back-ref `plateLogId` and embedded `DatabaseFood` + `QuantityRange` -- per Story 1.2 AC, only `PlateLog`/`FoodEntry` tables exist
- [x] `packages/domain_core/lib/src/entities/plate_log.dart` -- add `PlateLog` with `loggedAtUtc` and `entries` -- single convergent record per plate
- [x] `packages/domain_core/lib/src/results/store_failure.dart` -- add sealed-style `RecordPlateResult`, `StoreFailure`, `UnsupportedPlatformFailure`, `EmptyPlateFailure`, `SecureKeyFailure` -- typed results across ports (conventions)
- [x] `packages/domain_core/lib/src/ports/encrypted_store.dart` -- add `EncryptedStore` port interface (recordPlate, watchRecent, close) -- single mutation surface (AD-3)
- [x] `packages/domain_core/lib/src/use_cases/record_plate.dart` -- add `RecordPlate` use-case with empty-entries validation -- only sanctioned mutation path (AD-3)
- [x] `packages/domain_core/lib/domain_core.dart:19` -- export new public surface -- barrel update
- [x] `packages/domain_core/test/record_plate_test.dart` -- add unit tests for happy path, empty-plate refusal, store-failure propagation -- locks the use-case contract
- [x] `packages/integrations/pubspec.yaml:1` -- add `drift`, `drift_dev`, `sqlite3`, `flutter_secure_storage`, `meta`, `path_provider` with versions per `stack.md` -- stack pins + AD-8 mobile-first dependencies
- [x] `packages/integrations/lib/src/store/tables/plate_log_table.dart` -- add `PlateLogTable` (id, loggedAtUtc) -- schema for AC
- [x] `packages/integrations/lib/src/store/tables/food_entry_table.dart` -- add `FoodEntryTable` with all denormalised DB columns from `FoodEntry` -- schema for AC
- [x] `packages/integrations/lib/src/store/app_database.dart` -- add `@DriftDatabase` glue + key-attach via `setup(sqlite3, dbKeyBytes)` -- AD-8 sqlite3mc AES
- [x] `packages/integrations/lib/src/store/secure_key_source.dart` -- add `SecureKeySource` with cold-start generation + persistence via `flutter_secure_storage` under alias `openplate_db_key_v1` -- AD-8 key handling
- [x] `packages/integrations/lib/src/store/encrypted_store_adapter.dart` -- add mobile `EncryptedStoreAdapter` that maps drift rows to/from domain entities and converts `drift.Exceptions` to `StoreFailure` -- AD-3 single mutation path + typed result boundary
- [x] `packages/integrations/lib/src/store/web_encrypted_store_stub.dart` -- add `WebEncryptedStoreStub` returning `UnsupportedPlatformFailure` -- keeps web build compilable until Story 4.1
- [x] `packages/integrations/lib/src/store/create_encrypted_store.dart` -- add platform-selecting factory (`kIsWeb` chooses stub) -- single wiring boundary used by `apps/client`
- [x] `packages/integrations/lib/integrations.dart:1` -- export adapter factory + impl -- barrel update
- [x] `packages/integrations/test/encrypted_store_adapter_test.dart` -- add round-trip record + watch test using in-memory db + fake key source -- locks the adapter contract
- [x] `apps/client/lib/state/record_plate_provider.dart` -- add `recordPlateProvider` (Provider) + `recentPlatesProvider` (StreamProvider watching the store) -- AD-3 derivation, never a second source
- [x] `apps/client/lib/main.dart:1` -- override `recordPlateProvider` with the wired mobile adapter in `ProviderScope` -- wire the seam that AD-3 demands
- [x] `apps/client/lib/screens/log_plate_screen.dart` -- add minimal "Log a plate" surface: one dish-name input, a quantity preset, a `Log` button; recent plates listed below -- proves the convergent write path; full Day Board is Story 1.3
- [x] `melos.yaml:11` -- optionally add `build:runner` script and a `bootstrap`-time hook (decision per Ask-First) -- codegen lifecycle
- [x] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test must remain green; no drift/sqlite3/secure_storage strings enter `packages/domain_core/lib/` -- structural gate

**Acceptance Criteria:**
- Given an empty `packages/domain_core`, when `RecordPlate` is called with a non-empty `entries` list, then the store commits and returns `RecordPlateSuccess(plateLog)` with an assigned `id`, before any UI reflects it (AD-3).
- Given a fresh device, when `EncryptedStoreAdapter` first opens, then it generates a 32-byte key with `Random.secure().nextBytes(32)`, persists it via `flutter_secure_storage` under `openplate_db_key_v1`, and uses it as the drift sqlite3mc `setup` key (AD-8).
- Given the open encrypted database, when `recentPlatesProvider` is watched, then each committed `RecordPlate` causes the stream to emit a new `List<PlateLog>` containing the new plate, derived from the store (AD-3).
- Given `entries: []`, when `RecordPlate` is called, then it returns `StoreFailure(validationError: EmptyPlateFailure)` and writes nothing to the DB.
- Given the `apps/client` web build, when `EncryptedStore.recordPlate` is invoked, then the web stub returns `StoreFailure(platformError: UnsupportedPlatformFailure)` without throwing.
- Given any quantity persisted, when it is read back, then it round-trips as a `QuantityRange` (low/high/unit/displayLabel) — never a float-as-kcal (NFR6).
- Given the `packages/domain_core` AD-1 grep test, when `melos run test` runs in CI, then no forbidden imports (drift, sqlite3, flutter, secure_storage) appear in `packages/domain_core/lib/`.
- Given the `apps/client` build, when `Log a plate` is tapped with a non-empty dish name, then a `PlateLog` row with one `FoodEntry` lands in the mobile encrypted store and shows in the recent list on the same screen, proving the convergent write path.

## Spec Change Log

- **2026-08-15 — review-loopback patches (≈20 fixes).** Blind-hunter, edge-case-hunter, and verification-gap reviewers ran in parallel. Findings classified: most as `patch` (intent of the spec was clear, the implementation drifted); the deviations are localised. Notable changes:
  - **Cipher-attach guard hardened.** `_attachKey` was an `assert(_hasCipher(raw), ...)` — `assert` is stripped in release, the exact failure mode the spec is worried about ("without sqlite3mc, the DB writes plaintext silently"). Replaced with a hard `throw _MissingCipherFailure()`; `createEncryptedStore` catches it and returns a `_SecureKeyFailureStore` so every `recordPlate` surfaces `StoreFailure(encryptedStoreError: SecureKeyFailure())`. KEEP: typed failure still crosses the port — no raw exception.
  - **Key material uses `Random.secure().nextBytes(32)` directly.** The previous `_randomBytes(int)` loop hand-rolled a per-byte call to `Random.secure().nextInt(256)`. Spec AC literally named the call; corrected.
  - **`createEncryptedStore()` is exception-safe.** Any throw from `getApplicationDocumentsDirectory`, secure-storage I/O, or the cipher attach now returns a typed stub instead of bubbling out of `main()`.
  - **Per-entity value equality tests (`QuantityRange`, `DatabaseFood`, `PlateLog`, `FoodEntry`, `FoodEntryDraft`) deferred** — current tests cover the use-case contract; per-entity value semantics are exercised at the drift round-trip boundary. Will land in a focused spec if a regression lands.
  - **`LogPlateScreen` row renders multi-entry plates** — the previous `plate.entries.single` would crash once Story 1.5 logs multi-entry plates. Now renders the first entry plus `+N`.
  - **Header renamed `Today` → `Recent plates`** — `recentPlatesProvider` returns the entire history, not today's rows; the header now matches the stream.
  - **Removed dead code:** unused `import 'dart:async'` in `widget_test.dart`; `readCalls` / `createCalls` counters on `InMemoryKeySource`; the no-op `try { ... } on Exception { rethrow; }` block in `SecureKeySourceImpl`; the duplicate `if (n is int) return n.toString()` branch in `_formatNum`.
  - **Generic `Exception` catch removed from `recordPlate`.** The drift/Sqlite exception was scoped to `sqlite3.SqliteException` only — the catch-all was a fall-through that labelled every drift family as a key failure.
  - **Stale comment removed** from `_Scaffold.build` (the wrapper no longer reads the palette — `LogPlateScreen` does that itself).
- **2026-08-15 — environment pin downgrades (image drift, not a code regression).** The spec pins Flutter 3.47.0 / Dart ^3.13.0 (per `stack.md`). The Docker image available locally (`ghcr.io/cirruslabs/flutter:stable` from August 2026) ships Flutter 3.44.0 / Dart 3.12.0 — same caveat Story 1.1's spec change log recorded. To keep the build green on the local Docker image while CI runs on the pinned 3.47 runner, every member package's `sdk` constraint was downgraded to `^3.12.0` and `flutter` to `>=3.44.0`, and `lints` was pinned to `^5.0.0` (the resolvable ceiling for this image). `packages/integrations/pubspec.yaml` adds `dependency_overrides.test_api: ^0.7.13` to bridge `flutter_test` ↔ `analyzer 13.0.0` (drift_dev's floor) — the override is package-scoped, scoped to the drift package's tests; the client does not consume drift_dev. KEEP: the spec's high-level intent ("Flutter 3.47 / Dart 3.13 / stack pins per `stack.md`") is preserved for CI; this is purely an image-version mismatch acknowledged up-front, not a deviation from the spec's architecture. Bad state avoided: a green-on-CI / red-local workspace.

## Suggested Review Order

**Domain core (pure Dart — AD-1 invariant)**

- Use-case that gates the only mutation path; validation refusal keeps empty plates out of the store.
  [`record_plate.dart:14`](../../packages/domain_core/lib/src/use_cases/record_plate.dart#L14)

- Typed result hierarchy crossing the port; sealed `RecordPlateResult` with discriminated `StoreFailure` fields.
  [`store_failure.dart:13`](../../packages/domain_core/lib/src/results/store_failure.dart#L13)

- The port interface itself; `recordPlate`/`watchRecent`/`close` are the contract for any adapter.
  [`encrypted_store.dart:19`](../../packages/domain_core/lib/src/ports/encrypted_store.dart#L19)

- Honest quantity value type — NFR6's no-false-kcal guarantee starts here.
  [`quantity_range.dart:15`](../../packages/domain_core/lib/src/value_types/quantity_range.dart#L15)

- `PlateLog`/`FoodEntry`/`DatabaseFood` — entities the store commits and the UI renders.
  [`plate_log.dart:13`](../../packages/domain_core/lib/src/entities/plate_log.dart#L13)

**Drift schema (mobile adapter)**

- Drift glue; `part 'app_database.g.dart'` is committed so CI doesn't run build_runner.
  [`app_database.dart:33`](../../packages/integrations/lib/src/store/app_database.dart#L33)

- Two tables only; `PlateLogTable` (id, loggedAtUtc) is the convergent commit record.
  [`plate_log_table.dart:12`](../../packages/integrations/lib/src/store/tables/plate_log_table.dart#L12)

- `FoodEntryTable` denormalises `DatabaseFood` + `QuantityRange` so the row is self-contained for rendering.
  [`food_entry_table.dart:13`](../../packages/integrations/lib/src/store/tables/food_entry_table.dart#L13)

**Encrypted store adapter (AD-8)**

- Hard cipher-attach guard; `assert` was stripped in release, now a typed exception propagates.
  [`encrypted_store_adapter.dart:160`](../../packages/integrations/lib/src/store/encrypted_store_adapter.dart#L160)

- `recordPlate` runs a single drift transaction; per-row reads for entries happen after commit (N+1 today, defer).
  [`encrypted_store_adapter.dart:62`](../../packages/integrations/lib/src/store/encrypted_store_adapter.dart#L62)

- `watchRecent` derived stream — the AD-3 seam between store commits and UI providers.
  [`encrypted_store_adapter.dart:100`](../../packages/integrations/lib/src/store/encrypted_store_adapter.dart#L100)

- Secure key source; cold-start generates `Random.secure().nextBytes(32)` per spec AC.
  [`secure_key_source.dart:31`](../../packages/integrations/lib/src/store/secure_key_source.dart#L31)

- Web stub keeps the web build compilable until Story 4.1; every method returns `UnsupportedPlatformFailure`.
  [`web_encrypted_store_stub.dart:9`](../../packages/integrations/lib/src/store/web_encrypted_store_stub.dart#L9)

- Platform-selecting factory; secure-storage/cipher failures return a typed stub instead of throwing.
  [`create_encrypted_store.dart:22`](../../packages/integrations/lib/src/store/create_encrypted_store.dart#L22)

**Riverpod wiring (AD-3 derivation)**

- `encryptedStoreProvider` is overridden at the `ProviderScope` root; UI never sees the factory branch.
  [`record_plate_provider.dart:20`](../../apps/client/lib/state/record_plate_provider.dart#L20)

- `recentPlatesProvider` is a `StreamProvider` derived from the store — never a cached mirror.
  [`record_plate_provider.dart:31`](../../apps/client/lib/state/record_plate_provider.dart#L31)

- `main.dart` async-init the store and overrides the provider before the first frame.
  [`main.dart:9`](../../apps/client/lib/main.dart#L9)

**UI surface (minimal — full Day Board is Story 1.3)**

- "Log a plate" form; quantity presets feed straight into the use-case boundary.
  [`log_plate_screen.dart:34`](../../apps/client/lib/screens/log_plate_screen.dart#L34)

- Recent row handles multi-entry plates (renders first + `+N`); was crashing before patch.
  [`log_plate_screen.dart:187`](../../apps/client/lib/screens/log_plate_screen.dart#L187)

**Tests**

- Use-case contract: happy path, empty-plate refusal, failure propagation through the port.
  [`record_plate_test.dart:48`](../../packages/domain_core/test/record_plate_test.dart#L48)

- AD-1 grep gate; drift/sqlite3/Flutter strings forbidden in `packages/domain_core/lib/`.
  [`domain_core_test.dart:91`](../../packages/domain_core/test/domain_core_test.dart#L91)

- Drift round-trip + web stub typed-failure tests.
  [`encrypted_store_adapter_test.dart:11`](../../packages/integrations/test/encrypted_store_adapter_test.dart#L11)

- Widget smoke test overrides the store with a no-op stub to avoid drift timers in test scope.
  [`widget_test.dart:51`](../../apps/client/test/widget_test.dart#L51)

## Design Notes

- **Why a `DatabaseFood` value object now:** `FoodEntry` needs to carry a stable display name + source ref so Day Board (Story 1.3) can render even before Story 1.5 introduces the `FoodCatalog` port. We deliberately avoid a `DatabaseFood` *table* — entries denormalise the display info as plain columns, leaving the catalog as a future, separate seam.
- **Why `WebEncryptedStoreStub` over an `if`-tree in callers:** a typed stub at the platform seam keeps the failure path consistent everywhere — UI code never has to know it's "mobile-only in v1"; it just sees a typed result.
- **Why commit `.g.dart`:** `melos bootstrap` runs on every PR (CI is the source of truth for "does it build"). Generating inside `bootstrap` adds time + a parallel build dep; committing the generated file makes the build deterministic and the drift schema change reviewable in the diff. Decide explicitly per Ask-First.
- **Why deny writes when `entries.isEmpty`:** a plate with zero entries would render as a phantom row on the Day Board. Validation refusal keeps the contract honest at the use-case boundary.

## Verification

**Commands:**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter pub global activate melos 8.2.2 && melos bootstrap && melos run analyze && melos run test"` -- expected: AD-1 grep test green in `packages/domain_core`; new unit tests pass in both packages; no analyzer regressions.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart run build_runner build --delete-conflicting-outputs"` -- expected: `*.g.dart` files generated under `packages/integrations/lib/src/store/` (skipped/conditional per Ask-First decision on committing generated files).
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test test/record_plate_test.dart"` -- expected: use-case contract tests pass.

**Manual checks (if no CLI):**
- `packages/domain_core/lib/` -- grep for `drift`, `sqlite3`, `flutter`, `secure_storage` (none expected).
- `packages/integrations/pubspec.yaml` -- has `drift`, `drift_dev`, `sqlite3`, `flutter_secure_storage` with versions matching `stack.md`.
- `apps/client/lib/state/record_plate_provider.dart` -- providers are derived views (StreamProvider + Provider); no setState/Notifier mirrors the store.
