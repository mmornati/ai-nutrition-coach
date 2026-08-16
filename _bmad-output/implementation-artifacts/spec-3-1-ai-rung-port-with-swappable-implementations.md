---
title: 'Story 3.1 — AiRung port with swappable implementations'
type: 'feature'
created: '2026-08-16'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'e6708b2'
context:
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The v1 `AiRung` port (Story 1.8) ships with exactly one implementation (`NoopAiRung`) and three sealed result variants (`RecognizedPlate | NoMatch | RecognitionFailure`). To honour FR6 / FR7 / FR8 we need a single port behind which four implementations sit — `no-op`, `hosted-quota`, `byok`, `local` (v2 seam) — with exactly one active chosen by config, plus a fourth sealed result variant (`QuotaExhausted`) so Story 3.2 can return an honest, typed "out of quota" signal that the UI renders as the calm 3-way choice. Without the config plumbing and the new variant, Story 3.2 / 3.3 cannot ship without branching the core.

**Approach:** Add a `QuotaExhausted` variant to the existing `RecognitionResult` sealed hierarchy in `packages/domain_core` (carries a single `resetAt: DateTime?` so the UI can render the "wait for reset" path honestly). Add a typed `AiRungConfig` value + `AiRungKind` enum (`noOp | hostedQuota | byok | local`) in `packages/domain_core`. Add a `LocalAiRung` adapter in `packages/integrations` that throws `UnsupportedError` on `recognize` — the v2 seam declared in the type system. Add `HostedQuotaAiRung` / `ByokAiRung` adapter stubs that ship as part of Stories 3.2 / 3.3 (Story 3.1 declares their files so the provider graph compiles against all four kinds). Wire `aiRungConfigProvider` + `aiRungProvider` so `apps/client/lib/main.dart` selects the active rung by config; the existing `NoopAiRung` is the v1 default. Core behavior tests pass against `no-op` (FR-6 seam, UJ-4).

## Boundaries & Constraints

**Always:**
- AD-1: `AiRungConfig`, `AiRungKind`, and the new `QuotaExhausted` variant live in `packages/domain_core` — no Flutter, drift, dio, image_picker, mobile_scanner, flutter_secure_storage imports.
- AD-5: exactly one `AiRung` implementation is active at any time; selection is a build-time config value resolved once in `apps/client/lib/main.dart`; the core and the UI never branch on which rung is active — only on whether the port call returned a typed result.
- AD-5 / FR8: `LocalAiRung` is a declared v2 seam — it implements `AiRung` and throws `UnsupportedError` on `recognize`. The seam exists in the type system and provider wiring; it never crashes the core or the UI.
- FR6 / FR7 / FR8: four implementations exist behind the port — `no-op`, `hosted-quota`, `byok`, `local`. The three non-default implementations may ship as stubs (returning `RecognitionFailure('not yet implemented')`) in Story 3.1 and be filled in by Stories 3.2 / 3.3.
- FR13: rung plumbing carries no biometric identification. The `AiRung` port takes raw photo bytes (FR13 carries over from Story 1.8); config / rung metadata is never a fingerprint surface.
- NFR4: rung status (active kind, quota remaining, BYOK key present) is never logged or reflected in UI plaintext.
- AD-7: rung copy lives in the localization key store (AD-7 carries over); this story only owns the port, config, and adapter-shape plumbing — Story 3.2 / 3.3 own the rung copy.
- Conformance to the existing sealed result shape: the new `QuotaExhausted` variant sits alongside `RecognizedPlate | NoMatch | RecognitionFailure`; pattern-match call sites in the UI / Story 1.8 paths continue to compile.

**Ask First:**
- Whether `AiRungConfig` is a single record (`({AiRungKind kind})`) or a richer value that carries optional quota / key references — the spec ships the single-record version; Stories 3.2 / 3.3 may add optional fields behind the same type without breaking the seam.
- Whether `LocalAiRung` throws synchronously inside `recognize` or returns `Future.error` — the spec ships `async` + `throw UnsupportedError(...)` so the typed shape stays honest and the UI can surface a calm "not available in v1" message via `RecognitionFailure`-equivalent handling.

