# AI Nutrition Coach — accessibility floor (Story 5.4 / NFR-7 / NFR-8 / UX-DR-12 / UX-DR-13)

The accessibility floor is verified across every shipped surface.
The floor is part of the named-reviewer QA gate (Story 5.3 / FR-15)
— a regression fails the build.

## The floor

| Invariant                                  | Where it lives                          |
| ------------------------------------------ | --------------------------------------- |
| Touch targets are ≥48px                    | `AppTouchTargets.min` (`apps/client/lib/theme/app_tokens.dart`) |
| Keyboard + screen-reader parity            | `Semantics` wrappers on every interactive widget (NFR-7) |
| Reduced-motion collapses to fade           | `AnimatedOpacity` + `MediaQuery.disableAnimations` (NFR-7) |
| Color is never the sole signal             | Static check rejects red-on-green status surfaces (NFR-7) |
| Dynamic type honoured at the largest setting | `MediaQuery.textScalerOf(context)` honoured (NFR-7) |
| Dark mode is a first-class skin            | `AppPalette.light` + `AppPalette.dark` + device theming (NFR-8) |
| Balance arc announces food groups          | `Semantics(label: ...)` per arc segment (NFR-7) |
| Status chips announce transitions          | `Semantics(label: 'Status: synced')` per flip (NFR-7 + AD-6) |
| A11y floor is part of the named-reviewer gate | `tools/check_accessibility_floor.dart` (Story 5.4 / FR-15) |

## Verification

```sh
melos run check:release-posture
```

The script chains the accessibility check alongside the existing
telemetry + release-posture + adults-only + under-13 checks. A
regression fails the build.

## Per-surface widget tests

The four major surfaces carry dedicated a11y tests that run as
part of `melos run test`:

- `apps/client/test/screens/day_board_screen_a11y_test.dart`
- `apps/client/test/screens/capture_sheet_a11y_test.dart`
- `apps/client/test/screens/your_data_screen_a11y_test.dart` (carried over from Story 4.1)
- `apps/client/test/screens/lock_screen_a11y_test.dart`

Each test asserts the floor on the surface — `Semantics`
wrappers, 48px hit targets, reduced-motion behaviour, dark-mode
theming, dynamic-type honouring.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 + Story 5.3 / FR-15).
- [`docs/adults-only.md`](./adults-only.md) — the FR-13 invariant
  (Story 5.1).
- [`docs/v2-managed-oversight.md`](./v2-managed-oversight.md) —
  the v2 managed-oversight seam (Story 5.2).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  + the gate frequency.
