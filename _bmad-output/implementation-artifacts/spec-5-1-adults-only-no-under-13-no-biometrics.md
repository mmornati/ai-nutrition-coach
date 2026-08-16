---
title: 'Story 5.1 — Adults-only, no under-13 accounts, no biometrics'
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

**Problem:** FR-13 requires the v1 surface to be strictly adults-only — no under-13 accounts, no biometric identification anywhere. The v1 codebase already ships no signup flow, no profile machinery, and no biometric code (Epic 1-4 carry-over), but the invariant is currently pinned only by intent, not by a verification gate. Without a check, a future PR could quietly introduce a `local_auth` import or a `childProfile` reference and ship a regression that violates COPPA's 2025 amendments (PRD §4.6). We need a static check that asserts no biometric API + no under-13 machinery is reachable, and a developer-facing guard so a future PR that introduces one fails loudly at compile time.

**Approach:** Add three artifacts. (1) A static check `tools/check_adults_only.dart` that walks `apps/` + `packages/` and asserts no `face_detection`, `voice_print`, `biometric_auth`, `FaceID`, `TouchID`, `LocalAuthentication`, `face_recognition`, `speaker_recognition`, `childProfile`, `under13`, `minorAccount`, `teenAccount`, `ageGate`, or `birthDate` reference ships. (2) A `docs/adults-only.md` page that anchors the FR-13 invariant to the codebase. (3) A `PrivacyGuard` value type + test in `apps/client/lib/widgets/` that exposes a `PrivacyGuard.assertAdultsOnly()` static method — a developer-facing affordance that asserts no biometric code is reachable and throws `FlutterError` if a future PR adds one. The check is part of `melos run check:release-posture`; the guard is a compile-time safety net for widget code.

## Boundaries & Constraints

**Always:**
- FR-13: v1 is strictly adults-only. No child accounts, no biometric identification, no profile machinery. The static check + the `PrivacyGuard` together pin the invariant.
- FR-3 + FR-13: voice stays transcription-only. The `VoiceTranscriber` port (Epic 1) is transcription-only; the check rejects any `voice_print` / `speaker_recognition` reference.
- AD-7: every user-facing coach string is keyed; never interpolated. The `PrivacyGuard` is a developer-facing affordance, never user-visible.
- NFR-3: the NDP tone review happens in code review. The `PrivacyGuard` and the static check are the enforcement surfaces.
- Conventions: typed results across all seams (Story 4.1-4.3 pattern); no raw exceptions crossing ports; provider graph wiring at `ProviderScope` root.
- The check walks every `.dart` file under `apps/`, `packages/`, and `tools/`. The check is part of `melos run check:release-posture` (Story 4.6 carries the script; Story 5.1 extends it).

**Ask First:**
- Whether the `PrivacyGuard` is a class with a static method, a free function, or a lint rule — the spec ships the class with a static method (the simplest shape that fits the existing pattern; a lint rule is the v1.1 follow-up).
- Whether the static check is a single regex or a Dart AST walk — the spec ships the literal `grep` (the cost is one false-positive risk; the benefit is zero new dependencies).

**Never:**
- No biometric API import. The check rejects `package:local_auth`, `package:face_recognition`, `package:speech_recognition`, or any equivalent. The mobile target ships no biometric prompt.
- No under-13 profile machinery. No `childProfile`, `under13`, `minorAccount`, `teenAccount`, `ageGate`, or `birthDate` field anywhere in v1. The check rejects all of them.
- No face / voice-print biometric. The check rejects `face_detection`, `voice_print`, `biometric_auth`, `FaceID`, `TouchID`, `LocalAuthentication`, `face_recognition`, `speaker_recognition`.
- No voice-print identification. Voice stays transcription-only (FR-3 + FR-13 carry-over from Epic 1).
- No plate-photo-to-identity linkage. The `AiRung` port takes raw photo bytes and never queries a face-detection API; the check rejects any `faceApi` / `rekognition` reference.
- No new external dependency for the guard. The `PrivacyGuard` is a pure-Dart class.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_NO_BIOMETRIC | The codebase has no biometric import | The static check is green; `PrivacyGuard.assertAdultsOnly()` returns silently | N/A |
| BIOMETRIC_IMPORT_REJECTED | A future PR adds `import 'package:local_auth/local_auth.dart'` | The static check fails with a single calm line; CI blocks the PR | typed |
| UNDER_13_REFERENCE_REJECTED | A future PR adds a `childProfile` field | The static check fails with a single calm line; CI blocks the PR | typed |
| PRIVACY_GUARD_CALLED_AT_STARTUP | `apps/client/lib/main.dart` calls `PrivacyGuard.assertAdultsOnly()` before `runApp` | The guard returns silently; if a future PR added a biometric import, the guard throws `FlutterError` at startup | typed |
| DOCS_ANCHOR | The `docs/adults-only.md` page exists at HEAD | The static check (`melos run check:release-posture`) asserts the doc is present | grep test |
| NO_FACE_DETECTION_IN_AI_RUNG | The `AiRung` port's adapter chain | No face-detection API is referenced; the check rejects any `faceApi` / `rekognition` reference | grep test |
| NO_VOICE_PRINT_IN_TRANSCRIBER | The `VoiceTranscriber` port | No voice-print API is referenced; the check rejects any `voice_print` / `speaker_recognition` reference | grep test |
| MELOS_GATE | The repo runs `melos run check:release-posture` | The new check runs alongside the existing checks; a regression fails the build | N/A |

