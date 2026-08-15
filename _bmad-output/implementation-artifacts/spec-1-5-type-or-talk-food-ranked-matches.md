---
title: 'Story 1.5 — Type or talk a food, get ranked matches (FR3)'
type: 'feature'
created: '2026-08-15'
status: 'ready-for-dev'
review_loop_iteration: 0
baseline_commit: '37e22d7'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.2 wired the convergent `RecordPlate` write path; Story 1.3 gave it a Day Board; but there is still no entry surface for the manual / voice path (FR-3). Offline + AI-off must still work; the manual path is the one guaranteed to keep working in every condition.

**Approach:** Add a `FoodCatalog` port in `packages/domain_core` with a typed result hierarchy (`RankedMatches | NotFoundFailure | CatalogFailure`). Implement an `OfflineFirstFoodCatalog` adapter in `packages/integrations` that searches an in-memory seeded list of common foods (OFF + USDA-ish entries) and caches the most recent queries for offline replay. Wire a `ManualEntryScreen` in `apps/client/lib/screens/` with a text field that updates ranked matches live, a quantity preset row, a `Log` button that commits through `RecordPlate`, and a graceful no-match path. Speech-to-text is added as a `speech_to_text`-backed adapter behind a `VoiceTranscriber` port; the spec ships with a `NoopVoiceTranscriber` (no audio capture yet — declared seam, transcribed in a follow-up; the "no voice-print anywhere" guarantee is preserved by never writing audio to disk and never invoking a biometric API).

## Boundaries & Constraints

**Always:**
- AD-1: `FoodCatalog` port and its result hierarchy live in `packages/domain_core` — no Flutter, drift, dio, mobile_scanner, speech_to_text imports.
- AD-4: photo, barcode, and manual/voice paths call the same `FoodCatalog` port (this story ships the manual path; barcode uses it in 1.7; photo path uses `AiRung` in 1.8 and may call `FoodCatalog` for `DatabaseFood` enrichment).
- AD-3: confirmed matches commit through the same `RecordPlate` use-case; no second mutation path.
- NFR6: quantity presets are honest ranges (`~1 fist`, `~2 cups`); never kcal-as-float crossing ports.
- NFR5 (offline-first): the `OfflineFirstFoodCatalog` keeps the last N (≥20) successful queries in a small in-memory LRU; offline replay serves the same result the online call would have returned.
- FR3 / FR13: voice is transcription-only — never a voice-print. `VoiceTranscriber` port takes a `Uint8List` (or `Stream<Uint8List>` in a later story) and returns `TranscribedText | TranscriptionFailure`. No audio is persisted to disk by the adapter.
- UX-DR11: ranked matches + quantity presets; manual `Log` button commits; no countdown.

**Ask First:**
- Whether `speech_to_text` ships in this story's `pubspec.yaml` now (with a no-op transcription surface) or is deferred to a follow-up.
- Whether the no-match path is a typed-form "type the food name" fallback or a "pick from closest matches" picker (spec ships the former for v1 — closest-matches arrives with Epic 3 when a real recognizer is wired).

