---
title: 'Story 5.3 — No-Dark-Patterns Standard as a named QA gate'
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

**Problem:** FR-15 requires the No-Dark-Patterns Standard to be enforced as a QA checklist gate in CI/review owned by a named reviewer — no-pressure UX is provable, not aspirational. Story 4.6 shipped the standard (`docs/no-dark-patterns-standard.md`) and the verification script (`tools/check_release_posture.dart`), but the named-reviewer ownership is currently a one-line claim inside the standard document — not a durable artefact. A future PR can pass `melos run check:release-posture` without the named reviewer signing off; the gate runs the check but does not assert who owns the pass.

**Approach:** Three artifacts. (1) A `REVIEWERS.md` file at the repo root that records the named reviewer + the durable sign-off protocol + the gate frequency. (2) A `.github/CODEOWNERS` file that pins the key store (`packages/integrations/lib/src/l10n/coach_strings.dart`) + the docs (`docs/`) + the standard (`docs/no-dark-patterns-standard.md`) + the verification script (`tools/check_release_posture.dart`) + the NDP CI workflow (`.github/workflows/ndp-review.yml`) to the named reviewer — every PR touching user-facing copy requires the named reviewer's GitHub approval. (3) A new CI workflow `.github/workflows/ndp-review.yml` that runs `melos run check:release-posture` + asserts the named reviewer is recorded in `REVIEWERS.md` + asserts the `CODEOWNERS` file pins the right paths.

## Boundaries & Constraints

**Always:**
- FR-15 / NFR-3 / AD-7: a named reviewer owns the No-Dark-Patterns checklist pass against the banned-everywhere list. The reviewer is durable — recorded in `REVIEWERS.md` + pinned in `CODEOWNERS`.
- AD-7: every user-facing coach string lives in `coach_strings.dart` and is keyed. The `CODEOWNERS` pins the file so a PR that adds a new key requires the named reviewer's approval.
- Conventions: the gate runs in CI/review with a durable sign-off. The PR thread is the human sign-off; the release artefact is the durable record.
- NFR-3: the NDP tone review happens in code review. The named reviewer signs off every PR that touches user-facing copy.

**Ask First:**
- Whether the named reviewer is a single person or a small rotating panel — the spec ships a single person (the project's lead maintainer); a rotating panel is the v1.1 follow-up.
- Whether `CODEOWNERS` pins the named reviewer by GitHub handle or by team — the spec ships the handle (the simplest shape that maps to a single approval gate).

**Never:**
- No celebratory pop-ups, no countdown, no streak, no badge, no red-guilt state, no push-notification re-engagement. The ban list from `docs/no-dark-patterns-standard.md` is non-negotiable.
- No "Don't show again" easter egg as a coercion pattern. The check rejects any `dontShowAgain` / `doNotShowAgain` field in user-facing code.
- No override of the gate. The gate is part of the standard suite; a regression fails the build.
- No new external dependency for the review surface. `REVIEWERS.md` is plain Markdown; `.github/CODEOWNERS` is the GitHub-native format.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_NAMED_REVIEWER_RECORDED | `REVIEWERS.md` exists at HEAD with a single named reviewer | The CI workflow is green; the CODEOWNERS file pins the right paths | N/A |
| NAMED_REVIEWER_MISSING | A future PR deletes the reviewer line | The CI workflow fails with a single calm line; the named-reviewer gate is broken | typed |
| CODEOWNERS_MISSING_PATH | A future PR deletes a path from CODEOWNERS | The CI workflow fails; the path is no longer pinned to the named reviewer | typed |
| NDP_TONE_REVIEW | A PR adds a new coach string | The `CODEOWNERS` requires the named reviewer's approval before merge | process |
| DONT_SHOW_AGAIN_REJECTED | A future PR adds a `dontShowAgain` field | The static check (Story 4.6 / 5.1) rejects it; CI blocks the PR | typed |
| RELEASE_TAG | A version is tagged | The CI workflow re-runs the gate; the release checklist (Story 4.6) records the named-reviewer sign-off | N/A |
| CI_GATE_RUNS_EVERY_PR | A PR is opened | The `ndp-review.yml` workflow runs alongside the `release-gate.yml` workflow; both must be green | N/A |

</frozen-after-approval>

## Code Map

- `REVIEWERS.md` — new; records the named reviewer + the gate frequency + the sign-off protocol.
- `.github/CODEOWNERS` — new; pins the key store + the docs + the standard + the verification script + the NDP CI workflow to the named reviewer.
- `.github/workflows/ndp-review.yml` — new; runs `melos run check:release-posture` + asserts the named reviewer is recorded in `REVIEWERS.md` + asserts the `CODEOWNERS` file pins the right paths.
- `docs/no-dark-patterns-standard.md` — extend; cross-reference `REVIEWERS.md` and `.github/CODEOWNERS`.
- `docs/release-checklist.md` — extend; add the named-reviewer sign-off to Gate C.
- `CONTRIBUTING.md` — extend; the named-reviewer sign-off lives here.

## Tasks & Acceptance

**Execution:**
- [ ] `REVIEWERS.md` — the named reviewer + the gate frequency + the sign-off protocol.
- [ ] `.github/CODEOWNERS` — pin the right paths.
- [ ] `.github/workflows/ndp-review.yml` — the CI gate.
- [ ] `docs/no-dark-patterns-standard.md` — cross-reference.
- [ ] `docs/release-checklist.md` — add the named-reviewer sign-off to Gate C.
- [ ] `CONTRIBUTING.md` — the named-reviewer sign-off lives here.

**Acceptance Criteria:**
- Given the FR-15 invariant, when `REVIEWERS.md` exists at HEAD, then a single named reviewer is recorded; the gate frequency is documented; the sign-off protocol is plain (FR-15 / NFR-3 / AD-7).
- Given the FR-15 invariant, when `.github/CODEOWNERS` is at HEAD, then the key store + the docs + the standard + the verification script are pinned to the named reviewer; every PR touching user-facing copy requires the named reviewer's approval (FR-15 / AD-7).
- Given the FR-15 invariant, when `.github/workflows/ndp-review.yml` runs on a PR, then `melos run check:release-posture` is green + the named reviewer is recorded + the CODEOWNERS pins the right paths (FR-15).
- Given the FR-15 invariant, when the release checklist runs, then the named-reviewer sign-off is recorded for Gate C (FR-15).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:release-posture"` -- expected: the named-reviewer check is green.
- `cat REVIEWERS.md` -- expected: the named reviewer is documented.
- `cat .github/CODEOWNERS` -- expected: the right paths are pinned.

**Manual checks:**
- Confirm the `CODEOWNERS` file pins the named reviewer's GitHub handle.
- Confirm the CI workflow runs on every PR.
- Confirm the release checklist records the named-reviewer sign-off.

## Suggested Review Order

**The named reviewer + the sign-off protocol (FR-15)**
- `REVIEWERS.md` + `.github/CODEOWNERS` + the cross-references.

**The CI gate (FR-15)**
- `.github/workflows/ndp-review.yml` + the release-checklist Gate C.

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
