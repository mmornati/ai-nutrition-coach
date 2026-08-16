---
title: 'Story 2.1 — Coach taxonomy and localization key store'
type: 'feature'
created: '2026-08-16'
status: 'review'
baseline_commit: '9f6eaf893e367014bebb590b0a1f7444fa2c4da7'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 2.2 / 2.3 ship a coach whisper + interaction model on top of every plate Epic 1 lands. To stay coherent, translatable, and never ad-hoc, every coach string the app renders must resolve from a single keyed, localized store — with a bounded v1 taxonomy (one question per food-group/composition pattern), not unbounded generative output. Without the key store in place first, 2.2 / 2.3 cannot ship without hardcoding strings in widgets, which violates AD-7 / NFR3 and breaks the No-Dark-Patterns Standard QA gate.

**Approach:** Add a `CoachQuestion` entity (key + anchor + composition pattern + localized template string) in `packages/domain_core` plus a sealed `CoachQuestionResult` typed result. Ship a `Coach` port returning the post-resolve or open-plate question by composition pattern. Implement a `TemplateCoach` in `packages/integrations` resolving the `en` locale from a single typed `coach_strings.dart` key store — one localized question per pattern, no interpolation in widgets. The active implementation is selected by config so AI-on (Epic 3) can swap in a richer variant behind the same port without touching 2.2 / 2.3.

## Boundaries & Constraints

**Always:**
- AD-1: `Coach` port + `CoachQuestion` entity live in `packages/domain_core` — no Flutter, drift, dio, image_picker, mobile_scanner imports.
- AD-7: every coach string resolves by key from a single typed key store; no string interpolation in widgets; the key store is a single file reviewable by the named NDP reviewer.
- NFR3: v1 taxonomy is a bounded curated set — one localized question per food-group/composition pattern; no unbounded generative questions.
- FR15 / NFR3: every string passes the No-Dark-Patterns tone review owned by a named reviewer — copy is calm, non-judgmental, no calorie-shaming, no streak-pressure, no restriction framing.
- NFR6: copy uses honest quantities (`~2 fists`) when the composition pattern needs them, never kcal-as-float.
- AD-5 / AD-3: the active implementation is selected by config; the core never branches on which rung (template vs AI) is active — only on whether `Coach.questionFor(...)` returned a typed `CoachQuestionResult`.
- NFR7: copy is screen-reader friendly (announces the question text + the two button labels by name); localized strings are plain text, no decorative unicode.

**Ask First:**
- Whether the v1 taxonomy should be a single canonical set of ~6 patterns (Veg&Fruit-light, Protein-heavy, Starch-heavy, Dairy-light, Veg&Fruit-rich, balanced) — the spec ships this exact set as the canonical v1 scope. If the named NDP reviewer rejects any pattern during review, the task is to remove the pattern, not add a new one.
- Whether the key store lives under `packages/integrations/lib/src/l10n/coach_strings.dart` (single source for v1 `en`) or split per-locale — the spec ships the single-file version; future locales are added without restructuring.

