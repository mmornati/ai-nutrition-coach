---
title: 'Story 1.6 — Capture sheet fan-out'
type: 'feature'
created: '2026-08-15'
status: 'review'
review_loop_iteration: 0
baseline_commit: '37e22d7'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.5 / 1.7 / 1.8 each ship an entry surface (manual, barcode, photo), but the user needs a single calm "where do I start?" affordance that fans out into them — the bottom-sheet `+` capture sheet. The sheet itself is the contract for "the fastest honest action is one thumb-reach away" and the place that 1.5/1.7/1.8's screens plug into.

**Approach:** Add a `CaptureSheet` modal bottom sheet in `apps/client/lib/widgets/` with three tiles: Snapshot (dominant, sage-deep tile — Story 1.8 wires the photo flow), Scan a barcode (subtile — Story 1.7), Type or talk (subtile — Story 1.5). Add a `CaptureFab` widget that floats at the bottom-right of the Day Board; tapping it opens the sheet. After any successful log the sheet closes back to the Day Board (no modal stack left dangling). A quick-repeat re-shoot affordance appears as a quiet `+ log another plate` link at the top of the Day Board for 5 seconds after a log, then fades (reduced-motion = instant fade, no bounce).

## Boundaries & Constraints

**Always:**
- UX-DR7: bottom sheet fan-out from `+` — Snapshot dominant sage-deep tile / Scan a barcode / Type or talk (subtiles); closes back to Day Board after a log.
- UX-DR10 / FR15: no countdown, no urgency anywhere on the sheet; quiet copy throughout.
- NFR7: each tile is ≥48px hit target; the `+` fab is also ≥48px.
- NFR8: dark mode skin; reduced-motion (no slide-up bounce; just fade).
- AD-1 / AD-3: the sheet is a UI shell — it does no lookups or mutations itself; it only routes to the screens shipped by 1.5 / 1.7 / 1.8.
- Convention: `CaptureSheet` is a stateful widget that takes three callbacks (`onSnapshot`, `onScan`, `onTypeOrTalk`); the wiring happens at the Day Board screen.

**Ask First:**
- Whether the sheet uses Material's `showModalBottomSheet` or a custom Route — spec ships the Material route.
- Whether the quick-repeat affordance is a tap target or a passive banner (spec ships a tap target — `+ log another plate`).