</frozen-after-approval>

## Code Map

- `tools/check_adults_only.dart` — new; the static check; walks `apps/`, `packages/`, `tools/` and rejects the banned biometrics + under-13 references.
- `melos.yaml` — extend; the `check:release-posture` script chains the new check.
- `apps/client/lib/widgets/privacy_guard.dart` — new; `PrivacyGuard.assertAdultsOnly()` static method + tests.
- `apps/client/test/widgets/privacy_guard_test.dart` — new; pins the guard's compile-time + runtime assertions.
- `apps/client/lib/main.dart` — extend; call `PrivacyGuard.assertAdultsOnly()` before `runApp`.
- `docs/adults-only.md` — new; the user-facing + contributor-facing explanation of the FR-13 invariant.
- `docs/your-data.md` — extend; cross-reference `docs/adults-only.md`.

## Tasks & Acceptance

**Execution:**
- [ ] `tools/check_adults_only.dart` — the static check; rejects the banned list.
- [ ] `melos.yaml` — chain the check into `check:release-posture`.
- [ ] `apps/client/lib/widgets/privacy_guard.dart` — the developer-facing guard.
- [ ] `apps/client/test/widgets/privacy_guard_test.dart` — pins the guard.
- [ ] `apps/client/lib/main.dart` — call the guard at startup.
- [ ] `docs/adults-only.md` — the user-facing explanation.
- [ ] `docs/your-data.md` — cross-reference.

**Acceptance Criteria:**
- Given the FR-13 invariant, when `melos run check:release-posture` runs, then no biometric import + no under-13 reference is reachable; the check is green (FR-13).
- Given the `PrivacyGuard`, when `apps/client/lib/main.dart` boots, then `PrivacyGuard.assertAdultsOnly()` returns silently; a future PR that adds a biometric import causes the guard to throw `FlutterError` at startup (FR-13 / NFR-4).
- Given the FR-3 + FR-13 invariant, when the `VoiceTranscriber` adapter tree is read, then no voice-print API is referenced; the check rejects any `voice_print` / `speaker_recognition` reference (FR-3 + FR-13).
- Given the FR-13 + NFR-4 invariant, when the `AiRung` port's adapter chain is read, then no face-detection API is referenced; the check rejects any `faceApi` / `rekognition` reference (FR-13 + NFR-4).
- Given the docs anchor, when `docs/adults-only.md` is at HEAD, then the FR-13 promise is documented as plain copy — no signup, no profile, no age gate, no biometric (FR-13 / NFR-3).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:release-posture"` -- expected: the new check is green.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/widgets/privacy_guard_test.dart"` -- expected: the guard's tests pass.

**Manual checks:**
- Confirm the static check rejects `package:local_auth` if a future PR adds it.
- Confirm the `PrivacyGuard` is called at startup in `main.dart`.
- Confirm `docs/adults-only.md` exists at HEAD.

## Suggested Review Order

**The static check (FR-13 / NFR-4)**
- `tools/check_adults_only.dart` + the `melos run check:release-posture` chain.

**The developer-facing guard**
- `apps/client/lib/widgets/privacy_guard.dart` + the `main.dart` call site + the test.

**The docs anchor (FR-13)**
- `docs/adults-only.md` + the cross-reference in `docs/your-data.md`.

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
