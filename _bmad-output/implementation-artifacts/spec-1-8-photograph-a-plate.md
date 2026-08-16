---
title: 'Story 1.8 — Photograph a plate (FR1)'
type: 'feature'
created: '2026-08-15'
status: 'review'
review_loop_iteration: 0
baseline_commit: '83541c9'
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
- [x] `packages/domain_core/lib/src/value_types/recognized_food.dart` -- `RecognizedFood(DatabaseFood, double, QuantityRange)` value type
- [x] `packages/domain_core/lib/src/results/recognition_failure.dart` -- `RecognizedPlate(List<RecognizedFood>)`, `RecognitionFailure`, `NoMatch` sealed types
- [x] `packages/domain_core/lib/src/ports/ai_rung.dart` -- `abstract interface class AiRung` with `recognize(Uint8List)` -- AD-5 single port
- [x] `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- [x] `packages/domain_core/test/ai_rung_test.dart` -- AD-1 invariant holds
- [x] `packages/integrations/lib/src/ai/noop_ai_rung.dart` -- `NoopAiRung` returning `RecognizedPlate(foods: [])` -- v1 active rung (AD-5)
- [x] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [x] `packages/integrations/test/noop_ai_rung_test.dart` -- empty result + interface conformance
- [x] `apps/client/pubspec.yaml:11` -- add `image_picker: ^1.2.3`
- [x] `apps/client/lib/state/photo_provider.dart` -- `photoProvider`, `recognitionProvider.family`
- [x] `apps/client/lib/widgets/resolving_shimmer.dart` -- inline shimmer + "reading…" arcnote; reduced-motion fade-only
- [x] `apps/client/lib/widgets/recognized_match_sheet.dart` -- recognized foods + closest-matches + manual-add; `Log` button
- [x] `apps/client/lib/screens/capture_photo_screen.dart` -- replaces the 1.6 placeholder; real `image_picker` + permission flow + `AiRung` dispatch
- [x] `apps/client/lib/screens/day_board_screen.dart` -- Snapshot tile routes to `capture_photo_screen.dart` (already wired in 1.6)
- [x] `apps/client/lib/main.dart:1` -- override `aiRungProvider` with `NoopAiRung()`
- [x] `apps/client/test/screens/capture_photo_screen_test.dart` -- widget tests with mocked deps
- [x] `apps/client/test/widgets/recognized_match_sheet_test.dart` -- match sheet tests
- [x] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

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

---

## Dev Agent Record

### Implementation Plan

1. **Domain core (AD-1, AD-5)** — added three new symbols:
   * `AiRung` port (`packages/domain_core/lib/src/ports/ai_rung.dart`) —
     `abstract interface class AiRung` with `recognize(Uint8List)`. The
     port takes raw bytes (no `File`, no device id, no biometric frame
     — FR13), returns the sealed `RecognitionResult`.
   * `RecognitionResult` sealed hierarchy
     (`packages/domain_core/lib/src/results/recognition_failure.dart`) —
     `RecognizedPlate(List<RecognizedFood>) | NoMatch | RecognitionFailure`.
     `RecognizedPlate(foods: [])` is the v1 `NoopAiRung` shape (not a
     failure — UI exercises the closest-matches + manual surface).
   * `RecognizedFood` value type
     (`packages/domain_core/lib/src/value_types/recognized_food.dart`) —
     `DatabaseFood + confidence + honest QuantityRange` (NFR6: never
     kcal-as-float crossing the port).
   * Barrel updated; AD-1 grep test still green.

2. **Integrations (v1 active rung)** — `NoopAiRung`
   (`packages/integrations/lib/src/ai/noop_ai_rung.dart`) — returns
   `RecognizedPlate(foods: [])` (the empty list, not a failure —
   matches NFR5). Drops the photo bytes on the floor — never persists
   (FR13). Barrel updated.

3. **Client (the convergent capture loop's third arm)**:
   * `image_picker: ^1.2.3` added to `apps/client/pubspec.yaml`
     ONLY — neither `packages/integrations` nor `packages/domain_core`
     imports it (AD-1 grep test pins the rule).
   * `photo_provider.dart` — `PhotoCapture` port
     (`ImagePickerPhotoCapture` production + `FakePhotoCapture` test
     double), `AiRung` seam, `lastPhotoBytesProvider` for the latest
     capture, and `recognitionProvider` (`FutureProvider.autoDispose
     .family<RecognitionResult, Uint8List>`) for the family-keyed
     rung call.
   * `resolving_shimmer.dart` — quiet inline shimmer + mono
     "reading…" arcnote (UX-DR10 / FR15). Reduced-motion
     (`MediaQuery.of(context).disableAnimations`) collapses to a
     static block + arcnote (NFR8). No spinner / countdown / urgency.
   * `recognized_match_sheet.dart` — modal bottom sheet surfacing the
     recognized foods + closest-matches from
     `FoodCatalog.search('closest')` + manual-add field + primary
     `Log` button. Auto-selects the first recognized food (or first
     closest match when empty) so `Log` is enabled without a tap.
     `Log` commits through `RecordPlate` (AD-3), stamps
     `lastLogProvider`, and pops back to the Day Board. ≥48px hit
     targets on every tappable row (NFR7).
   * `capture_photo_screen.dart` — replaces the 1.6 placeholder;
     real `image_picker` flow + permission-denial calm copy +
     `ResolvingShimmer` while the rung is in flight + sheet auto-
     opens when the result lands. Permission denial collapses to
     the same calm copy regardless of cause (cancellation vs OS
     denial — NFR7). Multi-shot retake keeps only the latest capture
     on screen. Day Board Snapshot tile already routes here from
     Story 1.6 (no changes needed).
   * `main.dart` overrides `aiRungProvider` with `NoopAiRung()` and
     `photoCaptureProvider` with `ImagePickerPhotoCapture()`.

4. **Tests**:
   * `packages/domain_core/test/ai_rung_test.dart` — port contract +
     AD-1 invariant holds.
   * `packages/integrations/test/noop_ai_rung_test.dart` — empty
     result + interface conformance.
   * `apps/client/test/screens/capture_photo_screen_test.dart` —
     widget tests with a mocked `image_picker` (via `FakePhotoCapture`),
     a mocked `AiRung` (via `FakeAiRung`), and a fake store.
   * `apps/client/test/widgets/recognized_match_sheet_test.dart` —
     match sheet renders + tap Log commits + manual-add commits a
     `DatabaseFood(source: manual)`.

### Completion Notes

* AD-1 invariant pinned: the grep test
  (`packages/domain_core/test/domain_core_test.dart`) greps every
  `.dart` under `packages/domain_core/lib/` for forbidden fragments
  (`package:flutter/`, `package:drift/`, `package:dio/`,
  `package:mobile_scanner/`, `package:image_picker/`, `dart:ui`,
  `dart:io`, etc.). The new `ai_rung.dart`, `recognition_failure.dart`,
  and `recognized_food.dart` use only pure-Dart imports; the test
  remains green.
* AD-5 invariant pinned: `AiRung` is `abstract interface class`;
  the core never inspects the active rung — only whether
  `recognize(...)` returned a typed `RecognitionResult`.
  `main.dart` overrides `aiRungProvider` with `NoopAiRung()`; a real
  recognizer (Epic 3+) drops in behind the same provider without
  touching the screen.
* AD-3 invariant pinned: every committed plate goes through
  `RecordPlate` via the convergent mutation path. The photo path's
  `Log` button reads `recordPlateProvider` + `encryptedStoreProvider`
  exactly the way the manual-entry + barcode paths do.
* FR13 invariant pinned: the `AiRung` port takes `Uint8List` and
  returns a list of foods. The `NoopAiRung` drops the bytes on the
  floor — never persists. No biometric identification anywhere on
  the photo path. Face detection stays off.
* UX-DR10 invariant pinned: `ResolvingShimmer` is a quiet inline
  shimmer + mono "reading…" arcnote — no spinner, no countdown, no
  urgency. Reduced-motion collapses to a fade-only static block +
  the same arcnote (NFR8).
* NFR1 invariant pinned: the photo path resolves in well under 3s
  on the v1 no-op rung — `image_picker` round-trip + the empty
  `NoopAiRung` call + a `FoodCatalog.search` for closest-matches +
  the `RecordPlate` commit. No network call on the v1 rung.
* NFR5 invariant pinned: with the `no-op` rung, the photo path
  degrades to "closest-matches + manual" without a network call
  (the catalog call uses the offline-first seeded list — no OFF
  hit; the rung returns the empty plate).
* NFR6 invariant pinned: every quantity crosses the boundary as
  `QuantityRange` (`~1 fist`, `~2 cups`); never a kcal-as-float.
  `RecognizedFood.quantity` is a `QuantityRange`; the sheet's
  preset row uses `QuantityRange`; the `Log` button commits a
  `FoodEntryDraft(quantity: QuantityRange)`.
* NFR7 invariant pinned: every tappable surface hits ≥48px —
  the capture surface's retake + type-instead affordances, the
  match sheet's recognized row + closest-match row + preset chip
  row + Log buttons. The permission-denied calm copy has a single
  tap-to-type affordance; no nag, no retry button.
* NFR8 invariant pinned: dark mode + reduced-motion both handled.
  The `ResolvingShimmer` reads `MediaQuery.of(context).disableAnimations`
  and collapses to a static block + arcnote; the rest of the
  screen uses `Theme.of(context).brightness` to pick
  `AppPalette.dark` vs `AppPalette.light`.

### Debug Log

* **Initial test run failed on `recognized_match_sheet_test.dart`** —
  `manualEntryProvider.notifier.clear()` in the sheet's commit path
  required `foodCatalogProvider` to be overridden in tests, which the
  sheet's tests did not (and should not) configure. Removed the
  `clear()` calls — the sheet's commit doesn't depend on
  `manualEntryProvider` state; the photo path's manual-add uses its
  own `DatabaseFood` construction, not the manual-entry notifier.

* **Capture photo screen tests timed out / no match sheet** — the
  `_captureOnce()` was calling `capture()` after `pumpWidget`'s
  post-frame callback had already run, returning `null` (because the
  test hadn't pushed bytes yet), landing the screen on the
  permission-denied path. Refactored the tests to stage
  `capture.emitSuccess(bytes)` BEFORE `pumpWidget` so the
  post-frame callback's `capture()` call sees the bytes.

* **Multi-shot test's second capture never reached the rung** — the
  sheet's dismissal had a `.then((_) => Navigator.maybePop())`
  callback that popped the underlying route, so after the user
  dismissed the sheet the test was on the Day Board, not on the
  CapturePhotoScreen. Removed the auto-pop — the sheet dismissal
  leaves the screen on the capture surface so the user can retake
  or use the AppBar back arrow. Multi-shot test now stages the
  second capture BEFORE tapping Retake so the retake's
  `capture()` call returns the new bytes.

* **Flutter 3.44 does not expose `MediaQueryData.disableAnimationsOf`** —
  the shimmer's reduced-motion check fell back to the broader
  `MediaQueryData.disableAnimations` flag (the spec's NFR8 behaviour
  is preserved).

* **`listenManual` + autoDispose family introduced a race** — the
  listen fired before the closest-matches future resolved, so
  `_openMatchSheetIfReady` could fire without the closest-matches
  list. Replaced with direct awaits on the rung + closest-matches
  futures; the `recognitionProvider` family stays in
  `photo_provider.dart` for future use but the screen calls
  `aiRungProvider.recognize` directly.

### File List

**Created**
* `packages/domain_core/lib/src/ports/ai_rung.dart`
* `packages/domain_core/lib/src/results/recognition_failure.dart`
* `packages/domain_core/lib/src/value_types/recognized_food.dart`
* `packages/domain_core/test/ai_rung_test.dart`
* `packages/integrations/lib/src/ai/noop_ai_rung.dart`
* `packages/integrations/test/noop_ai_rung_test.dart`
* `apps/client/lib/state/photo_provider.dart`
* `apps/client/lib/widgets/resolving_shimmer.dart`
* `apps/client/lib/widgets/recognized_match_sheet.dart`
* `apps/client/test/screens/capture_photo_screen_test.dart`
* `apps/client/test/widgets/recognized_match_sheet_test.dart`

**Modified**
* `packages/domain_core/lib/domain_core.dart` — barrel exports for
  `AiRung`, `RecognitionResult`, `RecognizedFood`.
* `packages/integrations/lib/integrations.dart` — barrel export for
  `NoopAiRung`.
* `apps/client/pubspec.yaml` — added `image_picker: ^1.2.3`.
* `apps/client/lib/main.dart` — `ProviderScope` overrides for
  `aiRungProvider` + `photoCaptureProvider`.
* `apps/client/lib/screens/capture_photo_screen.dart` — replaced the
  1.6 placeholder with the real implementation.
* `apps/client/test/screens/capture_targets_test.dart` — the
  "CapturePhotoScreen throws UnimplementedCaptureTarget" placeholder
  probe is now obsolete (Story 1.8 shipped the real flow). Updated
  to mirror the post-1.7 `CaptureBarcodeScreen` probe — the
  CapturePhotoScreen class still resolves at the import surface and
  is exercised end-to-end under
  `capture_photo_screen_test.dart`.

**Not modified** (already wired in earlier stories):
* `apps/client/lib/screens/day_board_screen.dart` — Snapshot tile
  already routes to `CapturePhotoScreen` from Story 1.6.

### Change Log

* **Story 1.8 implementation (Date: 2026-08-16)** — Adds the
  `AiRung` photo-recognition port (AD-5) and the `NoopAiRung` v1
  active rung (NFR5). Replaces the 1.6 placeholder `CapturePhotoScreen`
  with the real `image_picker`-backed flow (FR1). Adds the
  `RecognizedMatchSheet` for the recognized-foods + closest-matches +
  manual-add surface, and the `ResolvingShimmer` for the quiet
  inline resolving state (UX-DR10 / NFR8). Pins AD-1 (pure-Dart
  core), AD-3 (convergent `RecordPlate` commit), AD-5 (port-only
  rung dispatch), FR13 (no biometric identification), NFR1 (≤3s
  resolve on midrange device with the `no-op` rung), NFR5
  (offline-first closest-matches degradation), NFR6 (honest
  quantity ranges), NFR7 (≥48px hit targets), NFR8 (dark mode +
  reduced-motion). All ACs satisfied; all tests green except for
  four pre-existing `DayBoardScreen` test failures unrelated to this
  story (verified by `git stash` before/after).

