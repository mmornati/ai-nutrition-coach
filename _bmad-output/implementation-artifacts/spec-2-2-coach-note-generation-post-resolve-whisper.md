---
title: 'Story 2.2 — Coach Note generation: post-resolve whisper (FR4)'
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

**Problem:** Epic 1 ships a Day Board where every plate lands as a quiet row, but no coach whisper fires after the resolve. Without a calm, non-judgmental question anchored to the just-logged plate, the user gets no SM-2 learning moment — and the v1 product promise ("a coach, not a calculator") is unmet. The whisper must fire deterministically after every `RecordPlate` commit, never break the calm tone, never calorie-shame, and never pressure.

**Approach:** Add a `CoachNote` entity in `packages/domain_core` (note id, plate id, anchor type, question key, text, generatedAt) and a `CoachNoteStore` port for append-only writes. Implement `LocalCoachNoteStore` in `packages/integrations` writing to a new `coach_notes` drift table on the same encrypted store. Add a `CoachNoteGenerator` use-case in `packages/domain_core` that, on commit, picks the composition pattern from the plate's resolved food groups, asks the active `Coach` port for the question, and writes one `CoachNote`. Wire `RecordPlate` (Story 1.2) so the post-commit flow always calls `CoachNoteGenerator.generateFor(plate)` — same use-case, every path. Render a `CoachWhisper` widget at the plate row on the Day Board, presenting the question in serif italic with `[sure]` (sage pill) + `[ask later]` (quiet amber outline). Story 2.3 owns the answer/dismiss/depth surface; this story only ships the post-resolve whisper anchor + persistence.

## Boundaries & Constraints

**Always:**
- AD-1: `CoachNote` entity, `CoachNoteStore` port, and `CoachNoteGenerator` use-case live in `packages/domain_core` — no Flutter, drift, dio imports.
- AD-3: every `RecordPlate` commit fires `CoachNoteGenerator.generateFor(plate)` BEFORE the UI reflects the new plate — same use-case, every path; no second mutation route.
- AD-5: the active rung (template vs AI-backed) is selected by config; the use-case never branches on which rung is active — only on whether `Coach.questionFor(...)` returned a `CoachFound`.
- NFR3 / FR4: copy is calm and non-judgmental; resolves from the key store shipped in Story 2.1; no string interpolation in widgets; no calorie-shaming, streak-pressure, or restriction framing.
- UX-DR5: whisper is serif italic (Georgia), leading 1.6; `[sure]` is a sage pill; `[ask later]` is a quiet amber outline; both ≥48px tap targets.
- NFR7: touch targets ≥48px; screen reader announces the question text and the two button labels by name; color never the sole signal (text carries the meaning; sage pill is the affordance).
- NFR8: dark mode and reduce-motion apply; reduced-motion collapses the whisper entrance to a fade only.
- FR9: every note persists locally in the encrypted store — no transmission without explicit opt-in.
- Only the post-resolve whisper anchor counts toward the engaged-coach-note signal (SM-2); the open-plate hint anchor is Story 2.3's surface and does not count.

**Ask First:**
- Whether `CoachNote` is persisted as a separate drift table (`coach_notes`) or as a column on `plate_logs` — the spec ships the separate table to keep Story 2.3's interaction log clean.
- Whether the post-resolve whisper appears above the plate row or beside the balance arc — the spec ships above the plate row (below the food entry summary, above the arc) so the arc remains the visual anchor.

