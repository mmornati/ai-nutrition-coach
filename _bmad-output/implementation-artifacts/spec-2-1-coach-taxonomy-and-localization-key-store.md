---
title: 'Story 2.1 — Coach taxonomy and localization key store'
type: 'feature'
created: '2026-08-16'
status: 'ready-for-dev'
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
- [ ] `packages/domain_core/lib/src/value_types/composition_pattern.dart` -- `enum CompositionPattern` (vegLight, proteinHeavy, starchHeavy, dairyLight, vegRich, balanced) + `enum CoachAnchor` (postResolve, openPlate) -- the v1 taxonomy
- [ ] `packages/domain_core/lib/src/entities/coach_question.dart` -- `CoachQuestion` value type with `key`, `text`, `anchor`, `pattern`; equality by `key`
- [ ] `packages/domain_core/lib/src/results/coach_question_result.dart` -- sealed `CoachQuestionResult = CoachFound(CoachQuestion) | NoCoachQuestion`
- [ ] `packages/domain_core/lib/src/ports/coach.dart` -- `abstract interface class Coach` with `questionFor({anchor, pattern})` -- AD-1 single port, no Flutter imports
- [ ] `packages/domain_core/lib/domain_core.dart:19` -- barrel update exporting the new symbols
- [ ] `packages/domain_core/test/coach_test.dart` -- AD-1 invariant holds; `Coach` is interface-only; `CoachQuestion` equality by key
- [ ] `packages/integrations/lib/src/l10n/coach_strings.dart` -- single typed `Map<({CoachAnchor, CompositionPattern}), CoachQuestion>` for the `en` locale; one calm non-judgmental string per entry; ≥1 char per entry; named reviewer can sign off in one file
- [ ] `packages/integrations/lib/src/coach/template_coach.dart` -- `TemplateCoach` resolving the `en` key store; returns `CoachFound(question)` for known keys, `NoCoachQuestion` for unknown patterns
- [ ] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [ ] `packages/integrations/test/template_coach_test.dart` -- every v1 `(anchor, pattern)` returns a non-empty `CoachQuestion`; unknown patterns return `NoCoachQuestion`; same key → same question
- [ ] `apps/client/lib/main.dart` -- override `coachProvider` with `TemplateCoach()` so Story 2.2 / 2.3 can read it
- [ ] `apps/client/test/coach_provider_test.dart` -- Riverpod override resolves to `TemplateCoach` and returns the expected key for a known pattern
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green (no Flutter/drift/dio imports in `domain_core/lib/`)

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

### Completion Notes

### Debug Log

### File List

### Change Log

---

## Senior Developer Review (AI)

### Review Date

### Review Outcome

### Action Items

## Review Follow-ups (AI)
