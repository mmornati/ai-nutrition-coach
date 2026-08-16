---
title: 'Story 5.2 — Managed-oversight seam declared, COPPA-blocked'
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

**Problem:** FR-14 declares the parent/guardian managed-oversight concept as a v2 seam — read-only-from-guardian, framed as support not surveillance. The PRD's OQ-4 phase-blocks the feature pending COPPA / privacy-law review: no v1 implementation, no teen / parent / child profile machinery ships in v1. The architecture must not preclude the v2 seam, but it must not pretend the v2 feature exists in v1. The reconcile-research flagged this as a `[NOTE FOR PM]` depth item — the v2 family / oversight must not silently vanish from the surface.

**Approach:** Add three artifacts. (1) A `ManagedOversightSeam` marker value type in `packages/domain_core/lib/src/value_types/` that declares the seam in the type system — no implementation, no surface, just a marker so the architecture documents the future intent. (2) A `docs/v2-managed-oversight.md` page that documents the seam as read-only-from-guardian + support-not-surveillance + COPPA-phase-blocked, with a single calm line for the Settings → About sub-screen that says "Family oversight is a v2 seam — not in v1" so the v1 surface doesn't imply the v2 feature exists. (3) A static check `tools/check_no_under_13_profiles.dart` that walks `apps/` + `packages/` and asserts no `under13`, `childProfile`, `minorAccount`, `teenAccount`, `parentAccount`, or `managedOversight` implementation code ships. The check is part of `melos run check:release-posture`.

## Boundaries & Constraints

**Always:**
- FR-14 (v2 seam only): the managed-oversight concept is documented as a declared seam — read-only-from-guardian, framed as support not surveillance. **No v1 implementation.**
- FR-13: no under-13 accounts anywhere. The static check rejects any `under13`, `childProfile`, `minorAccount`, `teenAccount`, `parentAccount`, `managedOversight` implementation. The `ManagedOversightSeam` marker is the only allowed reference — and only as a declaration, never as a behaviour.
- OQ-4 (PRD): phase-blocked pending COPPA / privacy-law review. The `docs/v2-managed-oversight.md` page anchors the phase-block; the seam is documented as "not in v1".
- AD-7: copy is keyed; the single line that surfaces in Settings → About lives in `coach_strings.dart`; named NDP reviewer signs off.
- NFR-3: the NDP tone review happens in code review. The seam is documented plainly — calm, non-judgmental, "not in v1" framing.
- Conventions: typed results across all seams; no raw exceptions crossing ports; provider graph wiring at `ProviderScope` root.

**Ask First:**
- Whether the `ManagedOversightSeam` is a marker class, a sealed class, or an enum — the spec ships the marker class (the simplest shape that documents the seam without implying behaviour).
- Whether the v2 notice is a single line on Settings → About, a single line on the Day Board header, or a `docs/` page only — the spec ships the Settings → About single line + the docs page (the UI line is the user-facing anchor; the docs page is the contributor-facing anchor).

