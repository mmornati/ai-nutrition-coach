---
title: 'Story 1.4 — Week strip — tap-a-day navigation'
type: 'feature'
created: '2026-08-15'
status: 'done'
review_loop_iteration: 0
baseline_commit: '37e22d7'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.3 shipped the Day Board for today, but the user has no way to look back at yesterday or earlier in the week. The PRD calls for "no streaks, no countdowns, no guilt" — but they still need to navigate to past days. The week strip is the calm alternative: 7 mini-dots, sage fill on balanced days, neutral outline otherwise; tap to navigate.

**Approach:** Add a `WeekStrip` widget below the Day Board that reads from `recentPlatesProvider` (already exposing full history), groups plates by local date for the 7 days ending today (today rightmost), computes a per-day "balanced" boolean (true when ≥1 plate exists with the arcnote ≥3 of 4 — placeholder heuristic for v1; the full coach-driven balance lands in Epic 2), and renders 7 mini-dots with semantic labels for screen readers. Tapping a dot updates `selectedDateProvider` (a new `StateProvider<DateTime>`); the Day Board reads from it instead of "today" when set.

## Boundaries & Constraints

**Always:**
- AD-3: strip is a derived view; no mutations.
- UX-DR8: 7 mini-dots, sage fill on balanced days, neutral outline otherwise; mono whisper "no streaks · no countdowns · no guilt" sits under the strip; no week-report screen.
- NFR7: each dot has a Semantics label announcing the date and the balance state; tap target ≥48px.
- NFR8: dark mode skin; reduced-motion (no bounce on dot fill).
- No streaks, countdowns, or guilt anywhere on this strip — that copy is the negative guarantee.
- Convention: state stored as UTC ISO-8601 in domain; rendered local. The strip buckets on `loggedAtUtc.toLocal()`.

**Ask First:**
- Whether "balanced day" is defined for v1 as "any day with ≥1 plate" (loose) or "≥3 plates with arc ≥3 of 4" (strict) — v1 ships the loose definition.
- Whether the strip is always 7 days (today + 6 prior) or scrolls a full week window.

**Never:**
- No week-report screen (PRD: "no week-report screen in v1").
- No streak indicator (no fire, no "X days in a row", no count-up).
- No countdown (no "tomorrow starts your week fresh!").
- No celebratory pop-up on a balanced day (NFR6 / FR15).
- No drift / SQLite / HTTP imports in `apps/client/lib`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_BALANCED | ≥1 plate per day for 7 days | 7 sage-filled dots; tap on any day loads that day's Day Board | N/A |
| HAPPY_PATH_PARTIAL | 3 days with plates, 4 empty | 3 sage dots + 4 outlined dots in correct positions; tap on empty day shows 3 open dents (via Day Board) | N/A |
| HAPPY_PATH_EMPTY | No plates ever | 7 outlined dots; tap on any day shows 3 open dents | N/A |
| TAP_NAVIGATION | User taps yesterday's dot | `selectedDateProvider` updates to yesterday (local); Day Board re-renders with yesterday's plates (or open dents) | N/A |
| WHEEL_PICKER | (out of v1 scope, declared) | n/a | N/A |
| DARK_MODE | System in dark theme | Strip uses dark palette; sage accent on dark; whisper mono readable | N/A |
| DYNAMIC_TYPE_LARGEST | OS font scale max | Whisper reflows; dots stay the same size (≥48px hit target through padding) | N/A |

</frozen-after-approval>

## Code Map

- `apps/client/lib/screens/day_board_screen.dart` -- Day Board screen reads `selectedDateProvider` instead of computing "today" locally; falls back to today when null
- `apps/client/lib/widgets/week_strip.dart` -- new; 7 dots + mono whisper; Semantics labels
- `apps/client/lib/state/selected_date_provider.dart` -- new; `StateProvider<DateTime?>` keyed by local date
- `apps/client/lib/state/day_board_provider.dart` -- update to accept a date parameter (defaults to "today"); reused by 1.3 with backward compat
- `apps/client/test/widgets/week_strip_test.dart` -- widget test: balanced + partial + empty renderings; tap updates the provider
- `apps/client/test/state/selected_date_provider_test.dart` -- unit test: setting a date re-emits the value to subscribers
- `apps/client/lib/theme/app_tokens.dart:58` -- existing; reused; no edits

## Tasks & Acceptance

