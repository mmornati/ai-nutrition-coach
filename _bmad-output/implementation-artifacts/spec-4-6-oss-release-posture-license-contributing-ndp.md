---
title: 'Story 4.6 — OSS release posture — LICENSE, CONTRIBUTING, No-Dark-Patterns Standard'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: '0a47a15'
context:
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-12 requires the repo to ship with a permissive license (MIT or Apache), a `CONTRIBUTING.md` that documents the build / test / smoke commands, and a published No-Dark-Patterns Standard at tag time. The v1 repo currently has none of these. The No-Dark-Patterns Standard is the QA gate the named reviewer (FR-15) signs off against every release; without it, the no-pressure UX promise is aspirational, not provable. The standard lives in `docs/no-dark-patterns-standard.md`; the release checklist pins it; the gate runs in CI.

**Approach:** Add the three artifacts: (1) `LICENSE` (MIT, with the OpenPlate copyright year), (2) `CONTRIBUTING.md` (build / test / smoke commands, the no-telemetry invariant, the FR-15 reviewer gate, the contribution expectations), (3) `docs/no-dark-patterns-standard.md` (the banned-everywhere list — streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, resolve spinners — with the named reviewer, the gate frequency, and the durable sign-off). Add a release checklist (`docs/release-checklist.md`) that pins the three artifacts at tag time. Add a CI check (`.github/workflows/release-gate.yml`) that asserts the three files are present at every PR; the gate is part of the standard suite.

## Boundaries & Constraints

**Always:**
- FR-12: LICENSE (MIT), CONTRIBUTING, and the No-Dark-Patterns Standard exist at tag time. The release checklist pins the three; the CI gate asserts the three are present at every PR.
- FR-15: the No-Dark-Patterns Standard is a QA checklist gate. A named reviewer owns the pass; the durable sign-off is part of the release artefact.
- AD-7: every user-facing coach string lives in the localization key store. The No-Dark-Patterns Standard cross-references the key store as the surface where the gate is enforced.
- NFR3: the NDP tone review happens in code review. The standard enumerates the banned-everywhere list; the gate is a checklist the reviewer ticks.
- Conventions: the LICENSE is MIT (permissive, copyleft-free). The CONTRIBUTING is plain Markdown; no GitHub-specific extensions. The NDP standard is a single document, not a folder of files.
- AD-2: the release posture is the same on every target — one responsive codebase, one release artefact.

