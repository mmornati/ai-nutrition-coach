---
title: 'Story 4.5 — Telemetry and privacy posture'
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

**Problem:** FR-12 promises \"no telemetry by default in any shipped build\" and FR-9 / NFR4 promise \"no data leaves my device without my explicit action.\" The trust narrative is a privacy-by-architecture claim, not a privacy-by-policy claim — but the only way to make the claim provable is to add a verification gate that asserts no network calls open unless the user has enabled a feature that requires them (BYOK rung, hosted-quota rung, optional sync). The current state: the `dio` adapter tree is the only place that opens a socket, and the only `dio` callers are the OFF/USDA catalog + the AI rung transport — both are user-enabled. We need a test that proves it.

**Approach:** Add a \"no telemetry by default\" test that pins the FR-12 invariant three ways: (1) a static check that the only `dio` / `http` / `WebSocket` users in the codebase are the catalog + the rung transport + the (optional) sync transport; (2) a runtime check that the production `main.dart` does not invoke any of those code paths at startup; (3) a docs check that the user-facing copy in `docs/ai-tiers.md` and `docs/self-host.md` matches the actual code (no overclaim). The Tip Jar's \"never interrupts\" guarantee is verified separately by the existing copy review; this story owns the no-network-by-default gate.

## Boundaries & Constraints

**Always:**
- FR-12: no telemetry is transmitted in any shipped build by default. The runtime test asserts the production `main.dart` does not invoke a network code path at startup.
- FR-9 / NFR4: no data leaves the device without the user's explicit action. The static check enumerates the network-capable code paths and asserts each is gated behind a user action.
- AD-7: copy in the docs matches reality. The "no telemetry" claim is in `docs/ai-tiers.md` and `docs/self-host.md`; the test pins both.
- FR-15 / UX-DR9: the Tip Jar is `Settings` only, never interrupts a task flow. The static check pins the absence of an in-flow Tip Jar affordance.
- Conventions: the test is a Dart unit test (the FR-12 invariant is asserted by the same harness the rest of the repo uses); no new test framework, no new dependency.
- The single sanctioned network code paths are: (a) the OFF/USDA catalog (Story 1.5/1.7) — user-initiated, on demand, never at startup; (b) the AI rung transport (Epic 3) — only when the user has selected a non-noOp rung, never on a fresh `RecordPlate`; (c) the sync transport (Epic 4.3) — only when the user has configured a self-host relay, v1's no-op adapter opens zero sockets.

**Ask First:**
- Whether the test is a Dart test in `packages/integrations/test/` (a single harness) or a repo-root `tool/` script that walks the source tree — the spec ships the Dart test; the project already has a test harness; no new build-time tooling.
- Whether the static check is a literal `grep` (no parser) or a Dart-based AST walk — the spec ships the literal `grep`; the cost is one false-positive risk (a comment containing `http`) and the benefit is zero new dependencies.

**Never:**
- No new network call in the test. The test is a static + behavioural assertion; it does not open a socket.
- No "telemetry opt-in" affordance in v1. The FR-12 invariant is "no telemetry ever ships in v1"; the gate is the test, not a settings toggle.
- No overclaim in the docs. The "no telemetry" copy is anchored to the actual code paths; the test pins both.
- No flip-flopping the gate. The test is part of `melos run test`; a regression fails the build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_NO_NETWORK_AT_STARTUP | The production `main.dart` runs | The `createStores` + the provider graph compiles; no `dio.get` / `http.get` / `WebSocket` is invoked at startup; the test asserts the absence | typed |
| STATIC_CHECK_NO_DIO_IN_PROVIDER_GRAPH | The provider graph is read | The only `dio`-using code is in the catalog adapter (Story 1.5/1.7), the AI rung transport (Epic 3), and the (optional) sync transport (Epic 4.3); the test asserts the list | grep test |
| STATIC_CHECK_NO_HTTP_IN_DOMAIN_CORE | The `domain_core` source is read | The grep test in `domain_core_test.dart` already bans `package:dio` / `package:http`; this story re-asserts it | grep test |
| NO_TELEMETRY_ON_RUNG_DEFAULT | The default rung is `noOp` | No network call is opened when a plate is logged; the test asserts the absence | behavioural test |
| DOCS_MATCH_REALITY | The docs reference FR-12 / FR-9 / NFR4 | The "no telemetry" copy in `docs/ai-tiers.md` and `docs/self-host.md` matches the actual code paths; the test pins both | grep test |
| TIP_JAR_NEVER_INTERRUPTS | The Tip Jar is `Settings` only | The static check pins the absence of an in-flow Tip Jar affordance; the FR-15 / UX-DR9 invariant is anchored | grep test |
| BYOK_USER_ENABLED_NETWORK | The user enables the BYOK rung | The user has explicitly opted into a network path; the test pins that the only such paths are the catalog + the rung transport + the (optional) sync transport | grep test |
| OPTIONAL_SYNC_USER_ENABLED_NETWORK | The user configures a self-host relay | The sync transport is the only network path; the no-op adapter is the v1 default (zero sockets) | grep test |
| MELOS_TEST_GATE | The repo runs `melos run test` | The new test runs alongside the existing suite; a regression fails the build | N/A |
| NO_NEW_DEPENDENCY | The story | No new package in `pubspec.yaml`; the test is a Dart unit test using the existing `test` package | N/A |