**Never:**
- No countdown timer anywhere on the sheet or its tiles.
- No "did you mean to log faster?" pressure copy.
- No celebratory close animation.
- No Tip Jar or any monetization surface on this sheet (FR15, UX-DR9).
- No drift / SQLite / HTTP imports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_OPEN | User taps `+` on the Day Board | Bottom sheet slides up; 3 tiles render: Snapshot (dominant) / Scan a barcode / Type or talk | N/A |
| HAPPY_PATH_SNAPSHOT | User taps Snapshot tile | Sheet closes; `apps/client/lib/screens/capture_photo_screen.dart` route pushes (shipped by 1.8 — declared in this story's routing as `case captureTarget.photo:` which throws `UnimplementedCaptureTarget` for now) | Typed routing failure if 1.8 hasn't landed |
| HAPPY_PATH_SCAN | User taps Scan tile | Same routing pattern with `captureTarget.barcode`; 1.7 plugs in | Typed routing failure if 1.7 hasn't landed |
| HAPPY_PATH_TYPE | User taps Type tile | Routes to `ManualEntryScreen` (1.5) | N/A |
| QUICK_REPEAT | User just logged a plate within the last 5s | Day Board shows a quiet `+ log another plate` link above the plate stack; tapping it re-opens the CaptureSheet; link fades after 5s | N/A |
| DISMISS | User swipes down on the sheet or taps the scrim | Sheet closes; no log attempted; no nag | N/A |
| DARK_MODE | System in dark theme | Sheet uses `AppPalette.dark` background; sage-deep tile readable in dark; subtile contrast preserved | N/A |
| REDUCED_MOTION | OS reduce-motion enabled | Sheet slides without bounce; quick-repeat fades (no slide) | N/A |
| DYNAMIC_TYPE_LARGEST | OS font scale max | Tile labels reflow; tile height grows; fab size unchanged (≥48px) | N/A |

</frozen-after-approval>

## Code Map

- `apps/client/lib/widgets/capture_sheet.dart` -- new; `Future<T?> showCaptureSheet<T>(BuildContext context)` + the internal `CaptureSheet` widget
- `apps/client/lib/widgets/capture_fab.dart` -- new; floating `+` button ≥48px hit target, sage-deep fill
- `apps/client/lib/state/last_log_provider.dart` -- new; `StateProvider<DateTime?>` tracking the last `RecordPlate` commit time (used to gate the quick-repeat affordance)
- `apps/client/lib/screens/day_board_screen.dart` -- mounts `CaptureFab`; reads `lastLogProvider` to render the quick-repeat affordance; handles 3-way routing
- `apps/client/lib/screens/capture_photo_screen.dart` -- declared but unimplemented in this story; throws `UnimplementedCaptureTarget` for the photo target (Story 1.8 plugs in)
- `apps/client/lib/screens/capture_barcode_screen.dart` -- declared but unimplemented in this story; throws `UnimplementedCaptureTarget` for the barcode target (Story 1.7 plugs in)
- `apps/client/test/widgets/capture_sheet_test.dart` -- widget test: 3 tiles render; tile taps invoke the right callback; scrim dismiss closes the sheet
- `apps/client/test/widgets/capture_fab_test.dart` -- widget test: tap opens the sheet; hit target ≥48px
- `apps/client/test/state/last_log_provider_test.dart` -- unit test: setting a timestamp emits to listeners
- `apps/client/lib/theme/app_tokens.dart:58` -- existing; reused for the tile palette; add `sageDeep` constant if missing (consumed by 1.8 too)

## Tasks & Acceptance

**Execution:**
- [x] `apps/client/lib/widgets/capture_sheet.dart` -- modal bottom sheet with 3 tiles; `Future<void> showCaptureSheet(BuildContext context, {required void Function() onSnapshot, required void Function() onScan, required void Function() onTypeOrTalk})`
- [x] `apps/client/lib/widgets/capture_fab.dart` -- floating `+` button, ≥48px hit target, sage-deep fill; calls `showCaptureSheet`
- [x] `apps/client/lib/state/last_log_provider.dart` -- `StateProvider<DateTime?>`; set on each successful `RecordPlate` commit (wired from `ManualEntryScreen`'s success path — the canonical commit seam in 1.6; 1.7/1.8 wire their own entry surfaces identically)
- [x] `apps/client/lib/screens/day_board_screen.dart` -- mount `CaptureFab`; render quick-repeat `+ log another plate` link if `lastLogProvider` is ≤5s old; route to the right screen
- [x] `apps/client/lib/screens/capture_photo_screen.dart` -- placeholder; throws `UnimplementedCaptureTarget` (Story 1.8 wires)
- [x] `apps/client/lib/screens/capture_barcode_screen.dart` -- placeholder; throws `UnimplementedCaptureTarget` (Story 1.7 wires)
- [x] `apps/client/test/widgets/capture_sheet_test.dart` -- 3 tiles render; each tile tap invokes the right callback; scrim dismiss closes without invoking any callback
- [x] `apps/client/test/widgets/capture_fab_test.dart` -- tap opens the sheet; hit target ≥48px
- [x] `apps/client/test/state/last_log_provider_test.dart` -- state transition test
- [x] `apps/client/lib/main.dart:1` -- home continues to be `DayBoardScreen`; no changes needed
- [x] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given the Day Board, when `+` is tapped, then a bottom sheet fans out with Snapshot (dominant sage-deep tile) / Scan a barcode / Type or talk (subtiles) (UX-DR7).
- Given any tile, when it is tapped, then the sheet closes and the corresponding screen is pushed (UX-DR7).
- Given a successful log, when the Day Board re-renders, then a quiet `+ log another plate` link appears above the plate stack for 5 seconds and then fades (UX-DR7).
- Given the sheet is open, when the scrim or the swipe-down gesture is used, then the sheet closes with no log attempted and no nag (UX-DR10).
- Given any tile, when it is tapped, then its hit target is ≥48px and the tap never overlaps with another tile (NFR7).
- Given dark mode, when the sheet renders, then the sage-deep tile reads correctly in the dark palette (NFR8).
- Given the AD-1 grep test, when `melos run test` runs, then `packages/domain_core/lib/` remains free of drift/SQLite/HTTP imports.

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: new widget + state tests pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm the capture sheet does not contain a spinner, a countdown, or any "faster" copy.
- Confirm the `+` fab is positioned in a thumb-reach zone (bottom-right or bottom-center) without scrolling.

## Suggested Review Order

**Capture sheet (UX-DR7)**
- 3 tiles, scrim dismiss, no countdown.
  [`capture_sheet.dart`](../../apps/client/lib/widgets/capture_sheet.dart)

**Capture FAB (UX-DR7)**
- Floating `+`, ≥48px, opens the sheet.
  [`capture_fab.dart`](../../apps/client/lib/widgets/capture_fab.dart)

**Last log provider + quick-repeat**
- `+ log another plate` link appears for 5s after a log.
  [`last_log_provider.dart`](../../apps/client/lib/state/last_log_provider.dart)

**Day Board integration**
- FAB + quick-repeat + 3-way routing.
  [`day_board_screen.dart`](../../apps/client/lib/screens/day_board_screen.dart)

## Dev Agent Record

### Implementation Plan

The fan-out is layered cleanly on top of the existing Day Board: a
`CaptureFab` floating button (`apps/client/lib/widgets/capture_fab.dart`)
opens a `CaptureSheet` (`apps/client/lib/widgets/capture_sheet.dart`)
which exposes three tiles via three `VoidCallback`s. The Day Board
owns the only mutation-side write — wiring each callback to the
correct `Navigator.push` route.

Two new screens, `CapturePhotoScreen` and `CaptureBarcodeScreen`
(`apps/client/lib/screens/capture_{photo,barcode}_screen.dart`), are
intentionally one-line throw sites for `UnimplementedCaptureTarget`
(declared in `apps/client/lib/screens/capture_targets.dart`). Story
1.7 / 1.8 will replace these with the real flows without further
changes to the sheet or the Day Board.

A new `lastLogProvider` (`apps/client/lib/state/last_log_provider.dart`)
is a tiny `StateProvider<DateTime?>` that any successful
`RecordPlate` caller writes into. The Day Board's quick-repeat
affordance reads it via `ref.listen` and a 5-second `Timer` to
surface a quiet `+ log another plate` link above the plate stack
that fades out via `AnimatedOpacity` (zero duration under reduced-
motion).

`ManualEntryScreen` writes `DateTime.now()` into `lastLogProvider`
on `RecordPlateSuccess`. Stories 1.7 / 1.8 will mirror that pattern
in their own entry surfaces — the convergent write path through
`recordPlateProvider` stays single-source (AD-3); the timestamp is
just a read-only mirror of "the last successful commit".

### Completion Notes

All 11 execution tasks complete; all 7 acceptance criteria satisfied.
The 13 new widget + state tests added by this story pass cleanly
(4 in `last_log_provider_test.dart`, 4 in `capture_fab_test.dart`,
6 in `capture_sheet_test.dart`); the 14 AD-1 purity tests in
`packages/domain_core` and 22 adapter tests in `packages/integrations`
also pass. `flutter analyze` is clean across the workspace.

**Pre-existing date-sensitive test failures (not a regression).**
Four tests in `apps/client/test/day_board_screen_test.dart` —
`partial day: 1 plate + 2 open dents`, `full day: 3 plates across
breakfast/lunch/dinner`, `dynamic type at max scale: rows reflow`,
`plate row carries a BalanceArc` — fail today (16 Aug 2026) because
they seed plates with hard-coded `DateTime(2026, 8, 15, ...)`
while the running clock reads `2026-08-16`. The day_board_provider's
local-day filter excludes the seeded plate, leaving zero `PlateRow`
widgets. Verified to fail identically at HEAD `3b24994` before any
of this story's changes were applied (stashed → re-ran the file →
same 4 failures). The fix is mechanical — replace the hard-coded
dates with `DateTime.now()`-relative dates — but it is out of scope
for story 1.6 (no code in 1.6 drives those tests).

Key implementation choices:

* **`CaptureSheet` API.** The signature is
  `Future<void> showCaptureSheet(BuildContext, {onSnapshot, onScan,
  onTypeOrTalk})`. `Future<void>` (not the spec's `Future<T?>`)
  because the callbacks are `void` and the future just signals "the
  sheet closed" — same observable behavior, cleaner typing.
* **Snapshot tile height.** 96px, vs. 56px for each subtile — the
  `Snapshot` label and its mono whisper ("photo · coming soon")
  give the tile enough body to read as the dominant action. All
  tiles meet the NFR7 48px floor.
* **Reduced-motion.** `AnimatedOpacity` duration collapses to
  `Duration.zero` when `MediaQuery.disableAnimationsOf(context)`
  is true; `showModalBottomSheet`'s default curve already has no
  overshoot, so the slide-up doesn't need a custom transition.
* **`CaptureFab` placement.** Anchored at
  `FloatingActionButtonLocation.endFloat` so the existing
  SafeArea / padding math on the body is untouched; the FAB sits
  over the bottom-right corner in the standard thumb-reach zone.
* **`_openCaptureSheet` shared helper.** Both the FAB's `onPressed`
  and the quick-repeat `+ log another plate` link use the same
  helper so the 3-way routing lives in one place.
* **No celebration / no countdown / no monetization.** Verified by
  grep + visual inspection of `capture_sheet.dart`,
  `capture_fab.dart`, `day_board_screen.dart`,
  `manual_entry_screen.dart` — no spinner, no Timer on the
  sheet, no Tip Jar / paywall references.

### Debug Log

* Initial `flutter analyze` after writing the sheet/fab/placeholders
  flagged an unused `record_plate_provider.dart` import in
  `day_board_screen.dart` (the FAB takes the callbacks directly
  rather than reading the provider). Removed; second analyze clean.
* Same pass flagged `Future<void>` returned from `_openCaptureSheet`
  with return type `void` — the `return showCaptureSheet(...)` was
  redundant; removed.
* Test pass: `capture_fab_test.dart` initially imported
  `flutter_riverpod` (carried over from `selected_date_provider_test`
  template) without using it — analyzer caught it; removed.

### File List

New files (9):

* `apps/client/lib/state/last_log_provider.dart`
* `apps/client/lib/screens/capture_targets.dart`
* `apps/client/lib/screens/capture_photo_screen.dart`
* `apps/client/lib/screens/capture_barcode_screen.dart`
* `apps/client/lib/widgets/capture_sheet.dart`
* `apps/client/lib/widgets/capture_fab.dart`
* `apps/client/test/widgets/capture_sheet_test.dart`
* `apps/client/test/widgets/capture_fab_test.dart`
* `apps/client/test/state/last_log_provider_test.dart`

Modified files (2):

* `apps/client/lib/screens/day_board_screen.dart` — promoted
  `ConsumerWidget` → `ConsumerStatefulWidget`; mounts `CaptureFab`;
  renders the quick-repeat `_QuickRepeatLink` above the plate stack;
  owns the `_openCaptureSheet` helper; `ref.listen` on
  `lastLogProvider`; 5s `Timer` to fade the link out.
* `apps/client/lib/screens/manual_entry_screen.dart` — writes
  `DateTime.now()` into `lastLogProvider` on both the "pick + Log"
  and the "manual add" success paths.

Touched (no functional change):

* `_bmad-output/implementation-artifacts/sprint-status.yaml` —
  flipped 1-6 from `ready-for-dev` → `in-progress` (now `review`);
  added `last_updated` field.

### Change Log

* 2026-08-15 — Story 1.6 implementation complete. New capture fan-out
  shell (sheet + fab + last-log provider + Day Board integration +
  3-way routing to placeholder screens). All ACs satisfied;
  `flutter analyze` clean; 13 new tests + 14 AD-1 + 22 adapter
  tests pass; the 4 pre-existing date-sensitive `day_board_screen`
  tests still fail at HEAD before/after this story (out of scope).
* 2026-08-16 — Code-review patch pass. Applied the eight review
  patches: bumped the Snapshot-tile whisper color from `inkMuted` to
  `palette.background.withValues(alpha: 0.85)` (WCAG contrast on the
  sage-deep tile); replaced `AnimatedOpacity` around
  `_QuickRepeatLink` with a plain conditional render so a fresh Day
  Board reserves zero vertical space for the hidden link; extracted
  three private routing helpers (`_pushSnapshot`, `_pushScan`,
  `_pushTypeOrTalk`) on `DayBoardScreen` and reused them from both
  the FAB and `_openCaptureSheet`; added two tests in
  `manual_entry_screen_test.dart` that read `lastLogProvider` via
  `ProviderScope.containerOf` after the Log tap on both the matched
  and manual-add paths; added a `_QuickRepeatLink` ≥48px hit-target
  test and a `lastLogProvider → + log another plate` integration test
  in `day_board_screen_test.dart`; added a dark-mode test in
  `capture_sheet_test.dart` that asserts the Snapshot tile fills with
  `AppPalette.dark.sageDeep`; added a new
  `test/screens/capture_targets_test.dart` that pins the
  `UnimplementedCaptureTarget` `toString` shape and asserts
  `CapturePhotoScreen` / `CaptureBarcodeScreen` throw the typed
  exception. `flutter analyze` clean (3 pre-existing issues
  unchanged); all new tests pass; the 4 pre-existing date-sensitive
  day-board tests still fail (out of scope).

### Review Findings

- [ ] [Review][Patch] Snapshot tile's "photo · coming soon" whisper text is unreadable (contrast violation) [apps/client/lib/widgets/capture_sheet.dart:166-170]
- [ ] [Review][Patch] AnimatedOpacity always reserves the quick-repeat link's vertical space, leaving a permanent ~48px gap above the plate stack even when no log has happened [apps/client/lib/screens/day_board_screen.dart:202-211]
- [ ] [Review][Patch] FAB inline routing duplicates `_openCaptureSheet`'s callbacks — three `Navigator.push` calls repeated [apps/client/lib/screens/day_board_screen.dart:164-180 vs :118-137]
- [ ] [Review][Patch] No test verifies `lastLogProvider` is set after a successful commit in `ManualEntryScreen` (canonical commit seam is untested) [apps/client/lib/screens/manual_entry_screen.dart:75-78, :111-115]
- [ ] [Review][Patch] No test asserts the `_QuickRepeatLink` hit target is ≥48px — spec AC5 covers CaptureSheet + CaptureFab + the link [apps/client/lib/screens/day_board_screen.dart:285-316]
- [ ] [Review][Patch] No integration test exercises `lastLogProvider` → Day Board quick-repeat affordance surfacing [apps/client/lib/screens/day_board_screen.dart:145-151, :202-211]
- [ ] [Review][Patch] No dark mode test for `CaptureSheet` (NFR8 verification gap) [apps/client/lib/widgets/capture_sheet.dart:69-72]
- [ ] [Review][Patch] No test asserts `UnimplementedCaptureTarget` is thrown by `CapturePhotoScreen` / `CaptureBarcodeScreen` (typed routing failure contract is unverified) [apps/client/lib/screens/capture_photo_screen.dart:21, apps/client/lib/screens/capture_barcode_screen.dart:17]
- [x] [Review][Defer] Four pre-existing date-sensitive tests in `apps/client/test/day_board_screen_test.dart` hard-code `DateTime(2026, 8, 15, ...)` and fail today (2026-08-16) — confirmed at pre-story baseline [apps/client/test/day_board_screen_test.dart:72,92,98,104,187,244] — deferred, pre-existing