**Execution:**
- [x] `apps/client/lib/state/selected_date_provider.dart` -- `final selectedDateProvider = StateProvider<DateTime?>((_) => null)` -- holds the user's selected local date, `null` = today
- [x] `apps/client/lib/state/day_board_provider.dart` -- accept a `DateTime? date` parameter (defaults to today); refactor bucket logic so it works for any local date; keep backward compat with 1.3's "today" call
- [x] `apps/client/lib/widgets/week_strip.dart` -- 7 mini-dots arranged horizontally (today rightmost); sage fill when the day has ≥1 plate, neutral outline otherwise; mono whisper "no streaks · no countdowns · no guilt" beneath; tap updates `selectedDateProvider`; Semantics labels per dot
- [x] `apps/client/lib/screens/day_board_screen.dart` -- read `selectedDateProvider`; pass it to `dayBoardProvider`; render `WeekStrip` below the plate stack (still above any future Coach whisper anchor)
- [x] `apps/client/test/widgets/week_strip_test.dart` -- empty + partial + happy-path renderings; tap on a dot updates `selectedDateProvider` (verify via `ProviderContainer`)
- [x] `apps/client/test/state/selected_date_provider_test.dart` -- setting a date re-emits the new value to a listener
- [x] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given a week of data, when the strip renders at the Day Board bottom, then 7 mini-dots show sage fill on days with ≥1 plate and a neutral outline otherwise (UX-DR8).
- Given any dot, when it is tapped, then the Day Board loads that day's plate stack; no week-report screen is opened (UX-DR8).
- Given the strip, when it renders, then the mono whisper "no streaks · no countdowns · no guilt" is visible beneath the dots.
- Given an empty day is tapped, when the Day Board re-renders, then 3 open dents are shown (UX-DR10).
- Given any dot, when screen reader announces it, then the label is the date plus the balance state (e.g., "Tuesday, balanced").
- Given dark mode, when the strip renders, then dots and whisper use the dark palette without losing contrast (NFR8).
- Given the AD-1 grep test, when `melos run test` runs, then `packages/domain_core/lib/` remains free of drift/SQLite/HTTP imports.

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: new widget + state tests pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm no third-party charting library is added; the strip is plain `Row` + `GestureDetector`.
- Confirm `dayBoardProvider`'s old "today" call site (Story 1.3) still compiles without modification (backward compat via default arg).

## Suggested Review Order

**Selected date provider (state seam)**
- Holds the user's selected local date; `null` = today.
  [`selected_date_provider.dart`](../../apps/client/lib/state/selected_date_provider.dart)

**Day Board provider — date-aware**
- Bucket logic refactored to accept any local date.
  [`day_board_provider.dart`](../../apps/client/lib/state/day_board_provider.dart)

**Week strip widget (UX-DR8)**
- 7 dots + mono whisper + Semantics; tap updates the provider.
  [`week_strip.dart`](../../apps/client/lib/widgets/week_strip.dart)

**Day Board integration**
- Day Board reads the selected date; Week Strip renders below the plate stack.
  [`day_board_screen.dart`](../../apps/client/lib/screens/day_board_screen.dart)

## Dev Agent Record

### Implementation Plan

The spec's code map partitioned the work across four surfaces plus three test files. Build order followed the data flow:

1. **Fake store swap (review-flagged for 1.4).** `FakeEncryptedStore` is reworked from a single static `Stream.value(...)` to a `StreamController.broadcast()` so `seed()` and `recordPlate()` re-emit. The first subscriber still receives the initial snapshot via an `async*` `yield` before forwarding subsequent controller events — keeping every Story 1.3 test green while letting the week-strip suite prove re-emission end-to-end.
2. **Selected date provider (state seam).** A tiny `StateProvider<DateTime?>` in the riverpod `legacy.dart` shim, initial state `null` (today). The Day Board and the strip both read it; only the strip writes.
3. **Day Board provider — date-aware.** Rename `_classifyToday` → `_classifyForDate(plates, date)`; expose `dayBoardForDateProvider` as a `Provider.family<AsyncValue<DayBoardDay>, DateTime>` for non-today days. `dayBoardProvider` stays a no-arg provider for Story 1.3 backward compat — the existing call sites compile unchanged.
4. **Week strip widget.** A `ConsumerWidget` that watches `recentPlatesProvider`, computes the 7 local-midnight days ending today, and renders 7 `GestureDetector`-wrapped dots (sage fill on balanced, hairline outline on quiet, 48×48 hit target, Semantics label per dot). Mono whisper "no streaks · no countdowns · no guilt" beneath.
5. **Day Board screen.** Reads `selectedDateProvider`; switches between `dayBoardProvider` (null) and `dayBoardForDateProvider(selected)`; title adapts to "Today" / "Yesterday" / weekday; renders the strip below the plate stack.
6. **Tests.** `selected_date_provider_test.dart` for the provider contract; `week_strip_test.dart` for empty / partial / happy-path renderings, tap updates the provider, re-emit after `seed()`, dark mode, Semantics labels, and ≥48px hit targets.

### Completion Notes