**Never:**
- No v1 implementation of managed oversight. The seam is declared; it is not wired.
- No under-13 / teen / parent profile machinery. The static check rejects all of them.
- No "family" framing in v1 copy that implies the v2 feature exists. The Settings → About single line is the only user-facing anchor; copy stays "not in v1" — never "coming soon" (FR-15 ban list: no celebratory pop-ups, no countdown).
- No biometric identification on the v2 seam either. The FR-13 invariant extends to v2.
- No new external dependency for the seam. The marker is pure-Dart.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_SEAM_DECLARED | The codebase ships the `ManagedOversightSeam` marker + the docs page | The static check is green; the Settings → About sub-screen renders the v2 notice line | N/A |
| UNDER_13_PROFILE_REJECTED | A future PR adds a `childProfile` field | The static check fails with a single calm line; CI blocks the PR | typed |
| TEEN_PROFILE_REJECTED | A future PR adds a `teenAccount` field | The static check fails with a single calm line; CI blocks the PR | typed |
| PARENT_PROFILE_REJECTED | A future PR adds a `parentAccount` field | The static check fails with a single calm line; CI blocks the PR | typed |
| MANAGED_OVERSIGHT_IMPL_REJECTED | A future PR adds a `ManagedOversightService` class with behaviour | The static check fails on `ManagedOversightService` (the marker is `ManagedOversightSeam`; the service suffix implies behaviour) | typed |
| V2_NOTICE_COPY | The Settings → About sub-screen renders | A single calm line: "Family oversight is a v2 seam — not in v1"; copy is keyed in `coach_strings.dart` | N/A |
| DOCS_ANCHOR | The `docs/v2-managed-oversight.md` page exists at HEAD | The static check (`melos run check:release-posture`) asserts the doc is present | grep test |
| MELOS_GATE | The repo runs `melos run check:release-posture` | The new check runs alongside the existing checks; a regression fails the build | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/value_types/managed_oversight_seam.dart` — new; `class ManagedOversightSeam` marker; const constructor; redacted `toString`.
- `packages/domain_core/lib/domain_core.dart` — extend; barrel export for `managed_oversight_seam`.
- `packages/domain_core/test/managed_oversight_seam_test.dart` — new; pins the marker equality + the redacted `toString`.
- `packages/integrations/lib/src/l10n/coach_strings.dart` — extend; `ManagedOversightStrings` (1 entry: `v2Notice`) + `enManagedOversightStrings`; NDP reviewer sign-off.
- `apps/client/lib/screens/about_screen.dart` — new; Settings → About sub-screen; renders the v2 notice line + the footmark.
- `apps/client/test/screens/about_screen_test.dart` — new; pins the v2 notice copy.
- `tools/check_no_under_13_profiles.dart` — new; the static check; rejects the banned under-13 / teen / parent / child profile references.
- `melos.yaml` — extend; the `check:release-posture` script chains the new check.
- `docs/v2-managed-oversight.md` — new; the user-facing + contributor-facing explanation of the v2 seam.
- `docs/self-host.md` — extend; cross-reference `docs/v2-managed-oversight.md`.
- `docs/no-dark-patterns-standard.md` — extend; cross-reference `docs/v2-managed-oversight.md`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/value_types/managed_oversight_seam.dart` — the marker.
- [ ] `packages/domain_core/lib/domain_core.dart` — barrel export.
- [ ] `packages/domain_core/test/managed_oversight_seam_test.dart` — pin the marker.
- [ ] `packages/integrations/lib/src/l10n/coach_strings.dart` — `ManagedOversightStrings` + `enManagedOversightStrings`.
- [ ] `apps/client/lib/screens/about_screen.dart` — the About sub-screen.
- [ ] `apps/client/test/screens/about_screen_test.dart` — pin the v2 notice copy.
- [ ] `tools/check_no_under_13_profiles.dart` — the static check.
- [ ] `melos.yaml` — chain the check.
- [ ] `docs/v2-managed-oversight.md` — the user-facing explanation.
- [ ] `docs/self-host.md` — cross-reference.
- [ ] `docs/no-dark-patterns-standard.md` — cross-reference.

**Acceptance Criteria:**
- Given the FR-14 invariant, when `melos run check:release-posture` runs, then no under-13 / teen / parent / child profile implementation is reachable; the seam marker is the only allowed reference (FR-13 + FR-14).
- Given the FR-14 + OQ-4 invariant, when `docs/v2-managed-oversight.md` is at HEAD, then the seam is documented as read-only-from-guardian + support-not-surveillance + COPPA-phase-blocked (FR-14 + OQ-4).
- Given the AD-7 invariant, when the Settings → About sub-screen renders, then the single calm v2 notice line is keyed in `coach_strings.dart`; no string interpolation; named NDP reviewer signs off (AD-7).
- Given the FR-15 invariant, when the Settings → About sub-screen renders, then no countdown, no "coming soon", no celebratory pop-up appears; the copy is plain "not in v1" (FR-15).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:release-posture"` -- expected: the new check is green.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test test/managed_oversight_seam_test.dart"` -- expected: the marker tests pass.

**Manual checks:**
- Confirm the static check rejects `childProfile` if a future PR adds it.
- Confirm the Settings → About sub-screen renders the v2 notice line.
- Confirm `docs/v2-managed-oversight.md` exists at HEAD.

## Suggested Review Order

**The seam marker (FR-14)**
- `packages/domain_core/lib/src/value_types/managed_oversight_seam.dart` + the test + the barrel export.

**The static check (FR-13 + FR-14)**
- `tools/check_no_under_13_profiles.dart` + the `melos run check:release-posture` chain.

**The user-facing surface (AD-7 + FR-15)**
- `apps/client/lib/screens/about_screen.dart` + `coach_strings.dart` keyed copy.

**The docs anchor (FR-14 + OQ-4)**
- `docs/v2-managed-oversight.md` + cross-references.

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