**Ask First:**
- Whether the LICENSE is MIT or Apache 2.0 — the spec ships MIT (the brief's `[b2]` suggests MIT; the standard practice for FOSS Flutter apps is MIT for permissive adoption).
- Whether the No-Dark-Patterns Standard is a single file or a folder — the spec ships the single file (`docs/no-dark-patterns-standard.md`); a folder invites drift and is harder to gate.

**Never:**
- No copyleft license. MIT only.
- No "we might add a paid tier later" copy in any of the three artifacts. The release posture is open-source; the no-pressure UX is the standard.
- No "we may collect anonymized usage data" copy. The no-telemetry invariant is anchored; the docs match the code.
- No `NOTICE` file (MIT does not require one). The license is the contract; the standard is the gate.
- No "the gate can be overridden" affordance. The CI gate is part of the standard suite; a regression fails the build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_RELEASE_GATE | A PR is opened | The CI workflow asserts `LICENSE`, `CONTRIBUTING.md`, and `docs/no-dark-patterns-standard.md` are present; the gate passes | N/A |
| MISSING_LICENSE | A PR deletes `LICENSE` | The CI gate fails with a single calm line \"release gate: LICENSE is missing — see FR-12\" | blocked |
| MISSING_CONTRIBUTING | A PR deletes `CONTRIBUTING.md` | The CI gate fails with a single calm line \"release gate: CONTRIBUTING.md is missing — see FR-12\" | blocked |
| MISSING_NDP_STANDARD | A PR deletes `docs/no-dark-patterns-standard.md` | The CI gate fails with a single calm line \"release gate: No-Dark-Patterns Standard is missing — see FR-12 / FR-15\" | blocked |
| NDP_TONE_REVIEW | A PR adds a new coach string | The PR description links the key-store addition; the named NDP reviewer signs off; the sign-off is recorded in the PR thread | process |
| RELEASE_TAG | A version is tagged | The release checklist (`docs/release-checklist.md`) is ticked; the three artifacts are at HEAD; the sign-off is recorded | N/A |
| AD7_CROSS_REFERENCE | The NDP standard cross-references the key store | The banned-everywhere list names the surface where the gate is enforced (the localization key store) | N/A |
| NO_TELEMETRY_CLAIM | The three artifacts | The NDP standard asserts no telemetry; the LICENSE does not; the CONTRIBUTING does; the cross-reference is consistent | doc review |
| FR15_NAMED_REVIEWER | The release gate | The standard names the reviewer; the durable sign-off is part of the release artefact | N/A |
| AD2_ONE_CODEBASE | The release posture | The artifacts apply to every target — one responsive codebase, one release | N/A |
| CI_GATE_RUNS_EVERY_PR | A PR is opened | The release-gate workflow runs alongside the test workflow; the gate is part of the standard suite | N/A |

</frozen-after-approval>

## Code Map

- `LICENSE` -- new; the MIT license text, copyright year 2026, OpenPlate contributors.
- `CONTRIBUTING.md` -- new; the contributor path. Documents: (1) how to build (Flutter 3.47.0, Dart ^3.13.0, melos 8.2.2), (2) how to test (`melos run test`), (3) how to smoke-test the self-host build (`melos run smoke:self-host`), (4) the no-telemetry invariant, (5) the FR-15 NDP reviewer gate, (6) the contribution expectations (one PR per change, no AI-generated copy without reviewer sign-off, no dark patterns anywhere).
- `docs/no-dark-patterns-standard.md` -- new; the No-Dark-Patterns Standard. Documents: (1) the banned-everywhere list — streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, resolve spinners; (2) the surface where the gate is enforced (the localization key store, `apps/client/lib/widgets/`, etc.); (3) the named reviewer (the project's NDP reviewer; the v1 placeholder is the project's lead maintainer), (4) the gate frequency (every PR that touches user-facing copy; every release tag), (5) the durable sign-off (the PR thread + the release artefact).
- `docs/release-checklist.md` -- new; the release checklist. Pins the three artifacts at tag time; records the named reviewer sign-off; records the build version.
- `.github/workflows/release-gate.yml` -- new; the CI release-gate workflow. Asserts `LICENSE`, `CONTRIBUTING.md`, and `docs/no-dark-patterns-standard.md` are present at every PR. The gate is part of the standard suite.
- `tools/check_release_posture.dart` -- new; a small Dart script that walks the repo and asserts the three artifacts are present + the NDP standard's banned-everywhere list is unchanged from the documented baseline. Run as part of `melos run test` (not as a CI-only gate — the developer can run it locally too).
- `melos.yaml` -- extend; add the `check:release-posture` script.
- `README.md` (root) -- new; the repo's entry point. Documents: the FR-9 / FR-10 / FR-11 / FR-12 invariants; the self-host quickstart (Story 4.4); the contributor path; the license; the standard.
- `docs/ai-tiers.md` -- extend; cross-reference the NDP standard.
- `docs/self-host.md` -- extend; cross-reference the NDP standard.

## Tasks & Acceptance

**Execution:**
- [ ] `LICENSE` -- MIT, copyright 2026, OpenPlate contributors.
- [ ] `CONTRIBUTING.md` -- build / test / smoke / NDP reviewer gate / contribution expectations.
- [ ] `docs/no-dark-patterns-standard.md` -- the banned-everywhere list + the named reviewer + the gate frequency + the durable sign-off.
- [ ] `docs/release-checklist.md` -- the release checklist.
- [ ] `.github/workflows/release-gate.yml` -- the CI release-gate workflow.
- [ ] `tools/check_release_posture.dart` -- the release-posture check script.
- [ ] `melos.yaml` -- `check:release-posture` script.
- [ ] `README.md` -- the repo entry point.
- [ ] `docs/ai-tiers.md` -- cross-reference the NDP standard.
- [ ] `docs/self-host.md` -- cross-reference the NDP standard.

**Acceptance Criteria:**
- Given the FR-12 invariant, when the release gate runs, then `LICENSE`, `CONTRIBUTING.md`, and `docs/no-dark-patterns-standard.md` are present at HEAD; the gate passes (FR-12).
- Given the FR-15 invariant, when the NDP standard is reviewed, then the banned-everywhere list is documented; the named reviewer is named; the gate frequency is documented; the durable sign-off is part of the release artefact (FR-15 / NFR3 / AD-7).
- Given the no-telemetry invariant, when the three artifacts are reviewed, then the no-telemetry claim is consistent across `LICENSE`, `CONTRIBUTING.md`, and the NDP standard; the cross-reference matches the code (FR-12 / NFR4).
- Given the AD-2 one-codebase invariant, when the release posture is reviewed, then the artifacts apply to every target — one responsive codebase, one release (AD-2).
- Given the CI gate, when a PR is opened, then the release-gate workflow runs alongside the test workflow; a regression fails the build (conventions).
- Given the `melos run check:release-posture` gate, when a developer runs it locally, then the three artifacts are present; the NDP standard's banned-everywhere list is unchanged from the documented baseline (conventions).

## Spec Change Log

## Verification

**Commands (Docker):**
- `bash -c 'test -f LICENSE'` -- expected: the MIT license is at HEAD.
- `bash -c 'test -f CONTRIBUTING.md'` -- expected: the contributor path is at HEAD.
- `bash -c 'test -f docs/no-dark-patterns-standard.md'` -- expected: the NDP standard is at HEAD.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:release-posture"` -- expected: the gate passes.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "dart run tools/check_release_posture.dart"` -- expected: the three artifacts are present; the NDP standard's banned-everywhere list is unchanged.

**Manual checks:**
- Confirm the MIT license text is at HEAD.
- Confirm the NDP standard enumerates the banned-everywhere list.
- Confirm the named reviewer is named in the standard.
- Confirm the CI gate runs alongside the test workflow.

## Suggested Review Order

**The three artifacts (FR-12)**
- The MIT license + the contributor path + the NDP standard.
  [`LICENSE`](../../LICENSE)
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
  [`no-dark-patterns-standard.md`](../../docs/no-dark-patterns-standard.md)

**The gate (FR-15)**
- The release checklist + the CI gate + the posture check script.
  [`release-checklist.md`](../../docs/release-checklist.md)
  [`release-gate.yml`](../../.github/workflows/release-gate.yml)
  [`check_release_posture.dart`](../../tools/check_release_posture.dart)

**The entry point**
- The repo's `README.md` + the cross-references in `ai-tiers.md` and `self-host.md`.
  [`README.md`](../../README.md)
  [`ai-tiers.md`](../../docs/ai-tiers.md)
  [`self-host.md`](../../docs/self-host.md)

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
