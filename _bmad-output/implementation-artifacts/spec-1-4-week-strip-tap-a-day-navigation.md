---
title: 'Story 1.4 — Week strip — tap-a-day navigation'
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
- [ ] `apps/client/lib/state/selected_date_provider.dart` -- `final selectedDateProvider = StateProvider<DateTime?>((_) => null)` -- holds the user's selected local date, `null` = today
- [ ] `apps/client/lib/state/day_board_provider.dart` -- accept a `DateTime? date` parameter (defaults to today); refactor bucket logic so it works for any local date; keep backward compat with 1.3's "today" call
- [ ] `apps/client/lib/widgets/week_strip.dart` -- 7 mini-dots arranged horizontally (today rightmost); sage fill when the day has ≥1 plate, neutral outline otherwise; mono whisper "no streaks · no countdowns · no guilt" beneath; tap updates `selectedDateProvider`; Semantics labels per dot
- [ ] `apps/client/lib/screens/day_board_screen.dart` -- read `selectedDateProvider`; pass it to `dayBoardProvider`; render `WeekStrip` below the plate stack (still above any future Coach whisper anchor)
- [ ] `apps/client/test/widgets/week_strip_test.dart` -- empty + partial + happy-path renderings; tap on a dot updates `selectedDateProvider` (verify via `ProviderContainer`)
- [ ] `apps/client/test/state/selected_date_provider_test.dart` -- setting a date re-emits the new value to a listener
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

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
