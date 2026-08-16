---
title: 'Story 2.3 — Coach Question interaction: answer / dismiss / depth (FR5)'
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

**Problem:** Story 2.2 ships the post-resolve whisper anchor. Without `[sure]` / `[ask later]` doing the right thing — and without an open-plate hint anchor on next/empty plates — the coach loop is a dead-end whisper the user can't act on. The interaction must be: `[sure]` produces exactly one bounded depth follow-up (never a conversational loop); `[ask later]` defers quietly with no nag; open-plate hint surfaces on next/empty plates; every interaction is logged locally only, never transmitted; no score, no streak, no guilt anywhere.

**Approach:** Add a `CoachInteractionLog` event value type and a `CoachInteraction` enum (`sure | askLater | dismiss | depthAnswer`) in `packages/domain_core`. Extend `CoachNoteStore` (Story 2.2) with `recordInteraction(CoachInteractionLog)` append-only writes. Add `RecordCoachInteraction` use-case that updates the note's interaction log and returns the depth follow-up when `[sure]` is chosen (exactly one bounded follow-up via the active `Coach` port). Render `CoachWhisper` (Story 2.2 widget) so `[sure]` opens an inline depth panel (serif italic + `[close]` outline pill); `[ask later]` clears the whisper with no nag, recording the interaction locally. Ship the open-plate hint anchor on empty `OpenDent` rows on the Day Board — a quiet whisper that surfaces only when the active coach has a non-empty question for that anchor/pattern, with no nag, no countdown.

## Boundaries & Constraints

**Always:**
- AD-1: `CoachInteractionLog` + `RecordCoachInteraction` use-case live in `packages/domain_core` — no Flutter, drift, dio imports.
- AD-3: every interaction (`sure | askLater | dismiss | depthAnswer`) writes through `CoachNoteStore.recordInteraction`; UI reflects the new state via the existing store providers (no second source).
- FR5: `[sure]` produces exactly one bounded follow-up Coach Note — never a conversational loop; the follow-up is itself a `CoachNote` with `anchor: depthFollowUp`.
- NFR3 / FR4: depth follow-up copy resolves from the same key store (Story 2.1); no string interpolation in widgets; no calorie-shaming, streak-pressure, or restriction framing.
- UX-DR5: `[sure]` is sage; `[ask later]` is amber; `[close]` on the depth panel is amber outline; never red; never a countdown.
- NFR7: touch targets ≥48px; screen reader announces the question text and the button labels by name; color never the sole signal.
- NFR8: dark mode and reduce-motion apply; depth panel entrance collapses to fade only when reduce-motion is on.
- FR9: every interaction is logged locally only — never transmitted without explicit opt-in.
- FR5: `[ask later]` and `dismiss` produce no score, no streak, no nag; the open-plate hint anchor appears on next/empty plates only when the active coach has a non-empty question — UI never invents follow-ups.
- The post-resolve anchor (Story 2.2) is the only anchor that counts toward the engaged-coach-note signal (SM-2); `[ask later]` and `dismiss` do NOT count; depth follow-ups do NOT count.

**Ask First:**
- Whether the open-plate hint appears on ALL three open dents (Breakfast / Lunch / Dinner) or only the next one in chronological order — the spec ships it on ALL three open dents when the active coach has a non-empty `openPlate` question; if any dent renders a hint, the user can act on it.
- Whether the depth panel closes on tap-outside or only on `[close]` — the spec ships `[close]` only; tap-outside is non-committal and would let an accidental tap dismiss the depth answer without recording the interaction.