**Never:**
- No network call to OFF / USDA in this story — the v1 seeded list is built into `packages/integrations/lib/src/catalog/seed_foods.dart` and ships with the package; a future adapter (Epic 3+) can swap in real OFF/USDA lookups behind the same port.
- No voice-print or biometric identification (FR3, FR13).
- No drift/SQLite/SQLite/MOBILE_SCANNER imports in `apps/client/lib` — the catalog adapter is the only place it appears.
- No drift/SQLite imports in `packages/domain_core`.
- No telemetry.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | User types `"salm"` | Ranked matches list shows "Salmon" with confidence + `~1 fist` quantity preset | N/A |
| HAPPY_PATH_CONFIRM | User taps "Salmon" + `~1 fist` + `Log` | `RecordPlate` commits a `PlateLog` with one `FoodEntry`; screen pops back to the Day Board; new row appears | N/A |
| NO_MATCH | User types `"zxqwer"` | List renders empty; "Type the food name to add it manually" appears; a manual-add form lets the user record a custom `DatabaseFood(displayName, source: manual)` | N/A |
| OFFLINE_HIT | User previously searched `"salm"` online | Offline replay returns the same ranked list (no second network call) | N/A |
| OFFLINE_MISS | User searches a never-seen term with network revoked | Empty result + manual-add form, same as the online no-match path | N/A |
| AI_OFF | User has the `no-op` rung active | This story is unaffected — the manual path never touches `AiRung` | N/A |
| VOICE_TRANSCRIBE_OK | User taps mic, says "apple" (no audio persisted) | `VoiceTranscriber.transcribe(...)` returns `TranscribedText("apple")`; text field populates; ranked matches appear | N/A |
| VOICE_PERMISSION_DENIED | User denies microphone | Mic button shows "Microphone denied — type instead" quiet message; entry still works via text | Calm copy, no nag |
| EMPTY_QUANTITY | User taps `Log` without picking a preset | Default preset (`~1 fist`) is applied; if no preset exists for the food, `Log` is disabled with quiet copy "Pick a quantity" | N/A |
| CATALOG_FAILURE | Adapter throws | Screen renders calm "Search isn't available right now" line; entry still works via manual-add | Typed `CatalogFailure` |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/ports/food_catalog.dart` -- new; `abstract interface class FoodCatalog { Future<RankedMatches> search(String query, {int limit = 10}) }` -- AD-4 single port
- `packages/domain_core/lib/src/results/catalog_failure.dart` -- new; sealed-style `CatalogFailure`, `NotFoundFailure`, `RankedMatches(FoodMatch)` -- typed result crossing the port
- `packages/domain_core/lib/src/entities/database_food.dart` -- extend with `foodGroup` (enum: `vegFruit | protein | starch | dairy | other`) so the balance arc can compute real values starting 1.3
- `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- `packages/domain_core/test/food_catalog_test.dart` -- new; unit test asserting the port is interface-only (no Flutter/drift/dio imports)
- `packages/integrations/pubspec.yaml:1` -- no new deps in this story (seeded list only; OFF/USDA live in a follow-up)
- `packages/integrations/lib/src/catalog/offline_first_food_catalog.dart` -- new; adapter implementing `FoodCatalog` against the seeded list with an LRU cache for offline replay
- `packages/integrations/lib/src/catalog/seed_foods.dart` -- new; ≥30 curated foods (offline-safe; locally-verified names) with food-group tags and quantity presets
- `packages/integrations/lib/src/catalog/lru_cache.dart` -- new; small in-memory LRU (≥20 entries, FIFO eviction)
- `packages/integrations/lib/src/voice/noop_voice_transcriber.dart` -- new; returns `TranscriptionFailure(unsupportedInV1)` so the seam is wired but no audio is captured
- `packages/integrations/lib/integrations.dart:1` -- barrel update
- `packages/integrations/test/offline_first_food_catalog_test.dart` -- new; unit tests: ranked match order, offline replay, empty result, no-match path
- `apps/client/lib/state/manual_entry_provider.dart` -- new; `manualEntryProvider` (StateNotifier holding query + selected match + quantity preset) + `foodCatalogProvider` (Provider overridden at the app root)
- `apps/client/lib/screens/manual_entry_screen.dart` -- new; text field + ranked-matches list + quantity preset row + `Log` button + no-match path; mic button (disabled copy)
- `apps/client/lib/state/record_plate_provider.dart` -- existing; reused as-is for the commit path
- `apps/client/test/screens/manual_entry_screen_test.dart` -- widget test: typing updates matches; selecting + tapping Log commits a plate via a fake store
- `apps/client/test/state/manual_entry_provider_test.dart` -- unit test: state transitions for query / select / log
- `apps/client/lib/main.dart:1` -- override `foodCatalogProvider` with `OfflineFirstFoodCatalog(seedFoods)`; keep `encryptedStoreProvider` override

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/entities/database_food.dart` -- add `FoodGroup` enum + `foodGroup` field; preserve value equality + copyWith -- used by 1.3's balance arc
- [ ] `packages/domain_core/lib/src/results/catalog_failure.dart` -- sealed-style `CatalogFailure`, `NotFoundFailure`, `RankedMatches(FoodMatch)` -- typed result
- [ ] `packages/domain_core/lib/src/ports/food_catalog.dart` -- `abstract interface class FoodCatalog` with `search` method -- AD-4 single port
- [ ] `packages/domain_core/lib/domain_core.dart:19` -- export new symbols
- [ ] `packages/domain_core/test/food_catalog_test.dart` -- AD-1 invariant still holds; port is interface-only
- [ ] `packages/integrations/lib/src/catalog/seed_foods.dart` -- ≥30 foods with food-group tags + quantity presets
- [ ] `packages/integrations/lib/src/catalog/lru_cache.dart` -- small in-memory LRU (≥20 entries)
- [ ] `packages/integrations/lib/src/catalog/offline_first_food_catalog.dart` -- adapter implementing `FoodCatalog` against seed + LRU -- NFR5 offline-first
- [ ] `packages/integrations/lib/src/voice/noop_voice_transcriber.dart` -- returns `TranscriptionFailure(unsupportedInV1)` -- seam declared without audio capture
- [ ] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [ ] `packages/integrations/test/offline_first_food_catalog_test.dart` -- ranked order, offline replay, empty result
- [ ] `apps/client/lib/state/manual_entry_provider.dart` -- `manualEntryProvider` (StateNotifier), `foodCatalogProvider` (Provider), `voiceTranscriberProvider` (Provider)
- [ ] `apps/client/lib/screens/manual_entry_screen.dart` -- text field + ranked list + quantity presets + `Log` button + no-match fallback + mic button (quiet copy)
- [ ] `apps/client/test/screens/manual_entry_screen_test.dart` -- widget test using a fake store + fake catalog
- [ ] `apps/client/test/state/manual_entry_provider_test.dart` -- state transition test
- [ ] `apps/client/lib/main.dart:1` -- wire `foodCatalogProvider` + `voiceTranscriberProvider` overrides at the root
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given the user types a partial food name, when ranked matches render, then they resolve from the `FoodCatalog` port and display with quantity presets (FR3, UX-DR11).
- Given the user confirms a match + quantity + taps `Log`, when the commit completes, then a `PlateLog` with one `FoodEntry` is created via `RecordPlate` and the screen pops back to the Day Board (AD-3, NFR2).
- Given the user has no network and the AI tier is off, when they type a previously-seen query, then the same ranked list is served from the local LRU cache (FR3, UJ-5, NFR5).
- Given the user types a never-seen term, when no matches render, then a manual-add form lets the user record a custom `DatabaseFood(displayName, source: manual)` without failing the log.
- Given the user taps the mic button, when it renders, then a quiet copy "Voice not available in v1 — type instead" shows; no audio capture occurs; no biometric identification is performed (FR3, FR13).
- Given the AD-1 grep test, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/speech_to_text imports.

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: new widget + state tests pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm the seeded list covers at least 30 foods across all four food groups.
- Confirm no third-party HTTP/dio dependency is added to `apps/client/pubspec.yaml` (FR3 must work offline).

## Suggested Review Order

**Domain port (AD-4 single seam)**
- The single port every entry path (photo, barcode, manual/voice) calls into.
  [`food_catalog.dart`](../../packages/domain_core/lib/src/ports/food_catalog.dart)

**Typed result hierarchy**
- Sealed `RankedMatches | CatalogFailure | NotFoundFailure` — typed results, never raw exceptions.
  [`catalog_failure.dart`](../../packages/domain_core/lib/src/results/catalog_failure.dart)

**DatabaseFood extension (foodGroup)**
- Adds the food-group tag needed by 1.3's balance arc.
  [`database_food.dart`](../../packages/domain_core/lib/src/entities/database_food.dart)

**Offline-first adapter (NFR5)**
- Seeded list + LRU cache for offline replay; no network call in this story.
  [`offline_first_food_catalog.dart`](../../packages/integrations/lib/src/catalog/offline_first_food_catalog.dart)

**Manual entry screen (UX-DR11)**
- Text field + ranked list + quantity presets + `Log` button + no-match path + mic button (quiet copy).
  [`manual_entry_screen.dart`](../../apps/client/lib/screens/manual_entry_screen.dart)