</frozen-after-approval>

## Code Map

- `packages/integrations/test/no_telemetry_test.dart` -- new; pins the FR-12 / FR-9 / NFR4 invariants. Three checks: (1) the static `grep` for `dio` / `http` / `WebSocket` is restricted to the catalog + rung transport + sync transport; (2) the runtime check that `main.dart` does not invoke a network path at startup; (3) the docs check that the user-facing copy in `docs/ai-tiers.md` and `docs/self-host.md` matches the actual code.
- `apps/client/test/no_telemetry_at_startup_test.dart` -- new; a widget test that boots the production `main.dart`'s provider graph and asserts no network code path is invoked.
- `tools/check_telemetry_claims.dart` -- new; a small Dart script that walks the docs and asserts the "no telemetry" copy is anchored to the actual code paths. Run as part of `melos run test` (not as a CI-only gate — the developer can run it locally too).
- `melos.yaml` -- extend; add the `check:telemetry` script that runs the docs check + the test.
- `docs/ai-tiers.md` -- extend; the "no telemetry" copy is anchored to the actual code paths (no overclaim).
- `docs/self-host.md` -- extend; the "no telemetry" copy is anchored to the actual code paths (no overclaim).
- `docs/telemetry-posture.md` -- new; the user-facing explanation of the privacy posture: what is on by default, what is user-enabled, what is not in v1. Anchored to the code paths.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/integrations/test/no_telemetry_test.dart` -- pins the FR-12 / FR-9 / NFR4 invariants.
- [ ] `apps/client/test/no_telemetry_at_startup_test.dart` -- widget test that boots `main.dart`'s provider graph and asserts no network code path.
- [ ] `tools/check_telemetry_claims.dart` -- docs check; walks `docs/` and asserts the copy is anchored.
- [ ] `melos.yaml` -- `check:telemetry` script.
- [ ] `docs/ai-tiers.md` -- "no telemetry" copy anchored to the code.
- [ ] `docs/self-host.md` -- "no telemetry" copy anchored to the code.
- [ ] `docs/telemetry-posture.md` -- the user-facing privacy posture.

**Acceptance Criteria:**
- Given the FR-12 invariant, when the test runs, then no `dio` / `http` / `WebSocket` is invoked at startup in the production `main.dart`; the only network paths are user-enabled (catalog, AI rung transport, sync transport) (FR-12 / FR-9 / NFR4).
- Given the docs check, when `melos run check:telemetry` runs, then the "no telemetry" copy in `docs/ai-tiers.md` and `docs/self-host.md` matches the actual code paths; the user-facing privacy posture is anchored (AD-7 / NFR4).
- Given the Tip Jar guarantee, when the test runs, then the static check pins the absence of an in-flow Tip Jar affordance; the FR-15 / UX-DR9 invariant holds (FR-15 / UX-DR9).
- Given the BYOK + sync user-enabled paths, when the user explicitly enables a network path, then the only such paths are the catalog + the AI rung transport + the (optional) sync transport; the test pins the list (FR-7 / FR-10 / FR-12).
- Given the `melos run test` gate, when a regression breaks the invariant, then the build fails; the test is part of the standard suite (conventions).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test test/no_telemetry_test.dart"` -- expected: the FR-12 invariants hold.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/no_telemetry_at_startup_test.dart"` -- expected: the production `main.dart` does not invoke a network path.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "dart run tools/check_telemetry_claims.dart"` -- expected: the docs copy matches the code.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "melos run check:telemetry"` -- expected: the gate passes.

**Manual checks:**
- Confirm the FR-12 invariant by greppign the production `main.dart` for `dio.get` / `http.get` / `WebSocket` (none should be present at startup).
- Confirm the docs copy in `docs/ai-tiers.md` and `docs/self-host.md` matches the actual code paths.
- Confirm the Tip Jar affordance is `Settings` only.

## Suggested Review Order

**The gate**
- The no-telemetry test + the docs check.
  [`no_telemetry_test.dart`](../../packages/integrations/test/no_telemetry_test.dart)
  [`no_telemetry_at_startup_test.dart`](../../apps/client/test/no_telemetry_at_startup_test.dart)
  [`check_telemetry_claims.dart`](../../tools/check_telemetry_claims.dart)

**Docs anchored to code**
- The user-facing privacy posture + the "no telemetry" copy.
  [`telemetry-posture.md`](../../docs/telemetry-posture.md)
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