**Never:**
- No unbounded generative coach copy; no LLM call from this story's hot path.
- No string interpolation in widgets.
- No score, streak, badge, or celebratory pop-up anywhere on this path (FR15).
- No nag; no "Don't show again" easter egg on `[ask later]` (that's a quota gate pattern, not a coach pattern).
- No spinner, countdown, or urgency on the depth panel or the open-plate hint.
- No biometric identification anywhere on this path (FR13 carries over from Epic 1).
- No new external dependency; no new package import.
- No tone change to existing Day Board copy outside the new interaction surfaces; this story only extends the existing `CoachWhisper` widget.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_SURE | User taps `[sure]` on the post-resolve whisper | `RecordCoachInteraction(kind: sure)` writes the interaction; the active `Coach` port returns a `depthFollowUp` question; one bounded follow-up `CoachNote` is appended; the whisper re-renders with the follow-up question + `[close]` pill | N/A |
| HAPPY_PATH_ASK_LATER | User taps `[ask later]` on the post-resolve whisper | `RecordCoachInteraction(kind: askLater)` writes the interaction; the whisper disappears; no nag; the open-plate hint surfaces on next/empty plates | N/A |
| HAPPY_PATH_DISMISS | User dismisses the whisper (swipe / back / system gesture) | `RecordCoachInteraction(kind: dismiss)` writes the interaction; the whisper disappears; no nag | N/A |
| HAPPY_PATH_DEPTH_CLOSE | User taps `[close]` on the depth panel | `RecordCoachInteraction(kind: depthAnswer)` writes the interaction; the depth panel disappears; the underlying whisper returns to its `[sure]`/`[ask later]` form | N/A |
| HAPPY_PATH_OPEN_PLATE_HINT | Day Board renders with one open Breakfast dent and `Coach.questionFor(anchor: openPlate, pattern: balanced)` returns a question | `OpenDent` row renders the open-plate hint (serif italic, sage accent, no `[sure]`/`[ask later]`); tapping the hint opens a quiet panel that records the interaction and clears the hint | N/A |
| NO_OPEN_PLATE_QUESTION | Active coach returns `NoCoachQuestion` for `openPlate` / current pattern | No hint is rendered on any dent; no empty whisper row; no error UI | Typed result |
| DEPTH_FOLLOWUP_ALREADY_VIEWED | User taps `[sure]` twice on the same post-resolve whisper | The second tap is a no-op (the follow-up already exists); UI is idempotent; no extra notes | Idempotent |
| DEPTH_PORT_UNAVAILABLE | `Coach` port throws for `depthFollowUp` (defensive — `TemplateCoach` cannot throw) | Use-case catches, logs locally, returns no follow-up; UI shows no depth panel; the interaction log records `sure` only | Calm degrade |
| STORE_WRITE_FAILURE | `CoachNoteStore.recordInteraction` returns a `StoreFailure` | UI still reflects the user's intent (whisper dismisses, depth panel closes); the failure is logged locally | Calm degrade, no crash |
| AI_OFF_ACTIVE | Config selects `TemplateCoach` | Depth follow-up copy resolves from the `en` key store; no network call; deterministic | N/A |
| AI_ON_FUTURE | Config selects an AI-backed rung (Epic 3) | Same shape returned; richer depth follow-up copy when available | N/A |
| DARK_MODE | UI rendered with `AppPalette.dark` | Depth panel + hint use the same palette mapping as Story 2.2's whisper | N/A |
| REDUCED_MOTION | OS reduce-motion enabled | Depth panel + hint entrances collapse to fade only (NFR8) | N/A |
| MULTIPLE_PLATES | Two plates on the same day, each with a note | Each plate row's whisper is independent; tapping `[sure]` on one does not affect the other | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/value_types/coach_interaction.dart` -- new; `enum CoachInteraction { sure, askLater, dismiss, depthAnswer }` + `CoachInteractionLog({ required int noteId, required CoachInteraction kind, required DateTime at })` value type
- `packages/domain_core/lib/src/ports/coach_note_store.dart` -- modified; add `Future<CoachInteractionResult> recordInteraction(CoachInteractionLog log)` to the existing port (Story 2.2's port gains one method)
- `packages/domain_core/lib/src/results/coach_interaction_failure.dart` -- new; sealed `CoachInteractionResult = CoachInteractionRecorded | CoachInteractionFailed(StoreFailure cause)` -- typed result
- `packages/domain_core/lib/src/use_cases/record_coach_interaction.dart` -- new; `RecordCoachInteraction` use-case taking `CoachNoteStore` + `Coach`; `sure` → asks the active coach for the depth follow-up, appends one bounded `CoachNote` with `anchor: depthFollowUp`, records the interaction; `askLater | dismiss | depthAnswer` → records the interaction only
- `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- `packages/domain_core/test/record_coach_interaction_test.dart` -- new; idempotency + depth follow-up bounded + AD-1 invariant holds
- `packages/integrations/lib/src/store/local_coach_note_store.dart` -- modified; implement `recordInteraction` writing to a new `coach_interactions` drift table (FK to coach_notes)
- `packages/integrations/lib/src/store/schema.dart` -- modified; add `coach_interactions` table (id, coach_note_id FK, kind, at)
- `packages/integrations/test/local_coach_note_store_test.dart` -- modified; `recordInteraction` appends; FK constraint holds
- `apps/client/lib/widgets/coach_whisper.dart` -- modified (Story 2.2 widget extended): tap `[sure]` → ask the depth panel to render via `depthFollowUpProvider`; tap `[ask later]` → call `RecordCoachInteraction(kind: askLater)` and clear the whisper; depth panel renders with `[close]` pill
- `apps/client/lib/widgets/coach_depth_panel.dart` -- new; inline depth panel (serif italic + `[close]` amber outline pill); ≥48px tap targets; reduced-motion = fade only
- `apps/client/lib/widgets/open_plate_hint.dart` -- new; open-plate hint whisper rendered inside `OpenDent` row when the active coach has a non-empty `openPlate` question for the dent's pattern; tapping the hint records the interaction and clears the hint
- `apps/client/lib/widgets/open_dent.dart` -- modified; if the active coach returns a question for `openPlate` + the dent's pattern, render `OpenPlateHint` below the dent's existing copy
- `apps/client/lib/state/coach_note_provider.dart` -- modified; add `depthFollowUpProvider` (FutureProvider.family) that calls `RecordCoachInteraction(kind: sure)` and returns the resulting depth follow-up note (or `NoCoachNoteGenerated`)
- `apps/client/lib/main.dart` -- construct `recordCoachInteractionProvider` with `coachProvider` + `coachNoteStoreProvider`
- `apps/client/test/widgets/coach_whisper_test.dart` -- modified (Story 2.2 test extended): `[sure]` opens the depth panel; `[ask later]` records + clears; depth `[close]` records + closes
- `apps/client/test/widgets/coach_depth_panel_test.dart` -- new; renders the follow-up question + `[close]` pill; a11y label
- `apps/client/test/widgets/open_plate_hint_test.dart` -- new; renders only when `Coach` returns a question; tap records + clears

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/value_types/coach_interaction.dart` -- `enum CoachInteraction` + `CoachInteractionLog` value type
- [ ] `packages/domain_core/lib/src/results/coach_interaction_failure.dart` -- sealed `CoachInteractionResult` -- typed result
- [ ] `packages/domain_core/lib/src/ports/coach_note_store.dart` -- add `recordInteraction` to the port (AD-1)
- [ ] `packages/domain_core/lib/src/use_cases/record_coach_interaction.dart` -- `RecordCoachInteraction` use-case; `sure` → depth follow-up + interaction log; `askLater | dismiss | depthAnswer` → interaction log only
- [ ] `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- [ ] `packages/domain_core/test/record_coach_interaction_test.dart` -- idempotency + bounded follow-up + AD-1 invariant holds
- [ ] `packages/integrations/lib/src/store/schema.dart` -- add `coach_interactions` table (FK to coach_notes)
- [ ] `packages/integrations/lib/src/store/local_coach_note_store.dart` -- implement `recordInteraction` writing to `coach_interactions`
- [ ] `packages/integrations/test/local_coach_note_store_test.dart` -- `recordInteraction` appends; FK holds
- [ ] `apps/client/lib/widgets/coach_depth_panel.dart` -- inline depth panel + `[close]` amber outline; ≥48px; reduced-motion = fade only
- [ ] `apps/client/lib/widgets/open_plate_hint.dart` -- open-plate hint whisper; tap records + clears
- [ ] `apps/client/lib/widgets/coach_whisper.dart` -- extended: `[sure]` → depth panel via `depthFollowUpProvider`; `[ask later]` → `RecordCoachInteraction(kind: askLater)` + clear
- [ ] `apps/client/lib/widgets/open_dent.dart` -- if coach returns a question, render `OpenPlateHint`
- [ ] `apps/client/lib/state/coach_note_provider.dart` -- add `depthFollowUpProvider` family
- [ ] `apps/client/lib/main.dart` -- construct `recordCoachInteractionProvider`
- [ ] `apps/client/test/widgets/coach_whisper_test.dart` -- extended tests: `[sure]` → depth panel; `[ask later]` → record + clear; depth `[close]` → record + close
- [ ] `apps/client/test/widgets/coach_depth_panel_test.dart` -- renders question + `[close]`; a11y label
- [ ] `apps/client/test/widgets/open_plate_hint_test.dart` -- renders only when coach has a question; tap records + clears
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given a post-resolve whisper, when the user taps `[sure]`, then `RecordCoachInteraction(kind: sure)` writes the interaction AND exactly one bounded follow-up `CoachNote` with `anchor: depthFollowUp` is appended; a second tap is idempotent (no extra notes) (FR5).
- Given a post-resolve whisper, when the user taps `[ask later]` or dismisses, then `RecordCoachInteraction(kind: askLater | dismiss)` writes the interaction; the whisper disappears with no nag; no score, no streak (FR5, UX-DR5).
- Given the depth panel, when the user taps `[close]`, then `RecordCoachInteraction(kind: depthAnswer)` writes the interaction; the depth panel closes; the underlying whisper returns to its `[sure]` / `[ask later]` form (FR5).
- Given an empty `OpenDent` row on the Day Board, when the active `Coach` returns a non-empty `openPlate` question for the dent's pattern, then `OpenPlateHint` renders (serif italic + sage accent, no `[sure]` / `[ask later]`); tapping the hint records the interaction and clears the hint (UX-DR5).
- Given the active `Coach` returns `NoCoachQuestion` for `openPlate` + the current pattern, when the Day Board renders, then no hint is rendered on any dent (typed result, no thrown exception, no error UI).
- Given `TemplateCoach` is the active rung, when `[sure]` is tapped, then the depth follow-up copy resolves from the `en` key store; no network call; deterministic (NFR3, AD-5).
- Given a future AI rung active, when `[sure]` is tapped, then the same `CoachNote` shape is written for the follow-up; richer copy when available (AD-5).
- Given dark mode + reduced-motion, when the depth panel or hint renders, then the same palette mapping as Story 2.2's whisper applies; depth panel + hint entrances collapse to fade only when reduce-motion is on (NFR8).
- Given the AD-1 invariant, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker/mobile_scanner imports.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: `record_coach_interaction_test.dart` passes; idempotency + bounded follow-up + AD-1 invariant holds
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `recordInteraction` appends; FK holds
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: `coach_whisper_test.dart` + `coach_depth_panel_test.dart` + `open_plate_hint_test.dart` all pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `[sure]` produces exactly ONE bounded follow-up (tap twice → second tap is a no-op; only one depth note persisted).
- Confirm `[ask later]` and `dismiss` produce no visible nag anywhere — no toast, no badge, no count of remaining interactions.
- Confirm the open-plate hint only renders when `Coach.questionFor(anchor: openPlate, ...)` returns a non-empty result; if `NoCoachQuestion`, no hint row is rendered.
- Confirm `coach_interactions` drift table is append-only — no UPDATE / DELETE on existing rows.

## Suggested Review Order

**CoachInteraction + log value type (FR5, FR9)**
- The single record of what the user did; append-only.
  [`coach_interaction.dart`](../../packages/domain_core/lib/src/value_types/coach_interaction.dart)

**CoachNoteStore port extension (AD-1)**
- One new method on the existing port; core never branches on the active store.
  [`coach_note_store.dart`](../../packages/domain_core/lib/src/ports/coach_note_store.dart)

**RecordCoachInteraction use-case (FR5, AD-3)**
- `sure` → depth follow-up + interaction log; `askLater | dismiss | depthAnswer` → log only; idempotent.
  [`record_coach_interaction.dart`](../../packages/domain_core/lib/src/use_cases/record_coach_interaction.dart)

**coach_interactions drift table (FR9, AD-3)**
- One new table on the same encrypted store; FK to coach_notes; append-only.
  [`schema.dart`](../../packages/integrations/lib/src/store/schema.dart)

**CoachWhisper extension (UX-DR5, FR5)**
- `[sure]` → depth panel; `[ask later]` → record + clear; the depth panel renders the follow-up.
  [`coach_whisper.dart`](../../apps/client/lib/widgets/coach_whisper.dart)

**CoachDepthPanel widget (UX-DR5, NFR7, NFR8)**
- Inline depth panel + `[close]` amber outline; ≥48px; reduced-motion = fade only.
  [`coach_depth_panel.dart`](../../apps/client/lib/widgets/coach_depth_panel.dart)

**OpenPlateHint widget (UX-DR5)**
- The open-plate hint anchor; tap records + clears.
  [`open_plate_hint.dart`](../../apps/client/lib/widgets/open_plate_hint.dart)

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
