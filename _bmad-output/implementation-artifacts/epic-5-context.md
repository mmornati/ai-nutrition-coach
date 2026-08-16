# Epic 5 Context: Trust by default (adults-only & no dark patterns)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The v1 surface is strictly adults-only: no under-13 accounts, no biometric identification anywhere, no pressure mechanics. The no-pressure UX promise is enforceable through a named-reviewer QA gate (FR-15 / AD-7), not just intent. The managed-oversight concept (FR-14, v2) is a declared seam — phase-blocked pending COPPA/privacy-law review (PRD OQ-4) so the architecture doesn't preclude it while it remains out of v1. Every shipped surface honours the accessibility floor (NFR-7 / UX-DR-13).

## Stories

- Story 5.1: Adults-only, no under-13 accounts, no biometrics (FR-13)
- Story 5.2: Managed-oversight seam declared, COPPA-blocked (FR-14, v2 — seam only)
- Story 5.3: No-Dark-Patterns Standard as a named QA gate (FR-15 / NFR-3 / AD-7)
- Story 5.4: Accessibility floor enforced across all surfaces (NFR-7 / NFR-8 / UX-DR-12 / UX-DR-13)

## Requirements & Constraints

- FR-13: the v1 surface is strictly adults-only. No signup flow, no profile machinery, no under-13 account anywhere. No face or voice-print biometric is used — voice stays transcription-only (FR-3); plate photos are processed with no identity linkage; local inference (the v2 `local` AI rung) stays on-device.
- FR-14 (v2 seam): the managed-oversight concept is documented as a declared seam — read-only-from-guardian, framed as support not surveillance. No v1 implementation. Phase-blocked pending COPPA / privacy-law review (PRD OQ-4).
- FR-15 / NFR-3 / AD-7: a named reviewer owns the No-Dark-Patterns checklist pass against the banned-everywhere list — streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, resolve spinners. The gate runs in CI/review with a durable sign-off. Every user-facing coach string lives in the localization key store (`packages/integrations/lib/src/l10n/coach_strings.dart`) and is keyed — never interpolated, named NDP reviewer signs off.
- NFR-7: touch targets are ≥48px; keyboard + screen-reader parity holds (balance arc announces food groups; status chips announce transitions); reduced-motion collapses to fade; color is never the sole signal; dynamic type is honoured at the largest setting.
- NFR-8 / UX-DR-12: dark mode is a first-class skin that follows device theming and respects reduce-motion on every surface.
- UX-DR-13: the accessibility floor is part of the named-reviewer QA gate; a regression fails the build.
- AD-7: every user-facing coach string is keyed; the `en*` value in `coach_strings.dart` is the canonical, calm, non-judgmental copy; the named reviewer signs off the key store at every release tag.
- Conventions: typed results across all seams (Story 4.1-4.3 carries the pattern); no raw exceptions crossing ports; provider graph wiring at `ProviderScope` root in `apps/client/lib/main.dart`.

## Technical Decisions

- **Story 5.1 — adults-only, no biometrics.** The story is primarily verification + documentation, since the v1 codebase already ships no signup flow, no profile machinery, and no biometric code. We add three artifacts:
  1. A static check (`tools/check_adults_only.dart`) that walks `apps/` + `packages/` and asserts no `face_detection`, `voice_print`, `biometric_auth`, `FaceID`, `TouchID`, `LocalAuthentication`, or under-13 / age-gate code is reachable. The check is part of `melos run check:release-posture`.
  2. A `docs/adults-only.md` page that anchors the FR-13 invariant to the codebase (no signup flow, voice transcription-only, plate photos processed with no identity linkage).
  3. A `PrivacyGuard` value type + test in `apps/client/lib/widgets/` that asserts no widget references a biometric API. The guard is a developer-facing affordance — a `throw FlutterError` if a future PR introduces one. (Story 4.5 ships the same pattern with the no-telemetry guard; Story 5.1 ships the parallel.)
