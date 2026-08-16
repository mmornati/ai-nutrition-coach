---
title: 'Story 5.4 — Accessibility floor enforced across all surfaces'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: 'a738dfc'
context:
  - _bmad-output/implementation-artifacts/epic-5-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NFR-7 + NFR-8 + UX-DR-13 require the full a11y floor verified across every surface — touch targets are ≥48px, keyboard + screen-reader parity holds (balance arc announces food groups; status chips announce transitions), reduced-motion collapses to fade, color is never the sole signal, dynamic type is honoured at the largest setting. The Epic 1-4 surfaces ship with `Semantics` wrappers + the `AppTouchTargets.min` token, but the invariant is currently pinned only by individual widget tests — there is no single check that walks every interactive widget and asserts the floor. A future PR that drops a `Semantics` wrapper or shrinks a touch target could pass `melos run test` while shipping a regression.

**Approach:** Three artifacts. (1) A static check `tools/check_accessibility_floor.dart` that walks `apps/client/lib/widgets/` + `apps/client/lib/screens/` and asserts every interactive widget (any `GestureDetector`, `InkWell`, `OutlinedButton`, `TextButton`, `ElevatedButton`, `IconButton`, or `MaterialPageRoute`) has a `Semantics` wrapper (or inherits one from a parent) + a `minHeight: AppTouchTargets.min` constraint where the widget is the primary hit target. (2) Per-surface widget tests for the four major surfaces (`day_board_screen_test.dart`, `capture_sheet_test.dart`, `your_data_screen_test.dart`, `lock_screen_test.dart`) that assert the 48px floor + the `Semantics` announcement. (3) A `docs/accessibility.md` page that documents the a11y floor (NFR-7 / NFR-8 / UX-DR-13) and the verification affordance.

## Boundaries & Constraints

**Always:**
- NFR-7: touch targets are ≥48px; keyboard + screen-reader parity holds (balance arc announces food groups; status chips announce transitions); reduced-motion collapses to fade; color is never the sole signal; dynamic type is honoured at the largest setting.
- NFR-8 / UX-DR-12: dark mode is a first-class skin that follows device theming and respects reduce-motion on every surface.
- UX-DR-13: the accessibility floor is part of the named-reviewer QA gate. A regression fails the build.
- Conventions: the static check is part of `melos run check:release-posture` (Story 4.6 carries the script; Story 5.4 extends it).
- The check is conservative — it asserts the floor where the widget is the primary hit target; it does not assert `Semantics` on every leaf widget (that would over-constrain the codebase).

**Ask First:**
- Whether the check walks `apps/client/lib/widgets/` + `apps/client/lib/screens/` or just `screens/` — the spec ships both (the surface-level check is the meaningful one; the widget-level check pins the patterns the screens compose).
- Whether the per-surface widget tests run on every PR or only on the surfaces that change — the spec ships them as part of `melos run test` so every PR exercises every surface.

**Never:**
- No sub-48px touch target. The check rejects any widget with `minHeight < AppTouchTargets.min` where the widget is the primary hit target.
- No `Semantics`-less interactive widget. The check rejects any `GestureDetector` / `InkWell` / button without a `Semantics` wrapper.
- No color-only signal. The check scans the palette for red-on-green / green-on-red patterns (the most common color-only signal) and asserts the pattern doesn't appear on a status surface.
- No new external dependency for the check. The check is a Dart script using the existing `dart:io` + `dart:convert` libraries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_FLOOR_ENFORCED | Every interactive widget has a `Semantics` wrapper + a 48px hit target | The static check is green; the per-surface widget tests pass | N/A |
| SUB_48PX_HIT_TARGET | A future PR shrinks a touch target to 44px | The static check fails with a single calm line; CI blocks the PR | typed |
| SEMANTICS_MISSING | A future PR adds a `GestureDetector` without a `Semantics` wrapper | The static check fails with a single calm line; CI blocks the PR | typed |
| COLOR_ONLY_SIGNAL | A future PR uses red-on-green for a status surface | The static check fails with a single calm line; CI blocks the PR | typed |
| REDUCED_MOTION | The user has reduced-motion enabled | The chip flip collapses to a fade; the `AnimatedOpacity` skips the transition | behaviour test |
| DARK_MODE | The device is in dark mode | The UI follows the device theming; no light-mode bleed-through | widget test |
| DYNAMIC_TYPE | The user has the largest dynamic type setting | The UI honours the largest setting without truncation | widget test |
| BALANCE_ARC_A11Y | The balance arc renders | The screen reader announces "vegetables and fruit present, protein present, starch present, dairy missing" by food groups, not by raw count | widget test |
| STATUS_CHIP_A11Y | The status chip flips state | The screen reader announces the transition (`· synced` on flip) | widget test |
| MELOS_GATE | The repo runs `melos run check:release-posture` | The new check runs alongside the existing checks; a regression fails the build | N/A |