**Never:**
- No unbounded generative coach copy in v1; no LLM call from the key store path.
- No string interpolation in widgets; no `format(...)` calls inside the rendering layer for coach copy.
- No hardcoded copy strings in `apps/client/lib`; every coach string goes through `Coach.questionFor(...).text` (or equivalent) and is referenced by key, not by string literal.
- No new external dependency; no new package import.
- No tone changes to the existing copy that lives outside the key store — Stories 1.x already ship coach whisper copy on the Day Board that this story does NOT touch; this story only owns the key store for Stories 2.2 / 2.3's new surfaces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_POST_RESOLVE_VEG_LIGHT | `Coach.questionFor(anchor: postResolve, pattern: vegLight)` | Returns `CoachQuestionResult(question: CoachQuestion(key: 'post.resolve.vegLight', text: '...'))` — non-empty, ≥1 char, calm non-judgmental copy | N/A |
| HAPPY_PATH_OPEN_PLATE_HINT | `Coach.questionFor(anchor: openPlate, pattern: balanced)` | Returns `CoachQuestionResult(question: ...)` with the open-plate hint wording (e.g. "Greens would round this plate out…") | N/A |
| UNKNOWN_PATTERN | `Coach.questionFor(anchor: postResolve, pattern: unknown)` | Returns a typed `NoCoachQuestion` — UI renders nothing (no fallback copy, no error UI); the UI handles the empty case by hiding the whisper | Typed result, never a thrown exception |
| AI_OFF_ACTIVE | Config selects `TemplateCoach` | All coach questions resolve from the `en` key store; no network call; deterministic for the same pattern | N/A |
| AI_ON_FUTURE | Config selects an AI-backed implementation (Epic 3) | Port still returns a typed result; same shape; richer copy when available | Typed result |
| DARK_MODE | UI rendered with `AppPalette.dark` | Key-store copy is color-agnostic (it ships plain text); UI applies palette via existing typography rules | N/A |
| EMPTY_KEY_STORE | `coach_strings.dart` accidentally missing a key | Port returns `NoCoachQuestion` for that pattern; UI hides the whisper; build still succeeds | Typed result |
| REDUCED_MOTION | OS reduce-motion enabled | Whisper enters via fade (handled by Story 2.2's whisper widget, not this story) | N/A |
| MULTI_PATTERN_SAME_ANCHOR | UI requests both `vegLight` and `proteinHeavy` for one plate (not a v1 case — UI only asks for one) | UI is responsible for picking one pattern; this story does not pick | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/entities/coach_question.dart` -- new; `CoachQuestion({ required String key, required String text, required CoachAnchor anchor, required CompositionPattern pattern })` value object; equality + hashCode by `key`
- `packages/domain_core/lib/src/value_types/composition_pattern.dart` -- new; sealed-style `enum CompositionPattern { vegLight, proteinHeavy, starchHeavy, dairyLight, vegRich, balanced }` plus the `CoachAnchor { postResolve, openPlate }` enum
- `packages/domain_core/lib/src/results/coach_question_result.dart` -- new; sealed `CoachQuestionResult = CoachFound(CoachQuestion question) | NoCoachQuestion` -- typed result, never raw exceptions
- `packages/domain_core/lib/src/ports/coach.dart` -- new; `abstract interface class Coach { CoachQuestionResult questionFor({required CoachAnchor anchor, required CompositionPattern pattern}) }` -- AD-1 single port
- `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- `packages/domain_core/test/coach_test.dart` -- new; AD-1 invariant holds; `Coach` is interface-only; `CoachQuestion` equality by key
- `packages/integrations/lib/src/l10n/coach_strings.dart` -- new; single typed `Map<({CoachAnchor, CompositionPattern}), CoachQuestion>` for the `en` locale -- one calm, non-judgmental string per entry
- `packages/integrations/lib/src/coach/template_coach.dart` -- new; `TemplateCoach` resolving the `en` locale from `coach_strings.dart`; returns `CoachFound(question)` for known keys and `NoCoachQuestion` for unknown patterns
- `packages/integrations/lib/integrations.dart:1` -- barrel update
- `packages/integrations/test/template_coach_test.dart` -- new; verifies every `(anchor, pattern)` in the v1 taxonomy returns a non-empty `CoachQuestion`; unknown patterns return `NoCoachQuestion`; same key → same question
- `apps/client/lib/main.dart` -- override `coachProvider` with `TemplateCoach()` at the root (Story 2.2 / 2.3 read this provider)

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain_core/lib/src/value_types/composition_pattern.dart` -- `enum CompositionPattern` (vegLight, proteinHeavy, starchHeavy, dairyLight, vegRich, balanced) + `enum CoachAnchor` (postResolve, openPlate) -- the v1 taxonomy
- [x] `packages/domain_core/lib/src/entities/coach_question.dart` -- `CoachQuestion` value type with `key`, `text`, `anchor`, `pattern`; equality by `key`
- [x] `packages/domain_core/lib/src/results/coach_question_result.dart` -- sealed `CoachQuestionResult = CoachFound(CoachQuestion) | NoCoachQuestion`
- [x] `packages/domain_core/lib/src/ports/coach.dart` -- `abstract interface class Coach` with `questionFor({anchor, pattern})` -- AD-1 single port, no Flutter imports
- [x] `packages/domain_core/lib/domain_core.dart:19` -- barrel update exporting the new symbols
- [x] `packages/domain_core/test/coach_test.dart` -- AD-1 invariant holds; `Coach` is interface-only; `CoachQuestion` equality by key
- [x] `packages/integrations/lib/src/l10n/coach_strings.dart` -- single typed `Map<({CoachAnchor, CompositionPattern}), CoachQuestion>` for the `en` locale; one calm non-judgmental string per entry; ≥1 char per entry; named reviewer can sign off in one file
- [x] `packages/integrations/lib/src/coach/template_coach.dart` -- `TemplateCoach` resolving the `en` key store; returns `CoachFound(question)` for known keys, `NoCoachQuestion` for unknown patterns
- [x] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [x] `packages/integrations/test/template_coach_test.dart` -- every v1 `(anchor, pattern)` returns a non-empty `CoachQuestion`; unknown patterns return `NoCoachQuestion`; same key → same question
- [x] `apps/client/lib/main.dart` -- override `coachProvider` with `TemplateCoach()` so Story 2.2 / 2.3 can read it
- [x] `apps/client/test/coach_provider_test.dart` -- Riverpod override resolves to `TemplateCoach` and returns the expected key for a known pattern
- [x] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green (no Flutter/drift/dio imports in `domain_core/lib/`)

**Acceptance Criteria:**
- Given the v1 taxonomy, when `Coach.questionFor(anchor: postResolve, pattern: vegLight)` is called with `TemplateCoach` active, then a non-empty, calm, non-judgmental `CoachQuestion` with key `post.resolve.vegLight` is returned.
- Given an unknown pattern, when the port is called, then `NoCoachQuestion` is returned (typed result, no thrown exception) and the UI can render nothing.
- Given the `en` key store, when the named NDP reviewer reads `coach_strings.dart`, then every entry is a single calm non-judgmental sentence — no calorie-shaming, no streak-pressure, no restriction framing.
- Given a future AI rung, when the active implementation is swapped, then `Coach.questionFor(...)` continues to return the same sealed `CoachQuestionResult` shape and the UI in 2.2 / 2.3 does not change.
- Given the AD-1 invariant, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker/mobile_scanner imports.
- Given dark mode + reduced-motion, when the key store is consulted, then the returned `CoachQuestion.text` is plain (no decorative unicode, no color tokens, no typography references) so the UI applies its own theme.
- Given the same `key`, when the port is called twice, then the same `CoachQuestion` is returned (deterministic; equality by key).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: AD-1 invariant holds; `coach_test.dart` passes
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `template_coach_test.dart` passes
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `coach_strings.dart` contains exactly one entry per `(anchor, pattern)` pair in the v1 taxonomy — 2 anchors × 6 patterns = 12 entries; each entry's text is calm and non-judgmental; no streak / countdown / calorie-shame vocabulary.
- Confirm `Coach` is `abstract interface class`; the `TemplateCoach` is the only concrete implementation in `packages/integrations/lib/src/coach/`; AI-backed implementations land in Epic 3 behind the same provider.
- Confirm `apps/client/lib/main.dart` overrides `coachProvider` with `TemplateCoach()`; a real AI-backed coach (Epic 3+) drops in behind the same provider without touching 2.2 / 2.3.

## Suggested Review Order

**Coach port (AD-1, AD-5)**
- The single port the UI calls for coach questions; core never branches on the active implementation.
  [`coach.dart`](../../packages/domain_core/lib/src/ports/coach.dart)

**Composition pattern + anchor enums (NFR3)**
- The bounded v1 taxonomy; one enum entry per food-group/composition pattern.
  [`composition_pattern.dart`](../../packages/domain_core/lib/src/value_types/composition_pattern.dart)

**Typed result hierarchy**
- `CoachFound(CoachQuestion) | NoCoachQuestion` -- typed results, never raw exceptions.
  [`coach_question_result.dart`](../../packages/domain_core/lib/src/results/coach_question_result.dart)

**CoachQuestion value type**
- Equality by `key`; the single reviewable identity that the key store ships under.
  [`coach_question.dart`](../../packages/domain_core/lib/src/entities/coach_question.dart)

**en key store (AD-7, NFR3, FR15)**
- One file, one localized question per `(anchor, pattern)`; named NDP reviewer sign-off.
  [`coach_strings.dart`](../../packages/integrations/lib/src/l10n/coach_strings.dart)

**TemplateCoach (v1 active implementation)**
- Resolves the `en` key store; returns `CoachFound` for known keys, `NoCoachQuestion` otherwise.
  [`template_coach.dart`](../../packages/integrations/lib/src/coach/template_coach.dart)

---

## Dev Agent Record

### Implementation Plan

The story lands in three layers, mirroring the Epic 1 conventions:

1. **`packages/domain_core` (pure-Dart core)** — value types (`CompositionPattern`, `CoachAnchor` enums + `keyToken` getters), entity (`CoachQuestion` value type with equality by `key`), sealed result hierarchy (`CoachFound | NoCoachQuestion`), and the `abstract interface class Coach` port. All four new files are pure-Dart — no Flutter / drift / dio / image_picker / mobile_scanner imports. The barrel `domain_core.dart` re-exports them so downstream packages reach the symbols via `package:domain_core/domain_core.dart`.

2. **`packages/integrations` (adapter package)** — `coach_strings.dart` ships the v1 `en` key store as a single `const Map<CoachQuestionKey, CoachQuestion>` with 12 entries (2 anchors × 6 patterns). `CoachQuestionKey` is a value type so the map keys are immutable and hashable. `TemplateCoach` implements `Coach` and resolves the map for every `(anchor, pattern)` pair, returning `CoachFound(question)` for known entries and `NoCoachQuestion` for anything else. The barrel re-exports both.

3. **`apps/client` (Flutter UI)** — new `coach_provider.dart` exposes `coachProvider` (a Riverpod `Provider<Coach>` with the spec-mandated defensive `UnimplementedError` throw) and a `FakeCoach` test double. `main.dart` overrides `coachProvider` with `const TemplateCoach()` so Stories 2.2 / 2.3 read from the same seam.

Tests follow the Epic 1 conventions: `packages/domain_core/test/coach_test.dart` pins the value types + sealed result + port contract; `packages/integrations/test/template_coach_test.dart` pins the key store shape + non-empty / non-judgmental text + unknown-pattern `NoCoachQuestion`; `apps/client/test/state/coach_provider_test.dart` pins the Riverpod override shape.

### Completion Notes

All 13 tasks complete. Test results:
- `packages/domain_core`: 33 tests pass (including the 8 new `coach_test.dart` tests + AD-1 invariant).
- `packages/integrations`: 52 tests pass (including the 10 new `template_coach_test.dart` tests).
- `apps/client`: state/ and widgets/ tests pass (56 tests). The 4 pre-existing `day_board_screen_test.dart` failures are not caused by this story (verified by stashing and re-running). `widget_test.dart` (which exercises the production `main.dart` seam) passes.

I/O matrix coverage:
- HAPPY_PATH_POST_RESOLVE_VEG_LIGHT → `template_coach_test.dart: 'questionFor returns CoachFound …'` + `coach_provider_test.dart: 'production override resolves to TemplateCoach …'`
- HAPPY_PATH_OPEN_PLATE_HINT → same tests cover every `(anchor, pattern)`.
- UNKNOWN_PATTERN → `template_coach_test.dart: 'unknown pattern returns NoCoachQuestion …'` + `coach_provider_test.dart: 'unknown (anchor, pattern) returns NoCoachQuestion …'`.
- AI_OFF_ACTIVE → `template_coach_test.dart: 'same (anchor, pattern) returns the same CoachQuestion instance …'` + the coach_provider_test.dart production-override tests.
- AI_ON_FUTURE → `coach_test.dart: 'Coach is interface-only: a minimal adapter …'` — any adapter returning the sealed result compiles against the port.
- DARK_MODE → `widget_test.dart: 'OpenPlate scaffold resolves dark tokens from Theme.of'` (pre-existing, still passes).
- EMPTY_KEY_STORE → `template_coach_test.dart: 'unknown pattern returns NoCoachQuestion …'` (exercises a partial map).
- REDUCED_MOTION → handled by Story 2.2 (out of scope for 2.1).
- MULTI_PATTERN_SAME_ANCHOR → N/A (UI is responsible; spec says this story does not pick).

Key equality invariant — `CoachQuestion.==` uses `key` only; `hashCode` is `key.hashCode`. `NoCoachQuestion` is a singleton-by-type. The grep test in `domain_core_test.dart` still passes (the new files introduce no forbidden imports).

The key store copy was authored against the FR15 / NFR3 / NFR6 / NFR7 standard: calm suggestions (`a handful`, `a small bowl`, `a bit of`), no kcal-as-float, no calorie-shaming / streak / restriction / guilt vocabulary. A banned-fragments test pins the same vocabulary ban so a regression in the key store fails before the NDP review pass.

### Debug Log

- First run of `dart test` for `packages/domain_core` failed because the coach_question.dart import path was relative (it lives in `entities/` but composition_pattern.dart lives in `value_types/`). Fixed with `import '../value_types/composition_pattern.dart';`.
- `CoachQuestion` initially hashed `key + text + anchor + pattern`, breaking the contract that equality is by `key` (the test "same key compares equal regardless of text" failed because `a.hashCode != b.hashCode`). Fixed by hashing only `key`.
- `NoCoachQuestion.hashCode` was recursive (`const NoCoachQuestion().hashCode` from inside the `hashCode` getter — infinite loop). Fixed with `(NoCoachQuestion).hashCode` (the type literal's hash).
- First run of `apps/client/test/state/coach_provider_test.dart` failed to compile because `encryptedStoreProvider` was not imported. Fixed by importing `state/record_plate_provider.dart` and inlining a minimal `_StubEncryptedStore` (the test does not exercise the store path).
- The defensive-seam test (`coachProvider` throws when not overridden) failed because Riverpod 3.x wraps the provider's thrown `UnimplementedError` in a `ProviderException`. Switched to a try/catch that asserts on the message substring rather than the exception type.

### File List

New files:
- `packages/domain_core/lib/src/value_types/composition_pattern.dart`
- `packages/domain_core/lib/src/entities/coach_question.dart`
- `packages/domain_core/lib/src/results/coach_question_result.dart`
- `packages/domain_core/lib/src/ports/coach.dart`
- `packages/domain_core/test/coach_test.dart`
- `packages/integrations/lib/src/l10n/coach_strings.dart`
- `packages/integrations/lib/src/coach/template_coach.dart`
- `packages/integrations/test/template_coach_test.dart`
- `apps/client/lib/state/coach_provider.dart`
- `apps/client/test/state/coach_provider_test.dart`

Modified files:
- `packages/domain_core/lib/domain_core.dart` (barrel export added for coach_question, composition_pattern, coach_question_result, coach)
- `packages/integrations/lib/integrations.dart` (barrel export added for `src/coach/template_coach.dart` + `src/l10n/coach_strings.dart`)
- `apps/client/lib/main.dart` (override `coachProvider` with `const TemplateCoach()`; added import for `state/coach_provider.dart`)
- `_bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md` (frontmatter status / baseline_commit; tasks checked; Dev Agent Record populated)

### Change Log

- 2026-08-16 — Initial implementation of Story 2.1 (key store + port + template rung). All 13 execution tasks complete; all in-scope tests green.

---

## Senior Developer Review (AI)

### Review Date
2026-08-16

### Review Outcome
Approve-merge. All findings are low-severity. No blockers; one spec reconciliation needed (Code Map drift on map-key type). Domain-core analyzer + 33-test suite pass locally; integration/client suites need a Flutter SDK the container image doesn't supply (`cirruslabs/flutter:stable` ships a SDK that conflicts with `^3.12.0`; `3.27` and `3.32` are too old; `3.47` tag absent from the registry).

### Layer Results
- blind-hunter — ran
- edge-case-hunter — ran
- verification-gap — ran
- acceptance-auditor — ran
- failed_layers: none

### Action Items

#### Patch

- [ ] [Review][Patch] `coach_question.dart:19-22` docstring claims text/anchor/pattern participate in `hashCode`; the implementation hashes `key` only. Fix the comment to match the code (equality is by `key` only — no other field belongs in `hashCode`).

- [ ] [Review][Patch] `coach_strings.dart` entries hand-write `key: 'post.resolve.vegLight'` for each row; the canonical `_coachKey(anchor, pattern)` helper is only used by `CoachQuestionKey.value`, never by the entry rows. Add an assertion that ties entry keys to the canonical form, e.g. `expect(entry.key, equals(_coachKey(entry.anchor, entry.pattern)))` in `template_coach_test.dart`, so a future rename of an enum `keyToken` fails CI.

- [ ] [Review][Patch] `coach_question.dart` ships a `copyWith` that no caller in the diff (and no planned caller in Stories 2.2/2.3) exercises. Remove the method (or annotate as `@visibleForTesting` and document the future-use case) to keep the key-store value type surface minimal.

- [ ] [Review][Patch] `template_coach_test.dart` and `coach_provider_test.dart` each carry their own `_PartialCoach` / `_PartialTemplateCoach` lookup — small but real duplication of the `TemplateCoach` `Map<CoachQuestionKey, CoachQuestion>` lookup pattern. Promote one to a shared test helper or accept the duplication as test isolation; either is fine, but the duplication should be deliberate.

#### Decision-needed

- [ ] [Review][Bad-Spec] The spec Code Map says `coach_strings.dart` ships `Map<({CoachAnchor, CompositionPattern}), CoachQuestion>` (a record-keyed map); the implementation ships `Map<CoachQuestionKey, CoachQuestion>` (a named-class key with `toString` / `value` getter for the canonical `'anchor.pattern'` string). Behaviour is equivalent — the new class is an intentional improvement. Update the Code Map paragraph in the spec to reflect the actual implementation.

#### Defer (pre-existing or non-blocking)

- [x] [Review][Defer] `UnimplementedError`-on-unoverridden seam relies on `thrown.toString().contains(...)` substring matching in `coach_provider_test.dart:62-64` because Riverpod 3.x wraps the thrown error in `ProviderException` — deferred, pre-existing Riverpod-version-coupling pattern; revisit on Riverpod upgrade.
- [x] [Review][Defer] `TemplateCoach` returns `NoCoachQuestion` only on missing map entry, not on empty `text`. V1 entries are non-empty by construction; the EMPTY_KEY_STORE row of the I/O matrix is satisfied vacuously. — deferred, non-blocking.
- [x] [Review][Defer] `bannedFragments` list (`template_coach_test.dart:62-78`) is curated for v1; terms like "ideal", "should", "limit", "track" are not banned. Current copy is genuinely calm so this is not actionable now. — deferred, copy stays clean at review time.
- [x] [Review][Defer] Identical copy across two anchors (`post.resolve.starchHeavy` == `openPlate.starchHeavy`; same for `proteinHeavy` and `vegRich`) — reviewer judgement call; reuse is fine since the suggestion applies equally. — deferred.
- [x] [Review][Defer] No sentinel test asserts "no network call" for AI_OFF_ACTIVE. Structural absence of `package:dio`/`http` in the coach path covers it. — deferred.

## Review Follow-ups (AI)
