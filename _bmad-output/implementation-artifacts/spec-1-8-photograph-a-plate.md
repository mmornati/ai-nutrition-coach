---
title: 'Story 1.8 — Photograph a plate (FR1)'
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

**Problem:** Stories 1.5 / 1.7 ship the manual + barcode paths. The photo path (FR-1) — "snap my plate and have it resolve to foods with estimated quantities" — is the headline feature and the one that closes the three-way convergent capture loop. But v1 ships with the `no-op` AI rung active (AD-5); the photo path must dispatch through the `AiRung` port and degrade honestly (recognize → closest-matches → manual) — never fail the log.

**Approach:** Add an `AiRung` port in `packages/domain_core` with a typed result hierarchy (`RecognizedPlate | RecognitionFailure`). Implement a `NoopAiRung` in `packages/integrations` (the v1 active rung) that returns a `RecognizedPlate` carrying an empty list (no real recognition — Epic 3 plugs in real recognizers). Add a `CapturePhotoScreen` in `apps/client/lib/screens/` that uses `image_picker` to capture a single photo, dispatches through `AiRung`, and routes the result through `RecordPlate`. Ambiguity (empty recognition) offers closest matches via `FoodCatalog.search` with a fallback manual-add form. Resolution renders a quiet inline shimmer + mono "reading…" arcnote — never a spinner. Implement `capture_photo_screen.dart` declared by 1.6.

## Boundaries & Constraints

**Always:**
- AD-1: `AiRung` port lives in `packages/domain_core` — no Flutter, image_picker, dio imports.
- AD-5: photo recognition dispatches through the port; core never branches on which rung is active; only on whether a port call succeeded.
- AD-3: confirmed matches commit through `RecordPlate`; no second mutation path.
- FR13: photo is processed with no identity linkage — no face/voice biometric anywhere on this path.
- FR1 / NFR1: a single well-lit photo resolves in ≤3s on a midrange device; with the `no-op` rung this means the `image_picker` round-trip + a 0-recognizer call + a UI render — must be well under 3s.
- NFR5: when AI rung is `no-op`, the photo path degrades to "closest-matches + manual" without a network call.
- UX-DR10: resolving state is a quiet inline shimmer + "reading…" mono arcnote — never a spinner, never a countdown.
- NFR6: quantities are honest ranges (`~2 fists`); never a kcal-as-float crossing the port.

**Ask First:**
- Whether `image_picker` is the camera surface (spec ships it; stack pins it to 1.2.3).
- Whether `no-op` rung returns an empty list (forcing closest-matches path) or a tiny curated demo list (forcing a confidence match); spec ships the empty-list path so the photo flow exercises the same manual/closest-match surface that 1.5 already shipped.