- 33 client tests pass inside `ghcr.io/cirruslabs/flutter:stable` on the local Docker image (was 21 in Story 1.3; +12 new tests for the strip + state provider).
- `flutter analyze` for `apps/client` introduces zero new issues; the 3 pre-existing `domain_core` issues are in the test files only (`prefer_initializing_formals`) plus one `analysis_options.yaml` unrecognized-diagnostic warning — none introduced by this story.
- AD-1 grep test stays green: `dart test` against `packages/domain_core/test/domain_core_test.dart` passes both the lib-import scan and the pubspec dep scan.
- No third-party charting library was added — the strip is plain `Row` + `GestureDetector` + `Container` per spec review order.
- Story 1.3's `dayBoardProvider` call site still compiles unchanged (backward compat via the no-arg provider). The screen was the only file that needed to switch to reading `selectedDateProvider`.
- The screen's title dynamically shows "Today" / "Yesterday" / the weekday name based on the selected date. The spec didn't mandate a title change, but "Today" as a heading when viewing yesterday would have been a UX bug — flagged here as a deliberate, non-spec extension.

### Debug Log

- `StateProvider` is no longer exported from the main `flutter_riverpod.dart` in riverpod 3.x — it's in the `legacy.dart` shim (deprecation path; the spec keeps `StateProvider` because the selected date is ephemeral UI hint, not domain state). The import was changed to `package:flutter_riverpod/legacy.dart` and a doc comment explains the choice.
- The Docker image (`ghcr.io/cirruslabs/flutter:stable`) ships a partially populated `/root/.pub-cache/hosted/pub.dev/` (102 SDK packages only). `flutter pub get` against an existing `pubspec.lock` reports "Got dependencies!" without actually downloading third-party packages — every package that the lockfile references is missing from disk. Workaround inside this session: `rm -rf .dart_tool pubspec.lock apps/client/.dart_tool packages/domain_core/.dart_tool packages/integrations/.dart_tool` before `flutter pub get` to force a fresh resolve + download. Outside this session the cache is wiped between `docker run --rm` invocations, so the same `rm` + `flutter pub get` chain is required at the start of every verification run.
- `tester.ensureSemantics()` returns a `SemanticsHandle` that the test binding asserts has been disposed at teardown. `addTearDown(handle.dispose)` did not fire early enough in one of the week-strip tests; switched to an explicit `try { ... } finally { handle.dispose(); }` block inside the test body.
- The Day Board's `ListView.separated` uses `(_, _) =>` for the `separatorBuilder`; the `_` placeholder is intentional (the separator doesn't use the build context or index) but reads as an unused-param pattern. Kept as-is — the lints set doesn't flag `_` placeholders here.

### File List

**Created:**
- `apps/client/lib/state/selected_date_provider.dart`
- `apps/client/lib/widgets/week_strip.dart`
- `apps/client/test/state/selected_date_provider_test.dart`
- `apps/client/test/widgets/week_strip_test.dart`

**Modified:**
- `apps/client/lib/state/day_board_provider.dart` — `_classifyToday` → `_classifyForDate(plates, date)`; added `dayBoardForDateProvider` family; kept the no-arg `dayBoardProvider` for Story 1.3 backward compat. `classifyForDate` is now the `@visibleForTesting` helper.
- `apps/client/lib/screens/day_board_screen.dart` — reads `selectedDateProvider`, switches between today and date-aware providers, renders `WeekStrip` below the plate stack; title adapts to the selected day ("Today" / "Yesterday" / weekday).
- `apps/client/test/_fakes/fake_encrypted_store.dart` — `_stream = Stream.value(...)` swapped for a `StreamController.broadcast()`. `seed()` and `recordPlate()` push the new snapshot; `watchRecent()` is now an `async*` that yields the initial snapshot synchronously then forwards subsequent controller events. `close()` closes the controller. Existing 1.3 tests (`await store.watchRecent().first`) continue to work via the initial yield.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 1.4 status: `ready-for-dev` → `done` (the workflow's only sprint status update for this story; the in-progress hop is recorded in `loop-status.yaml`).

### Change Log

- **2026-08-15 — Story 1.4 implementation.** New files: `selected_date_provider.dart`, `week_strip.dart`, `test/state/selected_date_provider_test.dart`, `test/widgets/week_strip_test.dart`. `day_board_provider.dart` adds a date-aware `Provider.family` (`dayBoardForDateProvider`) alongside the existing no-arg `dayBoardProvider` (Story 1.3 backward compat preserved). `day_board_screen.dart` reads `selectedDateProvider` and renders `WeekStrip` below the plate stack; the title adapts to the selected day. `fake_encrypted_store.dart` is reworked to a broadcast-controller-backed `async*` so `seed()` and `recordPlate()` re-emit — the previous static `Stream.value(...)` did not re-emit, which the review flagged for 1.4. AD-1 grep test remains green; 33 client tests pass on the local Docker image (was 21 in Story 1.3).