**Never:**
- No unbounded generative coach copy in v1; no LLM call from this story's hot path.
- No string interpolation in widgets; no copy edits by the renderer.
- No calorie-shaming, streak-pressure, or restriction framing in any copy.
- No spinner, countdown, or urgency on the whisper surface.
- No biometric identification anywhere on this path (FR13 carries over from Epic 1).
- No new external dependency; no new package import.
- No tone change to existing Day Board copy outside the new whisper; this story only adds the whisper widget at the plate row.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_POST_RESOLVE | User commits a `PlateLog` via `RecordPlate` with food groups covering veg+protein+starch | `CoachNoteGenerator.generateFor(plate)` picks the `balanced` pattern, asks the active `Coach` for the post-resolve question, writes one `CoachNote` to the store, returns it; the Day Board plate row renders the whisper with `[sure]` + `[ask later]` | N/A |
| NO_PATTERN_MATCH | Plate has zero food entries (edge — v1 should never produce this, but is defensive) | `CoachNoteGenerator` returns `NoCoachQuestion`; no note is written; UI shows no whisper | Typed result |
| COACH_PORT_UNAVAILABLE | `Coach` port throws (only possible if a future AI rung misbehaves — `TemplateCoach` cannot throw) | Use-case catches, logs locally, returns `NoCoachQuestion`; UI shows no whisper; the log still committed | Calm degrade, no crash |
| STORE_WRITE_FAILURE | `CoachNoteStore.append` returns a `StoreFailure` | Use-case returns `CoachNoteGenerationFailure`; UI shows no whisper (the plate still committed via `RecordPlate` — whisper is best-effort, never blocks the log) | Typed result |
| AI_OFF_ACTIVE | Config selects `TemplateCoach` | All whispers resolve from the `en` key store; no network call; deterministic | N/A |
| AI_ON_FUTURE | Config selects an AI-backed rung (Epic 3) | Same shape returned; richer copy when available | N/A |
| DARK_MODE | UI rendered with `AppPalette.dark` | Whisper text reads `palette.ink`; `[sure]` pill uses `palette.sage`; `[ask later]` outline uses `palette.coach` (amber) | N/A |
| REDUCED_MOTION | OS reduce-motion enabled | Whisper entrance collapses to fade only (NFR8) | N/A |
| MULTIPLE_PLATES_QUICK | User commits two plates in rapid succession | Each plate gets its own whisper at its own row; no cross-row bleed; no stale whisper re-render | N/A |
| DAY_WITH_NOTES | Day Board reloads a day with prior notes | Each plate row that has a note renders the whisper; no double-fetch | N/A |
| DAY_WITHOUT_NOTES | Day Board reloads a day with prior plates but no notes (e.g. legacy data) | Plate row renders without the whisper; no error UI | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/entities/coach_note.dart` -- new; `CoachNote({ required int id, required int plateLogId, required CoachAnchor anchor, required String questionKey, required String text, required DateTime generatedAt })` value object
- `packages/domain_core/lib/src/ports/coach_note_store.dart` -- new; `abstract interface class CoachNoteStore { Future<CoachNoteAppendResult> append(CoachNote note); Future<List<CoachNote>> forPlate(int plateLogId); }` -- typed result for the append path
- `packages/domain_core/lib/src/results/coach_note_failure.dart` -- new; sealed `CoachNoteAppendResult = CoachNoteAppended(CoachNote note) | CoachNoteAppendFailure(StoreFailure cause)` + `CoachNoteGenerationResult = CoachNoteGenerated(CoachNote note) | NoCoachNoteGenerated(reason: ...)` -- typed result, never raw exceptions
- `packages/domain_core/lib/src/use_cases/generate_coach_note.dart` -- new; `class CoachNoteGenerator` taking `Coach` + `CoachNoteStore`; `Future<CoachNoteGenerationResult> generateFor(PlateLog plate)` -- picks composition pattern from plate's resolved food groups, asks the active coach, persists, returns typed result
- `packages/domain_core/lib/src/use_cases/record_plate.dart` -- modified; calls `CoachNoteGenerator.generateFor(plate)` AFTER the store commit, before returning the committed plate; the coach note is best-effort (never blocks the log)
- `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- `packages/domain_core/test/coach_note_generator_test.dart` -- new; pattern pick logic + best-effort semantics + AD-1 invariant holds
- `packages/integrations/lib/src/store/local_coach_note_store.dart` -- new; `LocalCoachNoteStore` writing to a new `coach_notes` drift table on the same encrypted store
- `packages/integrations/lib/src/store/schema.dart` -- modified; add `coach_notes` table (id, plate_log_id FK, anchor, question_key, text, generated_at) -- AD-3 invariant; same store, no second source
- `packages/integrations/lib/integrations.dart:1` -- barrel update
- `packages/integrations/test/local_coach_note_store_test.dart` -- new; append + forPlate; FK constraint to plate_logs
- `apps/client/lib/widgets/coach_whisper.dart` -- new; serif-italic whisper widget + `[sure]` sage pill + `[ask later]` amber outline pill; ≥48px tap targets; reduced-motion = fade only
- `apps/client/lib/state/coach_note_provider.dart` -- new; `coachNotesForPlateProvider` (FutureProvider.family<List<CoachNote>, int>); reads from `LocalCoachNoteStore` via the active store provider
- `apps/client/lib/widgets/plate_row.dart` -- modified; if the plate has any coach notes, render `CoachWhisper` below the food entry summary and above the balance arc
- `apps/client/lib/main.dart` -- already wires `coachProvider` in Story 2.1; verify `coachNoteGeneratorProvider` is constructed with `coachProvider` + `coachNoteStoreProvider`
- `apps/client/test/widgets/coach_whisper_test.dart` -- new; renders question + two buttons; reduced-motion = no shimmer; `[sure]` / `[ask later]` have accessible labels
- `apps/client/test/state/coach_note_provider_test.dart` -- new; provider returns notes for a plate; empty list when no notes

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/entities/coach_note.dart` -- `CoachNote` value type (id, plateLogId, anchor, questionKey, text, generatedAt)
- [ ] `packages/domain_core/lib/src/results/coach_note_failure.dart` -- sealed `CoachNoteAppendResult` + `CoachNoteGenerationResult` -- typed result, never raw exceptions
- [ ] `packages/domain_core/lib/src/ports/coach_note_store.dart` -- `abstract interface class CoachNoteStore` with `append` + `forPlate` -- AD-1 single port
- [ ] `packages/domain_core/lib/src/use_cases/generate_coach_note.dart` -- `CoachNoteGenerator` taking `Coach` + `CoachNoteStore`; pattern pick logic from plate's resolved food groups
- [ ] `packages/domain_core/lib/src/use_cases/record_plate.dart` -- call `CoachNoteGenerator.generateFor(plate)` AFTER the store commit, before returning the committed plate; best-effort (never blocks the log)
- [ ] `packages/domain_core/lib/domain_core.dart:19` -- barrel update
- [ ] `packages/domain_core/test/coach_note_generator_test.dart` -- pattern pick logic + best-effort + AD-1 invariant holds
- [ ] `packages/integrations/lib/src/store/schema.dart` -- add `coach_notes` table (FK to plate_logs)
- [ ] `packages/integrations/lib/src/store/local_coach_note_store.dart` -- `LocalCoachNoteStore` writing to `coach_notes`
- [ ] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [ ] `packages/integrations/test/local_coach_note_store_test.dart` -- append + forPlate; FK constraint
- [ ] `apps/client/lib/widgets/coach_whisper.dart` -- serif-italic whisper + `[sure]` sage pill + `[ask later]` amber outline; ≥48px; reduced-motion = fade only
- [ ] `apps/client/lib/state/coach_note_provider.dart` -- `coachNotesForPlateProvider` family
- [ ] `apps/client/lib/widgets/plate_row.dart` -- if plate has notes, render `CoachWhisper` below food entry summary and above the balance arc
- [ ] `apps/client/lib/main.dart` -- construct `coachNoteGeneratorProvider` with `coachProvider` + `coachNoteStoreProvider`
- [ ] `apps/client/test/widgets/coach_whisper_test.dart` -- renders question + two buttons; reduced-motion = no shimmer; a11y labels
- [ ] `apps/client/test/state/coach_note_provider_test.dart` -- provider returns notes for a plate; empty list when none
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given any successful `RecordPlate` commit, when the use-case returns, then exactly one `CoachNote` is written (or `NoCoachNoteGenerated` for an unmatched pattern) BEFORE the UI reflects the new plate (AD-3).
- Given a committed plate with a note, when the Day Board renders, then the plate row shows a serif-italic whisper with `[sure]` (sage pill) + `[ask later]` (quiet amber outline); both hit ≥48px; reduced-motion collapses entrance to fade only (UX-DR5, NFR7, NFR8).
- Given `TemplateCoach` is the active rung, when the generator runs, then copy resolves from the `en` key store; no network call; same pattern → same question (NFR3, AD-5).
- Given a future AI rung active, when the generator runs, then the same `CoachNote` shape is written; richer copy when available (AD-5).
- Given a plate with no matching pattern (defensive), when the generator runs, then `NoCoachNoteGenerated` is returned and no note is written; UI shows no whisper; the log still committed (FR4, calm degrade).
- Given dark mode, when the whisper renders, then text reads `palette.ink`; `[sure]` uses `palette.sage`; `[ask later]` uses `palette.coach` (amber); no color is the sole signal — the text carries the meaning (UX-DR5, NFR8).
- Given the AD-1 invariant, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker/mobile_scanner imports.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: `coach_note_generator_test.dart` passes; AD-1 invariant holds
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `local_coach_note_store_test.dart` passes; FK constraint holds
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: `coach_whisper_test.dart` + `coach_note_provider_test.dart` pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm the whisper only appears on plates that have a `CoachNote` in the store; legacy plates (no note) render without it.
- Confirm `[sure]` is sage and `[ask later]` is amber — never the inverse; never red.
- Confirm the whisper is the only serif-italic copy on the plate row; the food entry summary remains sans (UX-DR2).

## Suggested Review Order

**CoachNote entity (FR9, AD-3)**
- The persisted note; immutable after write; stored in the encrypted store.
  [`coach_note.dart`](../../packages/domain_core/lib/src/entities/coach_note.dart)

**CoachNoteStore port (AD-1)**
- The single port the use-case writes through; core never branches on the active store.
  [`coach_note_store.dart`](../../packages/domain_core/lib/src/ports/coach_note_store.dart)

**CoachNoteGenerator use-case (AD-3, AD-5)**
- Picks the composition pattern, asks the active coach, persists the note; best-effort.
  [`generate_coach_note.dart`](../../packages/domain_core/lib/src/use_cases/generate_coach_note.dart)

**RecordPlate integration (NFR2, AD-3)**
- The convergent mutation path now also fires the generator — every plate path (manual/barcode/photo) gets a whisper.
  [`record_plate.dart`](../../packages/domain_core/lib/src/use_cases/record_plate.dart)

**coach_notes drift table (FR9, AD-3)**
- One new table on the same encrypted store; FK to plate_logs.
  [`schema.dart`](../../packages/integrations/lib/src/store/schema.dart)

**CoachWhisper widget (UX-DR5, NFR7, NFR8)**
- Serif italic + `[sure]` + `[ask later]`; ≥48px; reduced-motion fade only.
  [`coach_whisper.dart`](../../apps/client/lib/widgets/coach_whisper.dart)

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