**Never:**
- No branching in the core on which rung is active. The only thing the core reads is the `AiRung` interface and the sealed `RecognitionResult`.
- No new external dependency; no new package import. `LocalAiRung` is a pure-Dart class.
- No biometric identification in the config or rung path.
- No string interpolation in widgets; no hardcoded rung label copy in `apps/client/lib` — Story 3.3 owns the Your AI surface copy.
- No quota bookkeeping in Story 3.1; that's Story 3.2. Story 3.1 only declares the result variant and the config shape.
- No telemetry, no logs that include photo bytes, no logs that include config / key material (NFR4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_NOOP_ACTIVE | Config selects `AiRungKind.noOp`; photo capture flows to `AiRung.recognize(bytes)` | `NoopAiRung.recognize` returns `RecognizedPlate(foods: [])` (existing behavior, Story 1.8) | N/A |
| HAPPY_PATH_HOSTED_QUOTA_STUB | Config selects `AiRungKind.hostedQuota`; Story 3.1 ships the adapter | `HostedQuotaAiRung.recognize` returns `RecognitionFailure('hosted-quota not yet wired (Story 3.2)')` | Typed result |
| HAPPY_PATH_BYOK_STUB | Config selects `AiRungKind.byok`; Story 3.1 ships the adapter | `ByokAiRung.recognize` returns `RecognitionFailure('byok not yet wired (Story 3.3)')` | Typed result |
| HAPPY_PATH_LOCAL_SEAM | Config selects `AiRungKind.local`; `LocalAiRung.recognize(bytes)` is called | Throws `UnsupportedError('local rung is a v2 seam — not implemented in v1')` | Caller catches via `try`/`catch` or pattern-matches the `Future` error; the UI renders a calm "not available" line |
| CONFIG_UNSET | Config is the `noOp` default | `aiRungProvider` resolves to `NoopAiRung()`; core behavior tests pass against `no-op` (FR-6 seam) | N/A |
| QUOTA_EXHAUSTED_VARIANT | (Story 3.2 will produce this) — Story 3.1 declares the variant | `QuotaExhausted(resetAt: DateTime?)` exists in the sealed hierarchy; carries an optional reset timestamp; equals/hashCode/toString follow the existing variant conventions | N/A |
| UI_PATTERN_MATCH | Any call site that exhaustively pattern-matches `RecognitionResult` | Must be updated to include the new `QuotaExhausted` variant; analyzer warns if the match is non-exhaustive | Compile-time guard |
| EXISTING_TESTS_GREEN | `packages/domain_core` test suite | All existing tests pass; `NoopAiRung` shape unchanged; `AiRung` port signature unchanged (only the sealed result hierarchy grew) | N/A |
| PROVIDER_OVERRIDE | `apps/client/lib/main.dart` overrides `aiRungConfigProvider` with `const AiRungConfig(kind: AiRungKind.noOp)` | `aiRungProvider` reads the config and returns the matching adapter; tests can substitute any of the four | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/value_types/ai_rung_kind.dart` -- new; `enum AiRungKind { noOp, hostedQuota, byok, local }` -- the four rungs behind the port
- `packages/domain_core/lib/src/value_types/ai_rung_config.dart` -- new; `AiRungConfig({required AiRungKind kind})` -- the build-time config value resolved once at app start
- `packages/domain_core/lib/src/results/recognition_failure.dart` -- extend the `RecognitionResult` sealed hierarchy with `QuotaExhausted` (carries `resetAt: DateTime?`); the existing variants and the `NoopAiRung` shape are unchanged
- `packages/domain_core/lib/src/ports/ai_rung.dart` -- docstring update noting the four rungs + the new result variant; port signature unchanged
- `packages/domain_core/lib/domain_core.dart` -- barrel update exporting `ai_rung_kind`, `ai_rung_config`, and the updated result hierarchy
- `packages/domain_core/test/ai_rung_config_test.dart` -- new; pins `AiRungConfig` equality by `kind`, the `AiRungKind` enum surface, and the `QuotaExhausted` variant shape
- `packages/domain_core/test/recognition_result_test.dart` -- new; pins the sealed result hierarchy exhaustiveness (`RecognizedPlate | NoMatch | RecognitionFailure | QuotaExhausted`)
- `packages/integrations/lib/src/ai/local_ai_rung.dart` -- new; `LocalAiRung` implementing `AiRung`, throws `UnsupportedError` on `recognize` -- the declared v2 seam
- `packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart` -- new; `HostedQuotaAiRung` stub returning `RecognitionFailure('hosted-quota not yet wired (Story 3.2)')`; full implementation lands in Story 3.2
- `packages/integrations/lib/src/ai/byok_ai_rung.dart` -- new; `ByokAiRung` stub returning `RecognitionFailure('byok not yet wired (Story 3.3)')`; full implementation lands in Story 3.3
- `packages/integrations/lib/integrations.dart` -- barrel update exporting the three new rung adapters
- `packages/integrations/test/ai_rung_adapters_test.dart` -- new; pins that all four rungs implement `AiRung`; `LocalAiRung` throws; the two stubs return the documented `RecognitionFailure`
- `apps/client/lib/state/ai_rung_provider.dart` -- new; `aiRungConfigProvider` (`Provider<AiRungConfig>` defaulting to `AiRungConfig(kind: AiRungKind.noOp)`) + `aiRungProvider` (`Provider<AiRung>` that reads the config and returns the matching adapter)
- `apps/client/lib/main.dart` -- override `aiRungConfigProvider` with `const AiRungConfig(kind: AiRungKind.noOp)` so Stories 3.2 / 3.3 can flip the active rung without touching the screen
- `apps/client/test/state/ai_rung_provider_test.dart` -- new; pins the config-driven adapter selection; the four-kinds test; the `LocalAiRung` throws-on-use test

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/value_types/ai_rung_kind.dart` -- `enum AiRungKind { noOp, hostedQuota, byok, local }` with `String get label` returning the canonical rung name; the v2 seam is a first-class enum value, not a sentinel
- [ ] `packages/domain_core/lib/src/value_types/ai_rung_config.dart` -- `AiRungConfig({required AiRungKind kind})` with equality by `kind` and a `const` constructor; carries no other fields in Story 3.1
- [ ] `packages/domain_core/lib/src/results/recognition_failure.dart` -- add `QuotaExhausted` to the sealed hierarchy: `class QuotaExhausted extends RecognitionResult { const QuotaExhausted({this.resetAt}); final DateTime? resetAt; }` -- equals/hashCode/toString follow the existing variant conventions
- [ ] `packages/domain_core/lib/src/ports/ai_rung.dart` -- docstring note about the four rungs and the new variant; signature unchanged
- [ ] `packages/domain_core/lib/domain_core.dart` -- barrel update exporting the new symbols
- [ ] `packages/domain_core/test/ai_rung_config_test.dart` -- pins the enum surface + config equality
- [ ] `packages/domain_core/test/recognition_result_test.dart` -- pins the sealed result exhaustiveness
- [ ] `packages/integrations/lib/src/ai/local_ai_rung.dart` -- `class LocalAiRung implements AiRung { const LocalAiRung(); @override Future<RecognitionResult> recognize(Uint8List photoBytes) async { throw UnsupportedError('local rung is a v2 seam — not implemented in v1'); } }`
- [ ] `packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart` -- stub returning `const RecognitionFailure('hosted-quota not yet wired (Story 3.2)')`
- [ ] `packages/integrations/lib/src/ai/byok_ai_rung.dart` -- stub returning `const RecognitionFailure('byok not yet wired (Story 3.3)')`
- [ ] `packages/integrations/lib/integrations.dart` -- barrel update
- [ ] `packages/integrations/test/ai_rung_adapters_test.dart` -- all four rungs implement `AiRung`; `LocalAiRung` throws; stubs return the documented failure
- [ ] `apps/client/lib/state/ai_rung_provider.dart` -- `aiRungConfigProvider` (default `AiRungKind.noOp`) + `aiRungProvider` (config-driven adapter selection)
- [ ] `apps/client/lib/main.dart` -- override `aiRungConfigProvider` with `const AiRungConfig(kind: AiRungKind.noOp)`
- [ ] `apps/client/test/state/ai_rung_provider_test.dart` -- config-driven selection; throws-on-use for `LocalAiRung`
- [ ] `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green (no Flutter/drift/dio/image_picker/mobile_scanner/flutter_secure_storage imports in `domain_core/lib/`)

**Acceptance Criteria:**
- Given the AI tier design, when any estimator is needed, then the core calls the `AiRung` port and receives typed results (`RecognizedPlate | NoMatch | RecognitionFailure | QuotaExhausted`) without knowing the active implementation (AD-5).
- Given four implementations exist behind the port — `no-op`, `hosted-quota`, `byok`, `local` — config selects exactly one active rung and the core never branches on which rung is active (AD-5, FR-6 seam).
- Given `LocalAiRung` is the v2 seam, when it is the active rung, then `recognize` throws `UnsupportedError` and the type system and provider wiring are honest about the seam (FR8).
- Given the AD-1 invariant, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker/mobile_scanner/flutter_secure_storage imports.
- Given the existing Story 1.8 path, when `NoopAiRung` is the active rung, then the photo path still resolves via `RecognizedPlate(foods: [])` and the closest-matches + manual fallback continues to ship (NFR5 / Story 1.8).
- Given the sealed result hierarchy, when a call site pattern-matches `RecognitionResult`, then the analyzer enforces exhaustive coverage of all four variants; a missing `QuotaExhausted` arm fails to compile.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: AD-1 invariant holds; `ai_rung_config_test.dart` + `recognition_result_test.dart` pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `ai_rung_adapters_test.dart` passes; existing `noop_ai_rung_test.dart` remains green
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/state/ai_rung_provider_test.dart"` -- expected: provider config-driven selection passes
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `AiRungKind` has exactly four values: `noOp | hostedQuota | byok | local` -- the v2 seam is a first-class enum value, not a sentinel.
- Confirm `QuotaExhausted` is a sealed member of `RecognitionResult` and the analyzer enforces exhaustive pattern-match across all four variants.
- Confirm `aiRungProvider` selects the adapter by `AiRungConfig.kind` and never branches the core on which rung is active.
- Confirm `NoopAiRung` shape is unchanged -- Story 1.8 tests remain green without modification.

## Suggested Review Order

**Rung config + kind enums (AD-5)**
- The build-time config + the four-kinds enum; exactly one active rung.
  [`ai_rung_kind.dart`](../../packages/domain_core/lib/src/value_types/ai_rung_kind.dart)
  [`ai_rung_config.dart`](../../packages/domain_core/lib/src/value_types/ai_rung_config.dart)

**Sealed result hierarchy + new variant**
- `RecognizedPlate | NoMatch | RecognitionFailure | QuotaExhausted` -- typed results, never raw exceptions.
  [`recognition_failure.dart`](../../packages/domain_core/lib/src/results/recognition_failure.dart)

**AiRung port (AD-1, AD-5)**
- The single port the UI calls for photo recognition; core never branches on the active rung.
  [`ai_rung.dart`](../../packages/domain_core/lib/src/ports/ai_rung.dart)

**Rung adapters**
- `NoopAiRung` (existing, unchanged) + `LocalAiRung` (throws-on-use v2 seam) + `HostedQuotaAiRung` / `ByokAiRung` (Story 3.2 / 3.3 stubs).
  [`noop_ai_rung.dart`](../../packages/integrations/lib/src/ai/noop_ai_rung.dart)
  [`local_ai_rung.dart`](../../packages/integrations/lib/src/ai/local_ai_rung.dart)
  [`hosted_quota_ai_rung.dart`](../../packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart)
  [`byok_ai_rung.dart`](../../packages/integrations/lib/src/ai/byok_ai_rung.dart)

**Provider plumbing (AD-5)**
- Config-driven selection; exactly one active rung; no core branch.
  [`ai_rung_provider.dart`](../../apps/client/lib/state/ai_rung_provider.dart)

---

## Dev Agent Record

### Implementation Plan

(To be populated by the dev agent on completion.)

### Completion Notes

(To be populated by the dev agent on completion.)

### Debug Log

(To be populated by the dev agent on completion.)

### File List

(To be populated by the dev agent on completion.)

### Change Log

(To be populated by the dev agent on completion.)

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items