- **Story 5.2 — managed-oversight v2 seam.** The story is purely documentation + type-system declaration:
  1. A `ManagedOversightSeam` marker value type in `packages/domain_core/lib/src/value_types/` (declared-only — no implementation in v1).
  2. A `docs/v2-managed-oversight.md` page that documents the seam as read-only-from-guardian + support-not-surveillance + COPPA-phase-blocked.
  3. A static check (`tools/check_no_under_13_profiles.dart`) that asserts no `under13`, `childProfile`, `minorAccount`, `teenAccount`, or `parentAccount` reference ships in v1. The check is part of `melos run check:release-posture`.
- **Story 5.3 — No-Dark-Patterns named QA gate.** Story 4.6 already shipped the banned-everywhere list (`docs/no-dark-patterns-standard.md`) and the verification script (`tools/check_release_posture.dart`). Story 5.3 elevates the gate:
  1. The named-reviewer sign-off lands as a `REVIEWERS.md` file at the repo root with a single named reviewer (the project's lead maintainer) and a durable sign-off protocol.
  2. A `.github/CODEOWNERS` file pins the key store (`packages/integrations/lib/src/l10n/coach_strings.dart`) + the docs (`docs/`) to the named reviewer — every PR touching user-facing copy requires the named reviewer's approval.
  3. The CI workflow `.github/workflows/ndp-review.yml` runs the existing `melos run check:release-posture` + asserts the named reviewer is recorded in `REVIEWERS.md`.
- **Story 5.4 — accessibility floor.** The story is verification + a small set of accessibility tests:
  1. A widget test per major surface (`day_board_screen_test.dart`, `capture_sheet_test.dart`, `your_data_screen_test.dart`, `lock_screen_test.dart`) that asserts the 48px touch-target floor (`AppTouchTargets.min`) and the `Semantics` wrapping.
  2. A static check (`tools/check_accessibility_floor.dart`) that walks `apps/client/lib/widgets/` + `apps/client/lib/screens/` and asserts every interactive widget has a `Semantics` wrapper (or inherits one from a parent) + a `minHeight: AppTouchTargets.min` constraint.
  3. A `docs/accessibility.md` page that documents the floor (NFR-7 / NFR-8 / UX-DR-13) and the verification affordance.

## UX & Interaction Patterns

- **Story 5.1**: the user-facing surface stays exactly as Epic 1-4 ships — no signup, no profile, no age gate. The "adults-only" promise is anchored in the docs, not in the UI. The `PrivacyGuard` is a developer-facing affordance, never user-visible.
- **Story 5.2**: the v2 managed-oversight seam is documented in the docs, not exposed in the UI. The seam appears in the Settings → About sub-screen as a single calm line ("Family oversight is a v2 seam — not in v1") so the v1 surface doesn't imply the v2 feature exists.
- **Story 5.3**: the NDP standard lives in `docs/no-dark-patterns-standard.md` (Story 4.6) and the named reviewer is recorded in `REVIEWERS.md`. The UI never surfaces the gate — it runs in CI/review only.
- **Story 5.4**: every interactive widget honours the accessibility floor. The Day Board's plates, the capture sheet, the lock screen, the Your data sub-screen, the Your AI sub-screen, and the Settings rows all carry the floor. Reduced-motion collapses the chip flip to a fade; dark mode follows the device theming.

## Cross-Story Dependencies

- Story 5.1 + Story 5.2 share the `tools/check_*.dart` pattern — both are static + behavioural checks that run as part of `melos run check:release-posture`.
- Story 5.3 builds on Story 4.6 (`docs/no-dark-patterns-standard.md` + `tools/check_release_posture.dart`). The named-reviewer gate is the elevation of the existing gate, not a replacement.
- Story 5.4 builds on the existing `AppTouchTargets` token (`apps/client/lib/theme/app_tokens.dart`) and the existing `Semantics` wrappers. The story adds verification, not new widgets.
- Stories 5.1 + 5.2 + 5.3 + 5.4 all add to `melos run check:release-posture` so the gate is part of the standard test suite. A regression fails the build.
- Epic 5 does not touch the AI rung (Epic 3), the encrypted store (Story 4.1), the exporter (Story 4.2), the sync queue (Story 4.3), the self-host (Story 4.4), or the telemetry gate (Story 4.5). The four stories are verification + documentation + named-reviewer gate — they sit on top of the Epic 1-4 surface without changing it.
