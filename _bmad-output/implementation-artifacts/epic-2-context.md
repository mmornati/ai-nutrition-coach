# Epic 2 Context: A coach, not a calculator (the coaching loop)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

After each plate, the user gets one calm, non-judgmental coach question and chooses to answer, dismiss, or go deeper — with zero scores, streaks, or guilt mechanics. This epic activates the coaching loop on top of the three capture paths Epic 1 shipped, while Epic 3 will later swap the no-op AI rung for richer coach copy.

## Stories

- Story 2.1: Coach taxonomy and localization key store
- Story 2.2: Coach Note generation — post-resolve whisper (FR4)
- Story 2.3: Coach Question interaction — answer / dismiss / depth (FR5)

## Requirements & Constraints

- One Coach Question per logged plate, in plain non-judgmental language — never calorie-shaming, streak-pressure, or restriction framing.
- v1 coach question set is a bounded curated taxonomy (one localized question per food-group/composition pattern), not unbounded generative output.
- Coach copy resolves from a keyed localization store; no string interpolation in widgets; No-Dark-Patterns Standard gates every string.
- AI-on renders richer copy from the recognizer's food groups; AI-off renders the template-based variant — core code never branches on the active rung.
- Two whisper anchors: post-resolve whisper on just-logged plate, and open-plate hint on next/empty plate.
- Interaction is logged locally only (no transmission without explicit opt-in); depth is exactly one bounded follow-up — never a conversational loop.
- Ask-later and dismiss produce no score, no streak, no nag; only the post-resolve anchor counts toward the engaged-coach-note signal.
- All coach copy strings must work in dark mode, respect reduce-motion, and honor dynamic type without truncation.

## Technical Decisions

- Hexagonal ports-and-adapters with a pure-Dart domain core (no Flutter/SQLite/HTTP imports in `packages/domain_core`); UI code calls the coach through a port, never by importing a store or AI client directly (AD-1).
- Every domain mutation flows through a core use-case that commits to the encrypted local store before any UI reflects it; Riverpod state is derived, never a second source (AD-3).
- Coach is exposed via a `Coach` port returning a typed result (one localized question + the anchor type); the active implementation is selected by config — template-based by default, AI-rung-backed when Epic 3 wires the byok/hosted-quota rung into the same port.
- Localization key store lives as a typed map in `packages/integrations` (single source for v1 `en` locale); each key maps to a verbatim copy string; AI-off resolves to a deterministic template; AI-on resolves through the `AiRung` port already shipped in Story 1.8 — no new port.
- Coach Note persistence reuses the existing encrypted drift store (Story 1.2); a new `CoachNote` table records note text, anchor type, plate id, and an interaction log (answered / dismissed / asked-later / depth-follow-up) — no extra data goes outside the store.
- All user-facing coach strings ship in the `en` locale with the key-store structure ready for additional locales; the key store is reviewable as a single file under `packages/integrations/lib/src/l10n/coach_strings.dart` so the named NDP reviewer can sign off in one place.
- Stack pins unchanged: Flutter 3.47.0, Dart ^3.13.0, flutter_riverpod 3.4.2, drift 2.34.3, flutter_secure_storage 11.0.0; conventions from Epic 1 carry over (kebab-case files, snake_case packages, typed domain results, no raw exceptions crossing ports).

## UX & Interaction Patterns

- Coach whisper is serif italic (Georgia), leading 1.6 — reserved for the coach voice, never used elsewhere (UX-DR2).
- Whisper presents two pill buttons: `[sure]` (sage accent) and `[ask later]` (quiet amber outline). Pressing `[sure]` opens the depth answer; `[ask later]` defers quietly with no nag.
- Post-resolve whisper appears at the plate level immediately after a log lands on the Day Board; open-plate hint appears on next/empty plates ("Greens would round this plate out…").
- Depth answer is a single bounded follow-up Coach Note; never a conversational loop. After the follow-up the interaction is closed locally.
- Status chips (`· local` default) and arcnotes remain mono and quieter than the coach whisper; nothing else changes visual weight when a coach note is present.
- Reduced-motion users get a fade-only transition into the whisper; color is never the sole signal (the text is the signal, sage pill is the affordance).
- Accessibility floor: touch targets ≥48px on `[sure]` and `[ask later]`; screen reader announces the question text and the two options by label, not by color; dynamic type honored without truncation at the largest setting.

## Cross-Story Dependencies

- Story 2.2 and 2.3 depend on the capture paths shipped in Epic 1 (1.5, 1.7, 1.8): the coach whisper fires after a `PlateLog` commits through `RecordPlate`.
- Story 2.1's key store is a leaf dependency for 2.2 and 2.3; ship 2.1 first.
- The `CoachNote` persistence reuses the encrypted store from Story 1.2; the same AD-3 commit-before-reflect rule applies.
- The `AiRung` port from Story 1.8 is the seam Story 2.2 reads from for AI-on richer copy; the no-op rung in Epic 1 means Epic 2 ships with template-based copy by default.
- Epic 3 (AI rung ladder) will not require changes to Epic 2's `Coach` port — it swaps the active rung implementation behind the existing port.
- The No-Dark-Patterns QA gate (Epic 5, Story 5.3) signs off on every string added by this epic, but the gate itself lands later — Epic 2's NDP conformance is enforced at review time by the named reviewer.
