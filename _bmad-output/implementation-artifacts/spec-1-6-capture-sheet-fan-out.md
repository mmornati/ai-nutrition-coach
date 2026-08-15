---
title: 'Story 1.6 — Capture sheet fan-out'
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
- [ ] `apps/client/lib/widgets/capture_sheet.dart` -- modal bottom sheet with 3 tiles; `Future<T?> showCaptureSheet<T>(BuildContext context, {required void Function() onSnapshot, required void Function() onScan, required void Function() onTypeOrTalk})`
- [ ] `apps/client/lib/widgets/capture_fab.dart` -- floating `+` button, ≥48px hit target, sage-deep fill; calls `showCaptureSheet`
- [ ] `apps/client/lib/state/last_log_provider.dart` -- `StateProvider<DateTime?>`; set on each successful `RecordPlate` commit (wire from `recordPlateProvider`'s `onSuccess` callback)
- [ ] `apps/client/lib/screens/day_board_screen.dart` -- mount `CaptureFab`; render quick-repeat `+ log another plate` link if `lastLogProvider` is ≤5s old; route to the right screen
- [ ] `apps/client/lib/screens/capture_photo_screen.dart` -- placeholder; throws `UnimplementedCaptureTarget` (Story 1.8 wires)
- [ ] `apps/client/lib/screens/capture_barcode_screen.dart` -- placeholder; throws `UnimplementedCaptureTarget` (Story 1.7 wires)
- [ ] `apps/client/test/widgets/capture_sheet_test.dart` -- 3 tiles render; each tile tap invokes the right callback; scrim dismiss closes without invoking any callback
- [ ] `apps/client/test/widgets/capture_fab_test.dart` -- tap opens the sheet; hit target ≥48px
- [ ] `apps/client/test/state/last_log_provider_test.dart` -- state transition test
- [ ] `apps/client/lib/main.dart:1` -- home continues to be `DayBoardScreen`; no changes needed
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

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