</frozen-after-approval>

## Code Map

- `tools/check_accessibility_floor.dart` — new; the static check.
- `melos.yaml` — extend; the `check:release-posture` script chains the new check.
- `apps/client/test/screens/day_board_screen_a11y_test.dart` — new; pins the Day Board's a11y floor.
- `apps/client/test/screens/capture_sheet_a11y_test.dart` — new; pins the capture sheet's a11y floor.
- `apps/client/test/screens/your_data_screen_a11y_test.dart` — new; pins the Your data sub-screen's a11y floor.
- `apps/client/test/screens/lock_screen_a11y_test.dart` — new; pins the lock screen's a11y floor.
- `docs/accessibility.md` — new; the user-facing + contributor-facing explanation of the a11y floor.

## Tasks & Acceptance

**Execution:**
- [ ] `tools/check_accessibility_floor.dart` — the static check.
- [ ] `melos.yaml` — chain the check.
- [ ] `apps/client/test/screens/day_board_screen_a11y_test.dart` — Day Board a11y.
- [ ] `apps/client/test/screens/capture_sheet_a11y_test.dart` — capture sheet a11y.
- [ ] `apps/client/test/screens/your_data_screen_a11y_test.dart` — Your data a11y.
- [ ] `apps/client/test/screens/lock_screen_a11y_test.dart` — lock screen a11y.
- [ ] `docs/accessibility.md` — the user-facing explanation.

**Acceptance Criteria:**
- Given the NFR-7 invariant, when `melos run check:release-posture` runs, then every interactive widget has a `Semantics` wrapper + a 48px hit target where the widget is the primary hit target (NFR-7).
- Given the NFR-7 invariant, when the per-surface widget tests run, then the Day Board + capture sheet + Your data + lock screen all honour the a11y floor (NFR-7).
- Given the NFR-7 + UX-DR-13 invariant, when the balance arc renders, then the screen reader announces the food groups (NFR-7).
- Given the NFR-7 + AD-6 invariant, when the status chip flips state, then the screen reader announces the transition (NFR-7).
- Given the NFR-7 + UX-DR-13 invariant, when reduced-motion is enabled, then the chip flip collapses to a fade; no animation runs (NFR-7 + UX-DR-13).
- Given the NFR-8 / UX-DR-12 invariant, when the device is in dark mode, then the UI follows the device theming; no light-mode bleed-through (NFR-8 / UX-DR-12).
- Given the NFR-7 + UX-DR-13 invariant, when dynamic type is at the largest setting, then the UI honours the largest setting without truncation (NFR-7 + UX-DR-13).
- Given the UX-DR-13 invariant, when a regression breaks the floor, then `melos run check:release-posture` fails; CI blocks the PR (UX-DR-13).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:release-posture"` -- expected: the new check is green.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/screens/day_board_screen_a11y_test.dart test/screens/capture_sheet_a11y_test.dart test/screens/your_data_screen_a11y_test.dart test/screens/lock_screen_a11y_test.dart"` -- expected: all four a11y tests pass.

**Manual checks:**
- Confirm the static check rejects a sub-48px touch target if a future PR adds one.
- Confirm the balance arc announces food groups by name.
- Confirm the status chip announces the transition on flip.
- Confirm reduced-motion collapses the chip flip to a fade.

## Suggested Review Order

**The static check (NFR-7 + UX-DR-13)**
- `tools/check_accessibility_floor.dart` + the `melos run check:release-posture` chain.

**The per-surface widget tests (NFR-7 + NFR-8 + UX-DR-12)**
- The four `*_a11y_test.dart` files.

**The docs anchor (NFR-7 + NFR-8 + UX-DR-13)**
- `docs/accessibility.md`.

---

## Dev Agent Record

### Implementation Plan

To be filled by the dev agent.

### Completion Notes

To be filled by the dev agent.

### Debug Log

To be filled by the dev agent.

### File List

To be filled by the dev agent.

### Change Log

To be filled by the dev agent.

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items