**Never:**
- No real ML model, no third-party food-recognition HTTP call in this story (Epic 3 ships the real recognizers behind the same port).
- No biometric identification (FR13) — face detection must remain off.
- No drift/SQLite imports in `apps/client/lib`.
- No spinner / countdown / urgency on the capture surface (FR15).
- No image persisted to disk outside the picker contract (no auto-upload, no caching beyond what the picker does).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_NOOP | User captures a well-lit photo | `NoopAiRung.recognize(photo)` returns `RecognizedPlate(foods: [])`; UI offers closest-matches + manual entry (same surface as 1.5); user confirms → commits a `PlateLog` via `RecordPlate` | N/A |
| HAPPY_PATH_FAST | Photo round-trip + rung call + UI render complete in ≤3s on a midrange device | NFR1 met | N/A |
| AMBIGUOUS_RECOGNITION | `RecognizedPlate(foods: [low-confidence food])` | UI offers the food + "or pick another" + closest matches + manual entry — log never fails | N/A |
| PHOTO_PERMISSION_DENIED | User denies camera | Screen renders "Camera denied — type it instead"; routes to `ManualEntryScreen` | Calm copy, no nag |
| AI_RUNG_FAILURE | `AiRung.recognize(...)` throws | Falls back to closest-matches + manual; no crash | Typed `RecognitionFailure` |
| OFFLINE_NOOP | Network revoked | `NoopAiRung` works fully offline; closest-matches + manual entry continue working | N/A |
| RESOLVING_STATE | Between capture and result | Quiet inline shimmer + mono "reading…" arcnote (no spinner) | N/A |
| DARK_MODE | System in dark theme | Capture UI uses dark palette; shimmer reduced-motion compatible | N/A |
| REDUCED_MOTION | OS reduce-motion enabled | Shimmer collapses to fade only | N/A |
| MULTIPLE_SHOTS | User retakes before committing | Only the latest photo is dispatched; previous is discarded | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/ports/ai_rung.dart` -- new; `abstract interface class AiRung { Future<RecognizedPlate> recognize(Uint8List photoBytes) }` -- AD-5 single port
- `packages/domain_core/lib/src/results/recognition_failure.dart` -- new; sealed-style `RecognizedPlate(List<RecognizedFood>)`, `RecognitionFailure`, `NoMatch` -- typed result
- `packages/domain_core/lib/src/value_types/recognized_food.dart` -- new; `RecognizedFood(DatabaseFood databaseFood, double confidence, QuantityRange quantity)` -- a single recognized item with honest range
- `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- `packages/domain_core/test/ai_rung_test.dart` -- new; AD-1 invariant holds; port is interface-only
- `packages/integrations/lib/src/ai/noop_ai_rung.dart` -- new; returns `RecognizedPlate(foods: [])` (the v1 active rung)
- `packages/integrations/lib/integrations.dart:1` -- barrel update
- `packages/integrations/test/noop_ai_rung_test.dart` -- new; verifies the empty-list result + `AiRung` interface conformance
- `apps/client/lib/state/photo_provider.dart` -- new; `photoProvider` (StateNotifier holding the latest capture) + `recognitionProvider` (FutureProvider.family for the rung call)
- `apps/client/lib/screens/capture_photo_screen.dart` -- replace the 1.6 placeholder; real implementation using `image_picker`
- `apps/client/lib/widgets/resolving_shimmer.dart` -- new; quiet inline shimmer + mono "reading…" arcnote; reduced-motion = fade only
- `apps/client/lib/widgets/recognized_match_sheet.dart` -- new; sheet showing matched foods + closest-matches + manual-add path; `Log` button
- `apps/client/lib/screens/day_board_screen.dart` -- Snapshot tile routes to `capture_photo_screen.dart`
- `apps/client/pubspec.yaml:11` -- add `image_picker: ^1.2.3` (camera)
- `apps/client/test/screens/capture_photo_screen_test.dart` -- widget test with mocked `image_picker` + mocked `AiRung` + fake store
- `apps/client/test/widgets/recognized_match_sheet_test.dart` -- widget test for the match sheet
- `apps/client/lib/main.dart:1` -- override `aiRungProvider` with `NoopAiRung()` at the root

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/value_types/recognized_food.dart` -- `RecognizedFood(DatabaseFood, double, QuantityRange)` value type
- [ ] `packages/domain_core/lib/src/results/recognition_failure.dart` -- `RecognizedPlate(List<RecognizedFood>)`, `RecognitionFailure`, `NoMatch` sealed types
- [ ] `packages/domain_core/lib/src/ports/ai_rung.dart` -- `abstract interface class AiRung` with `recognize(Uint8List)` -- AD-5 single port
- [ ] `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- [ ] `packages/domain_core/test/ai_rung_test.dart` -- AD-1 invariant holds
- [ ] `packages/integrations/lib/src/ai/noop_ai_rung.dart` -- `NoopAiRung` returning `RecognizedPlate(foods: [])` -- v1 active rung (AD-5)
- [ ] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [ ] `packages/integrations/test/noop_ai_rung_test.dart` -- empty result + interface conformance
- [ ] `apps/client/pubspec.yaml:11` -- add `image_picker: ^1.2.3`
- [ ] `apps/client/lib/state/photo_provider.dart` -- `photoProvider`, `recognitionProvider.family`
- [ ] `apps/client/lib/widgets/resolving_shimmer.dart` -- inline shimmer + "reading…" arcnote; reduced-motion fade-only
- [ ] `apps/client/lib/widgets/recognized_match_sheet.dart` -- recognized foods + closest-matches + manual-add; `Log` button
- [ ] `apps/client/lib/screens/capture_photo_screen.dart` -- replaces the 1.6 placeholder; real `image_picker` + permission flow + `AiRung` dispatch
- [ ] `apps/client/lib/screens/day_board_screen.dart` -- Snapshot tile routes to `capture_photo_screen.dart`
- [ ] `apps/client/lib/main.dart:1` -- override `aiRungProvider` with `NoopAiRung()`
- [ ] `apps/client/test/screens/capture_photo_screen_test.dart` -- widget tests with mocked deps
- [ ] `apps/client/test/widgets/recognized_match_sheet_test.dart` -- match sheet tests
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given photo access, when a single well-lit photo is captured, then it dispatches through the `AiRung` port to the active rung (`NoopAiRung` in v1) and renders a recognized match sheet with quantity ranges (FR1, AD-5).
- Given ambiguity (empty recognition), when the user views the match sheet, then closest matches + manual quantity are offered; the log never fails (FR1, UX-DR10).
- Given the resolving state, when it is shown, then a quiet inline shimmer + mono "reading…" arcnote appears — never a spinner (UX-DR10, FR15).
- Given AI is off / offline, when the user captures a photo, then the flow degrades honestly (recognize → closest-matches → manual) without a network call (UJ-4, NFR5).
- Given the user confirms a match + quantity + taps `Log`, when the commit completes, then the photo path commits through the same `RecordPlate` use-case as every other path (NFR2).
- Given photo permission is denied, when the screen renders, then a calm "Camera denied — type it instead" line appears and routes to `ManualEntryScreen`; no nag (NFR7).
- Given a midrange device, when a single photo is captured, then resolve (pick → UI render) completes in ≤3s (NFR1).
- Given the photo path, when the photo is processed, then no biometric identification is performed and no identity linkage is created (FR13).
- Given the AD-1 grep test, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker imports.

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: new widget + state tests pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `image_picker` is the only camera dependency; no `camera` plugin or other alt.
- Confirm `NoopAiRung` is the only rung in `packages/integrations/lib/src/ai/`; real recognizers land in Epic 3.
- Confirm the resolving state uses a shimmer, not a `CircularProgressIndicator`.

## Suggested Review Order

**AiRung port (AD-5)**
- The single port every recognizer plugs into; core never branches on the active rung.
  [`ai_rung.dart`](../../packages/domain_core/lib/src/ports/ai_rung.dart)

**Typed result hierarchy**
- `RecognizedPlate | RecognitionFailure | NoMatch` — typed results, never raw exceptions.
  [`recognition_failure.dart`](../../packages/domain_core/lib/src/results/recognition_failure.dart)

**RecognizedFood value type (NFR6)**
- Each recognized item carries a `DatabaseFood` + `confidence` + honest `QuantityRange`.
  [`recognized_food.dart`](../../packages/domain_core/lib/src/value_types/recognized_food.dart)

**No-op AI rung (v1 active rung)**
- Returns empty recognition so the photo path exercises closest-matches + manual.
  [`noop_ai_rung.dart`](../../packages/integrations/lib/src/ai/noop_ai_rung.dart)

**Capture photo screen (NFR1, NFR7, FR13)**
- `image_picker` + permission + `AiRung` dispatch + match sheet + commit.
  [`capture_photo_screen.dart`](../../apps/client/lib/screens/capture_photo_screen.dart)
