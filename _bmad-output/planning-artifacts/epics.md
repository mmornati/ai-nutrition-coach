---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-openplate-2026-08-12/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-openplate-2026-08-13/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-openplate-2026-08-13/EXPERIENCE.md
  - _bmad-output/specs/spec-openplate/SPEC.md
---

# openplate - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for openplate, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1 (Photo logging): User can log a Plate Log by photographing it; the system recognizes foods (~85–95% food-ID) and resolves them to Database Foods with estimated quantities; a single well-lit photo returns recognized Food Entries in ≤3s on a midrange device; portion estimates carry an explicit uncertainty treatment (honest ranges, never false-exact kcal); ambiguous photos fall back to pick-from-closest-matches or manual entry without failing the log. (UJ-1)

FR2 (Barcode logging): User can log a Database Food by scanning its barcode via OFF lookup (no API key for reads); known barcodes resolve to a Database Food ≤2s; unknown barcodes reach a graceful "not found" state with a manual-add path and optional OFF contribution. (UJ-2)

FR3 (Manual logging): User can log a Plate Log by typing or voice-inputting a food name; partial text returns ranked matches with quantity presets; manual logging stays fully available with the AI tier off and offline. Voice input is speech-to-text transcription of food names only — never voice-print (FR-13). (UJ-5)

FR4 (Coach Note generation): After a Plate Log resolves, the system generates a Coach Note containing one Coach Question about balance/composition in plain, non-judgmental language; notes never contain calorie-shaming, streak-pressure, or restriction framing; AI on = richer, AI off = template-based on resolved food groups. Coach Question taxonomy is a bounded, curated set in v1 (localized), not unbounded generative questions. (UJ-1)

FR5 (Coach Question interaction): User can answer, dismiss, or request more depth on a Coach Question; answering produces a bounded follow-up Coach Note (one response, not a conversational loop); dismissing records no score, no streak, no guilt; interaction logged locally only. (UJ-1, UJ-4)

FR6 (Free-model quota, default AI rung): User can use AI estimation through a free-tier model with a documented per-day quota; quota exhaustion downgrades to the no-AI core with a plain-language 3-way choice (keep logging without AI / bring your own key / wait for reset), zero pressure; quota disclosed in-app and in docs. (UJ-4)

FR7 (BYOK): User can configure an OpenAI-compatible API key (stored encrypted on-device via Keychain/Keystore); key never transmitted to any OpenPlate-owned server nor included in telemetry; removing the key returns the app cleanly to the previous rung. (UJ-3)

FR8 (Local model path, v2 seam): The AI rung interface is provider-swappable so a local endpoint can be bound without rearchitecting FR-6/FR-7. Not in v1 — declare the seam now. (UJ-3)

FR9 (Local encrypted store): System stores all Plate Logs and Coach Note history in an encrypted local store (AES-256, platform-aware) with no server-side mirror and no account requirement; full feature set works with network revoked (offline-first); no telemetry transmitted without explicit opt-in; export available in portable format (CSV/JSON) — "lost my history" impossible by construction. (UJ-1, UJ-5)

FR10 (Sync): User can sync their local store across their own devices via a mechanism keeping data on user-controlled infrastructure only; no third-party sync; sync never drops or duplicates a Plate Log; retries silently on reconnection; a log flips to synced only after durable remote acknowledgment. (UJ-5)

FR11 (One-command self-host install): A non-expert can install and run OpenPlate on their own server with a single documented command (Docker → `openplate up` or equivalent brings the web client up against the local store in ≤5 min, CI smoke-tested); build is reproducible. (UJ-3)

FR12 (OSS release posture): Repository is public at launch with contributor/community path, permissive FOSS license (MIT/Apache), and a published No-Dark-Patterns Standard; telemetry off by default in all shipped builds (self-host and mobile); LICENSE, CONTRIBUTING, and the Standard exist at tag time.

FR13 (Adults-only, no under-13 accounts): v1 offers no child accounts, collects no data attributable to known children, uses no biometric identification (no face/voice-print anywhere); no signup flow can produce an under-13 profile; plain plate photos processed with no identity linkage; local inference stays on-device/local. Hard constraint on all FRs.

FR14 (Managed-oversight, v2): Parent/guardian oversight of a teen profile — read-only-from-guardian, framed as support not surveillance. Not in v1. Pending privacy-law review (OQ4). (UJ-1 via design)

FR15 (No-pressure UX standard): No surface uses countdown pressure, fabricated urgency, streak-guilt, reward-bait, or age-lying nudges; enforced as a QA checklist gate in CI/review with a named reviewer owning the pass; Tip Jar never interrupts a task flow. (UJ-4)

### NonFunctional Requirements

NFR1 (Performance budgets): Photo recognition resolves in ≤3s on a midrange device (FR-1); known barcode resolves in ≤2s (FR-2); the resolve shimmer settles within budget.

NFR2 (Convergence): All three entry paths (photo, barcode, manual/voice) converge on the same local Plate Log record and the same Coach Note flow — no UX divergence by input method (FR-1..3 feature NFR).

NFR3 (Tone & No-Dark-Patterns): All coach copy strings live in a localization/key store reviewed against the No-Dark-Patterns Standard, never hardcoded ad-hoc; unbounded generative coach questions are a v1 limit (bounded taxonomy only) (FR-4 NFR).

NFR4 (Privacy by architecture): At-rest data encrypted AES-256 (platform-aware: mobile Keychain/Keystore; web PBKDF2 session-cached, documented weaker — never overclaimed); telemetry off by default in all shipped builds; no data transmission without explicit opt-in; no hosted backend in v1 (FR-9, FR-12).

NFR5 (Offline-first): Full feature set works with network revoked; sync retries silently on reconnection; never drops or duplicates data (UJ-5, FR-9, FR-10).

NFR6 (Honest quantities): Quantities stored and rendered as honest ranges ("~2 fists"), never false-exact kcal; portion estimates carry uncertainty treatment; no red-as-guilt color, no score, no streak across any surface.

NFR7 (Accessibility floor): Touch targets ≥48px; keyboard + screen-reader parity (balance arc announces food groups, not just counts; status chips announce transitions); reduced-motion collapses to fade; color never the sole signal (arc always paired with text labels); localization key store for translation; dynamic type honored without truncation at largest setting.

NFR8 (Dark mode): Dark mode ships in v1 as a first-class skin (warm ink canvas + sage glow), follows device theming, respects reduce-motion.

NFR9 (Reproducible build): Self-host build is reproducible; production build via multi-stage Docker (cirruslabs/flutter:stable → `flutter build web --release` → nginx:alpine with try_files SPA).

NFR10 (No-account v1): No account, no signup in v1; single local identity; export available offline and never requires an account.

### Additional Requirements

- AD-1 Shared pure-Dart domain core (`packages/domain_core`) with no Flutter/SQLite/HTTP imports; `apps/client` and `packages/integrations` depend on it, it depends on nothing; UI never imports drift/dio/mobile_scanner directly — only through ports.
- AD-2 One responsive Flutter codebase for iOS/Android/web; `flutter build web` serves the self-host client; desktop deferred, not a separate codebase.
- AD-3 Local encrypted store is the single source of truth: every domain mutation flows through a core use-case that commits before UI reflects it; Riverpod UI state is derived, never a second source; sync reads from the store and never writes outside it.
- AD-4 One `FoodCatalog` port in front of OFF + USDA with a local cache adapter; photo, barcode, and manual/voice entry paths all call the same port.
- AD-5 AI is a swappable tier behind one `AiRung` port with exactly one active implementation chosen by config: `no-op` (complete no-AI core), `hosted-quota`, `byok`, `local` (v2 seam). Core never branches on which rung is active — only on whether a port call succeeded.
- AD-6 Offline-first writes; sync is an adapter draining a durable outbox queue to user-controlled infrastructure only; retries silently on reconnection; a log is synced only after durable remote acknowledgment; status chips derive from queue state.
- AD-7 Every user-facing coach string is a keyed, localized template in the key store; no string interpolation in widgets; No-Dark-Patterns Standard is a QA checklist gate in CI/review owned by a named reviewer.
- AD-8 At-rest encryption honest and platform-aware: mobile AES-256 via sqlite3mc build hook, 32-byte DB key from Keychain/Keystore; web same drift schema on sqlite3.wasm, passphrase-derived PBKDF2 key in memory for the session only, documented as weaker; BYOK key always via Keychain/Keystore, never leaves the device.
- AD-9 Export is a read-only `Exporter` port streaming the store's Plate Logs to CSV/JSON on demand; available offline; never requires an account.
- Monorepo structure: `apps/client`, `packages/domain_core`, `packages/integrations`, `infra/` (Docker + nginx for self-host web), `melos.yaml` on Dart pub workspaces.
- Stack web-verified current Aug 13 2026: Flutter 3.47.0, Dart ^3.13.0, flutter_riverpod 3.4.2 (codegen), drift 2.34.3 / drift_dev 2.34.x, sqlite3 3.5.x (sqlite3mc build hook), flutter_secure_storage 11.0.0, mobile_scanner 7.4.0, image_picker 1.2.3, dio 5.11.0, melos 8.2.2, patrol 4.8.0 / patrol_cli 4.6.1; test/flutter_test/integration_test SDK-bundled.
- Conventions: domain entities in `domain_core` (PlateLog, FoodEntry, DatabaseFood, CoachNote, CoachQuestion); ports named by role (`FoodCatalog`, `Exporter`, `AiRung`); files kebab-case; packages snake_case; local DB ids autoincrement ints; external refs kept verbatim (OFF barcode strings, USDA FDC ids); dates UTC ISO-8601 rendered local; errors typed domain results (nearest-match, not-found, quota-exhausted), never raw exceptions crossing ports.
- Deferred (v2 seams reserved, not v1): local-model AI rung (FR-8), managed-oversight (FR-14), desktop clients, depth/LiDAR portion estimation, OFF write-back, cross-device sync concrete path (self-host relay vs manual export/import — build-time decision), free-model quota provider (Cloudflare Workers AI vs Gemini free tier — build-time adapter selection).

### UX Design Requirements

UX-DR1 (Design token system): Implement the scoped token system (Sage & Cream palette: canvas #F6F3ED / surface #FDFCF9 / ink #2C2A25 / muted #716B5E / accent-sage #6E8376 / sage-deep #54685C / hairline #E2DCD0 / amber-warm #A45B31, dark equivalents; 4px spacing scale 8/12/16/20/24/32/40; radii sm5/md24/lg28/sheet-top34/pill26/full999; typography scale). Color rule: color is for coaching states only — never red-as-guilt; one sage accent.

UX-DR2 (Typography system): Three strict voices — humanist sans (all UI text), serif italic Georgia (coach whisper only, leading 1.6), mono (status chips, quantity, arc note, kicker, footmark). No role crossover.

UX-DR3 (Day Board surface): Vertical stack of plate rows (Breakfast/Lunch/Dinner + open dents) divided by hairline rules, generous whitespace; no cards, no fills, no dashboard grid; full day always visible; capture is one floating thumb-reach (no scroll-to-button guardrail).

UX-DR4 (Balance arc component): Per-meal 4-segment ring (Veg&Fruit / Protein / Starch / Dairy), sage fill on a hairline track; arcnote "3 of 4" in mono; screen reader announces food groups, not a count; Color never sole signal.

UX-DR5 (Coach whisper component): Two plate-level anchors — post-resolve whisper on just-logged plate (SM-2 learning moment: "Nice balance — two colors of veg, lean protein. Want the fiber breakdown?") and open-plate hint on next/empty plate ("Greens would round this plate out…"); both serif-italic questions with [sure] sage pill + [ask later] quiet outline (amber); ask-later defers quietly, no nag; only post-resolve counts toward SM-2.

UX-DR6 (Status chips): `· local` (default) → `· pending` (queued) → `· synced` (sage-tint wash); calm flip `· syncing → · synced`, never a spinner; mono ~9.5px, never louder than the coach.

UX-DR7 (Capture sheet): Bottom sheet fan-out from `+` fab — Snapshot dominant (sage-deep tile) / Scan a barcode / Type or talk (subtiles); quick-repeat re-shoot affordance for multi-meal capture; closes back to Day Board after a log.

UX-DR8 (Week strip): 7 mini-dots at Day Board bottom; sage fill on balanced days only (neutral outline otherwise); tap-a-day navigation; mono whisper "no streaks · no countdowns · no guilt"; no week-report screen in v1.

UX-DR9 (Settings surfaces): One calm list — Your AI (FR-6 quota, FR-7 BYOK, FR-8 local-model seam declared v2) / Your data (export CSV/JSON + sync status, "lost my history" impossible by construction) / Tip Jar (tipjar-tinted, never interrupts a task flow) / About (self-host identity + footmark) — each opening a sub-screen on tap.

UX-DR10 (State patterns): Empty day = quiet dents ("An open, quiet place.", no accusation); partial day mixes logged plates + open dents; balanced day = full arcs + calm sage week dot (+ optional depth offer, never congratulation); resolving = quiet inline shimmer + "reading…" + "Snapshot accepted — the plate is settling."; ambiguous food = closest matches + manual quantity, never fails the log; quota exhausted = 3-way plain-language choice, no countdown, "don't show again" easter egg; follow-up depth = single bounded response.

UX-DR11 (Interaction primitives): Tap-to-expand plate rows (expanded = edit surface, one tap to correct food/quantity → SM-3 signal); ranked matches + quantity presets for manual/voice (pick match + "~1 fist"); capture fan-out; quick-repeat re-shoot; tap-a-day week navigation; no-countdown quota choice.

UX-DR12 (Responsive/multi-platform): One responsive Flutter layout per DESIGN/EXPERIENCE for iOS + Android + web (self-host); desktop deferred; dark mode first-class skin following device theming, respects reduce-motion.

UX-DR13 (Accessibility & ban list): Enforce accessibility floor (48px targets, keyboard+screen-reader parity, reduced-motion fade, color never sole signal, key store localization, dynamic type) and the banned-everywhere list: streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, resolve spinners (FR-15).

### FR Coverage Map

FR1 (Photo logging): Epic 1 - Capture the plate
FR2 (Barcode logging): Epic 1 - Capture the plate
FR3 (Manual logging): Epic 1 - Capture the plate
FR4 (Coach Note generation): Epic 2 - A coach, not a calculator
FR5 (Coach Question interaction): Epic 2 - A coach, not a calculator
FR6 (Free-model quota, default AI rung): Epic 3 - Your AI, your rules
FR7 (BYOK): Epic 3 - Your AI, your rules
FR8 (Local model path, v2 seam): Epic 3 - Your AI, your rules
FR9 (Local encrypted store): Epic 4 - Your data stays yours
FR10 (Sync): Epic 4 - Your data stays yours
FR11 (One-command self-host install): Epic 4 - Your data stays yours
FR12 (OSS release posture): Epic 4 - Your data stays yours
FR13 (Adults-only, no under-13 accounts): Epic 5 - Trust by default
FR14 (Managed-oversight, v2): Epic 5 - Trust by default
FR15 (No-pressure UX standard): Epic 5 - Trust by default

## Epic List

### Epic 1: Capture the plate (the core loop)

Log a plate with photo, barcode, or voice/typing — it resolves to food entries with honest quantities and lands on your Day Board.

**User outcome:** After this epic, a user can capture any meal three ways and see it as a quiet, honest row on their Day Board.

**FRs covered:** FR1, FR2, FR3

**Implementation notes:** Monorepo scaffold lands here (Story 1.1), plus `domain_core` and the encrypted local store foundation (AD-3/AD-8 mobile-first), Day Board surface, capture sheet fan-out, honest-quantity rendering, accessibility floor + dark mode for these flows. Solo dependency: the MVP loop every later epic builds on.

### Epic 2: A coach, not a calculator (the coaching loop)

After each plate, get one calm, non-judgmental question — and choose to answer, dismiss, or go deeper. No scores, no streaks, no guilt.

**User outcome:** After this epic, a user gets a valuable balance question on a logged plate and controls the interaction with zero pressure.

**FRs covered:** FR4, FR5

**Implementation notes:** Coach Note generation (template-based + AI-on richer), Coach Question bounded taxonomy + key store localization (AD-7, NFR3), whisper anchors post-resolve + open-plate hint, [sure]/[ask later], single bounded follow-up. Standalone: app logs fine with coach off.

### Epic 3: Your AI, your rules (the AI tier ladder)

Use the free quota by default, plug in your own API key, and keep a reserved seam for a fully local model.

**User outcome:** After this epic, a user controls which AI estimation rung serves them and can toggle it honestly, with zero pressure at quota exhaustion.

**FRs covered:** FR6, FR7, FR8 (seam declared, v2)

**Implementation notes:** One `AiRung` port, exactly one active impl by config (AD-5): no-op/hosted-quota/byok/local-seam; quota-exhausted 3-way plain-language choice (FR-6/UJ-4); BYOK encrypted on-device via Keychain/Keystore, never transmitted (AD-8); free-quota provider is a build-time adapter choice (OQ-2).

### Epic 4: Your data stays yours (data ownership & self-host)

Your history is encrypted on-device, exportable offline, optionally synced to your own infrastructure — and the whole thing self-hosts with one command.

**User outcome:** After this epic, a user's history is impossible to lose, portable offline, optionally mirrored only to infrastructure they control, and runnable on their own server in ≤5 min.

**FRs covered:** FR9, FR10, FR11, FR12

**Implementation notes:** Completes platform-aware encryption matrix (mobile sqlite3mc AES-256; web sqlite3.wasm PBKDF2 session-memory, documented weaker — AD-8); read-only `Exporter` port CSV/JSON offline, no account (AD-9); durable outbox sync to user-controlled infra only, chips derive from queue state (AD-6); one-command self-host via infra/ Docker multi-stage (cirruslabs/flutter:stable → flutter build web --release → nginx:alpine try_files SPA, NFR9); OSS release posture LICENSE+CONTRIBUTING+No-Dark-Patterns Standard at tag; telemetry off by default all builds. Sync concrete path is a build-time decision (OQ-1). Stories land squarely within dev-agent context the more natural way.

### Epic 5: Trust by default (adults-only & no dark patterns)

No under-13 accounts, no biometrics, no pressure mechanics — enforced by a named QA gate, not just intent.

**User outcome:** After this epic, adults-only and no-pressure guarantees are provable, not aspirational.

**FRs covered:** FR13, FR14 (seam, v2), FR15

**Implementation notes:** No under-13 accounts / no biometrics / no identity linkage (FR-13); managed-oversight seam declared v2, pending COPPA privacy-law review — phase-blocker OQ-4 (FR-14); No-Dark-Patterns Standard as QA checklist gate in CI/review with a named reviewer (FR-15, AD-7, NFR3); banned list enforcement across surfaces.

## Epic 1: Capture the plate (the core loop)

Log a plate with photo, barcode, or voice/typing — it resolves to food entries with honest quantities and lands on your Day Board.

**FRs:** FR1, FR2, FR3

### Story 1.1: Scaffold the monorepo and reproducible build

As a contributor,
I want a bootstrapped melos monorepo with a Flutter client, a pure-Dart domain core, an integrations package, and a self-host Docker build,
So that every later feature lands in a consistent, reproducible base.

**Acceptance Criteria:**

**Given** an empty repository
**When** `melos bootstrap` runs
**Then** `apps/client`, `packages/domain_core`, and `packages/integrations` resolve under Dart pub workspaces with pinned versions (Flutter 3.47.0, Dart ^3.13.0)
**And** `packages/domain_core` has zero imports from Flutter, drift, dio, or mobile_scanner (AD-1); the infra Dockerfile produces a self-host web build via multi-stage `cirruslabs/flutter:stable → flutter build web --release → nginx:alpine try_files` (NFR9, FR11 seam); CI runs `flutter analyze` + smoke test on every PR (reproducible build, NFR9); Sage & Cream light+dark design tokens are scaffolded as the shared token source (UX-DR1, UX-DR2).

### Story 1.2: Record a plate in the local encrypted store

As an adult tracking meals,
I want every entry path to record into a single encrypted local store,
So that my history lives on-device as the single source of truth.

**Acceptance Criteria:**

**Given** no existing data
**When** the `RecordPlate` use-case commits a PlateLog with FoodEntries
**Then** the plate persists in the drift store before any UI reflects it (AD-3)
**And** only `PlateLog`/`FoodEntry` tables exist (no over-creation, per database-principle); data is encrypted at rest via the platform-aware key — mobile AES-256 sqlite3mc + 32-byte Keychain/Keystore key (AD-8, NFR4); quantities render as honest ranges ("~2 fists"), never false-exact kcal (NFR6); every mutation flows through a core use-case with Riverpod state derived, never a second source (AD-3).

### Story 1.3: Day Board — today's plates

As a tracker,
I want a calm vertical Day Board showing today's plates with balance arcs,
So that I can see my day at a glance without cards, dashboards, or judgment.

**Acceptance Criteria:**

**Given** logged plates today
**When** the Day Board loads
**Then** plates render as a vertical stack (Breakfast/Lunch/Dinner + open dents) divided by hairline rules, with no cards or fills (UX-DR3)
**And** each meal shows a 4-segment balance arc (Veg&Fruit/Protein/Starch/Dairy) with sage fill on a hairline track and an arcnote "3 of 4" in mono; screen reader announces food groups, not a count; color is never the sole signal (UX-DR4, NFR7); each row carries a `· local` status chip (base state — pending/synced arrive with Epic 4) (UX-DR6); an empty day shows quiet dents ("An open, quiet place.") with no accusation (UX-DR10); dark mode and reduce-motion apply (NFR8); touch targets are ≥48px and dynamic type is honored at the largest setting (NFR7).

### Story 1.4: Week strip — tap-a-day navigation

As a tracker,
I want a 7-dot week strip under the Day Board,
So that I can quietly navigate past days with no streaks, countdowns, or guilt.

**Acceptance Criteria:**

**Given** a week of data
**When** the strip renders at the Day Board bottom
**Then** 7 mini-dots show sage fill on balanced days only and a neutral outline otherwise (UX-DR8)
**And** tapping a day loads that day's plate stack; no week-report screen exists (UX-DR8); the mono whisper "no streaks · no countdowns · no guilt" is present; tapping an empty day shows quiet dents (UX-DR10).

### Story 1.5: Type or talk a food, get ranked matches (FR3)

As a tracker,
I want to log by typing or speaking a food name and picking a ranked match with a quantity preset,
So that I can log honestly even when photo or barcode is unavailable or the AI tier is off.

**Acceptance Criteria:**

**Given** manual entry
**When** partial text is typed
**Then** ranked matches resolve from the `FoodCatalog` port (OFF+USDA, cached) and display with quantity presets (FR3, UX-DR11)
**And** voice input transcribes only the food name — never a voice-print/biometric (FR3, FR13); with no network and the AI tier off the log still succeeds from local cache (FR3, UJ-5); a no-match path offers a typed manual record rather than failing; confirmed matches commit through the same `RecordPlate` use-case as every other path (NFR2).

### Story 1.6: Capture sheet fan-out

As a tracker,
I want the `+` capture sheet to reveal one dominant Snapshot option plus Scan a barcode and Type or talk,
So that the fastest honest action is always one thumb-reach away.

**Acceptance Criteria:**

**Given** the Day Board
**When** `+` is tapped
**Then** a bottom sheet fans out Snapshot (dominant sage-deep tile) / Scan a barcode / Type or talk (subtiles) (UX-DR7)
**And** a quick-repeat re-shoot affordance appears after a log; the sheet closes back to the Day Board; capture is reachable without scroll; no countdown or urgency anywhere (FR15, UX-DR13).

### Story 1.7: Scan a barcode on packaged food (FR2)

As a tracker,
I want to point my camera at a barcode and get a recognized food in ≤2s,
So that packaged foods log fast without typing.

**Acceptance Criteria:**

**Given** camera permission granted
**When** a known barcode is scanned via mobile_scanner
**Then** the `FoodCatalog` port resolves it through OFF (no API key needed for reads) to a DatabaseFood with local cache, in ≤2s on a midrange device (FR2, NFR1)
**And** an unknown barcode shows a graceful "not found" state with a manual-add path and optional OFF contribution — logging never fails (FR2); a cached resolution works offline (FR9, UJ-5); permission denial falls back to manual entry with screen-reader parity (NFR7).

### Story 1.8: Photograph a plate (FR1)

As a tracker,
I want to snap my plate and have it resolve to foods with estimated quantities,
So that logging is near-frictionless and I still own every choice.

**Acceptance Criteria:**

**Given** photo access
**When** a well-lit single photo is captured
**Then** it dispatches through the `AiRung` port to a recognizer (no-op rung active in Epic 1; real recognizers land in Epic 3 — AD-5)
**And** resolved foods present DatabaseFood + honest quantity ranges for confirm/edit (FR1, NFR6); ambiguity offers closest matches + manual quantity, the log never fails (FR1, UX-DR10); with AI off/offline it degrades honestly (recognize → closest-matches → manual) (UJ-4); resolution shows a quiet inline shimmer + "reading…" — never a spinner (UX-DR10, FR15); ≤3s on midrange (NFR1); the photo is processed with no identity linkage — no face/voice biometric anywhere (FR13).

## Epic 2: A coach, not a calculator (the coaching loop)

After each plate, get one calm, non-judgmental question — and choose to answer, dismiss, or go deeper. No scores, no streaks, no guilt.

**FRs:** FR4, FR5

### Story 2.1: Coach taxonomy and localization key store

As a tracker,
I want every coach question drawn from a bounded, curated set stored as keyed, localized strings,
So that the tone is consistent, translatable, and never ad-hoc.

**Acceptance Criteria:**

**Given** the coaching loop
**When** a coach string is needed
**Then** it resolves from the key store by key, never hardcoded in a widget (AD-7)
**And** the v1 taxonomy is a bounded curated set — one localized question per food-group/composition pattern, no unbounded generative questions (NFR3, FR4); every string passes the No-Dark-Patterns tone review owned by a named reviewer (AD-7, FR15); the `en` locale ships with the key-store structure ready for more (NFR3).

### Story 2.2: Coach Note generation — post-resolve whisper (FR4)

As a tracker,
I want a calm, non-judgmental Coach Note with one balance/composition question after each resolved plate,
So that I learn quietly without being judged or lectured.

**Acceptance Criteria:**

**Given** a resolved plate
**When** resolution completes
**Then** a serif-italic whisper appears at the plate level: plain, non-judgmental, one Coach Question (FR4, UX-DR5)
**And** no calorie-shaming, streak-pressure, or restriction framing in any copy (FR4, NFR3); AI-on renders richer from the recognizer's food groups, AI-off renders the template-based variant (FR4, AD-5); the whisper presents `[sure]` (sage pill) + `[ask later]` (quiet outline, amber) (UX-DR5); only the post-resolve anchor counts toward the engaged-coach-note signal (SM-2); the note persists locally (FR9).

### Story 2.3: Coach Question interaction — answer / dismiss / depth (FR5)

As a tracker,
I want to answer, dismiss, or request more depth on a Coach Question,
So that I control the conversation and never feel chased or guilted.

**Acceptance Criteria:**

**Given** a Coach Question on a plate
**When** I choose `[sure]`
**Then** a depth answer produces exactly one bounded follow-up Coach Note — no conversational loop (FR5)
**And** choosing `[ask later]` or dismissing records no score, no streak, no guilt (FR5, UX-DR5) and defers quietly with no nag; the open-plate hint anchor shows on next/empty plates ("Greens would round this plate out…") (UX-DR5); all interaction is logged locally only, never transmitted without opt-in (FR9, NFR4).

## Epic 3: Your AI, your rules (the AI tier ladder)

Use the free quota by default, plug in your own API key, and keep a reserved seam for a fully local model.

**FRs:** FR6, FR7, FR8 (seam)

### Story 3.1: AiRung port with swappable implementations

As a developer contributing to openplate,
I want one `AiRung` port with exactly one active implementation chosen by config,
So that the core never branches on which AI rung is active.

**Acceptance Criteria:**

**Given** the AI tier design
**When** any estimator is needed
**Then** the core calls the `AiRung` port and receives typed results (recognized foods, quota-exhausted, or failure) without knowing the active implementation (AD-5)
**And** four implementations exist behind it: `no-op` (complete no-AI core), `hosted-quota`, `byok`, and `local` (declared v2 seam, throws-on-use) (FR8); config selects exactly one active rung; core behavior tests pass against `no-op` (FR-6 seam, UJ-4).

### Story 3.2: Hosted-quota rung with honest 3-way quota exhaustion (FR6)

As a tracker,
I want a free-tier AI quota by default that, when exhausted, offers a plain-language 3-way choice,
So that I decide honestly instead of being nickel-and-dimed.

**Acceptance Criteria:**

**Given** the default AI rung
**When** a photo needs estimation
**Then** the hosted-quota rung calls the configured free provider (provider is a build-time adapter choice — OQ-2) within the per-day quota (FR6)
**And** on exhaustion the app shows a plain-language 3-way choice — keep logging without AI / bring your own key / wait for reset — with zero pressure, no countdown (FR6, UJ-4, UX-DR10); quota is disclosed in-app and in docs (FR6); choosing to continue downgrades instantly to the no-AI core with `· local` posture, no dead-end (FR6, AD-5).

### Story 3.3: BYOK — bring your own API key (FR7)

As a self-hoster,
I want to configure my own OpenAI-compatible API key stored encrypted on-device,
So that I use my own quota and my key never leaves my device.

**Acceptance Criteria:**

**Given** the BYOK rung active
**When** I enter an API key in the Your AI settings
**Then** the key persists via Keychain (iOS/macOS) / Keystore (Android) encrypted, is never transmitted to any OpenPlate-owned server, and never appears in telemetry (FR7, AD-8)
**And** removing the key returns the app cleanly to the previous rung with no stale state; the key is never logged or reflected in UI plaintext (FR7, NFR4); the Your AI settings surface shows quota (hosted) or key status (BYOK) plus the declared local-model path as a v2 seam (FR8, UX-DR9).

## Epic 4: Your data stays yours (data ownership & self-host)

Your history is encrypted on-device, exportable offline, optionally synced to your own infrastructure — and the whole thing self-hosts with one command.

**FRs:** FR9, FR10, FR11, FR12

### Story 4.1: Encrypted store — web rung

As a self-hoster,
I want the same encrypted store experience on the web client,
So that my history is protected everywhere with honest, platform-appropriate encryption.

**Acceptance Criteria:**

**Given** the self-host web build
**When** the web client opens the store
**Then** the same drift schema runs on sqlite3.wasm with a passphrase-derived PBKDF2 key held in memory for the session only, never persisted (AD-8, NFR4)
**And** the schema is identical to mobile (NFR2 convergence); the Your data surface plainly states web protection is "session-sealed, not at-rest encrypted" — documented as weaker, never overclaimed (AD-8, NFR4); reloading without the passphrase reveals no data.

### Story 4.2: Exporter — CSV/JSON offline, no account

As a tracker,
I want to export my history as CSV or JSON,
So that my data is portable and "lost my history" is impossible by construction.

**Acceptance Criteria:**

**Given** stored history
**When** I request an export in Your data
**Then** the read-only `Exporter` port streams PlateLogs + FoodEntries to CSV and JSON with UTC ISO-8601 dates, fully offline, with no account (AD-9, FR9, NFR10, UX-DR9)
**And** export covers the visible day, the week, or all history; an empty history exports a valid empty file with headers; errors are typed domain results, never raw exceptions (conventions).

### Story 4.3: Durable outbox sync to user-controlled infrastructure (FR10)

As a self-hoster,
I want my plate logs to sync only to infrastructure I control,
So that my history mirrors across my own devices without ever dropping or duplicating a log.

**Acceptance Criteria:**

**Given** sync configured to user-controlled infra
**When** a PlateLog commits
**Then** the commit first lands in a durable outbox queue before UI reflects it; the sync adapter drains to user-controlled infrastructure only — no third party, never an OpenPlate-owned server (FR10, AD-6)
**And** a log flips to `· synced` only after durable remote acknowledgment — not before (FR10); connectivity loss retries silently on reconnection with no drops or duplicates (FR10, NFR5); status chips (`· local` / `· pending` / `· synced`) derive from queue state with a calm flip, never a spinner (UX-DR6); the concrete transport path (self-host relay vs manual export/import) remains a build-time decision behind this adapter (OQ-1).

### Story 4.4: One-command self-host install (FR11)

As a self-hoster,
I want to run OpenPlate on my own server with one documented command,
So that I'm up and running on my infrastructure in ≤5 minutes.

**Acceptance Criteria:**

**Given** a fresh server with Docker
**When** I run the single documented command (e.g. `openplate up`)
**Then** the multi-stage Docker build (cirruslabs/flutter:stable → `flutter build web --release` → nginx:alpine with `try_files` SPA) produces the web client against the local store in ≤5 min (FR11, NFR9, AD-2)
**And** CI runs a smoke test of this flow on every PR; the build is reproducible (NFR9); the served app is the offline-first web client on my own infrastructure with no hosted backend (NFR4).

### Story 4.5: Telemetry and privacy posture

As a user,
I want zero telemetry by default and no data leaving my device without my explicit action,
So that privacy is the default, not a setting.

**Acceptance Criteria:**

**Given** any shipped build (self-host or mobile)
**When** the app runs normally
**Then** no telemetry is transmitted in any build by default — no network calls unless the user enables sync or BYOK explicitly (FR9, FR12, NFR4)
**And** the Tip Jar never interrupts a task flow (FR15, UX-DR9); privacy claims in-app and in docs match reality — no hosted backend in v1 (NFR4).

### Story 4.6: OSS release posture — LICENSE, CONTRIBUTING, No-Dark-Patterns Standard (FR12)

As a contributor,
I want a public repo with a permissive license, a contributor path, and a published No-Dark-Patterns Standard at every tag,
So that the project is genuinely open and the no-pressure promise is enforceable.

**Acceptance Criteria:**

**Given** the release pipeline
**When** a version is tagged
**Then** LICENSE (MIT/Apache), CONTRIBUTING, and the No-Dark-Patterns Standard exist at tag time (FR12)
**And** the repository is public with a contributor/community path; CONTRIBUTING documents build, test, and smoke commands; the release checklist includes a No-Dark-Patterns Standard sign-off as a gate (FR15, AD-7).

## Epic 5: Trust by default (adults-only & no dark patterns)

No under-13 accounts, no biometrics, no pressure mechanics — enforced by a named QA gate, not just intent.

**FRs:** FR13, FR14 (seam, v2), FR15

### Story 5.1: Adults-only, no under-13 accounts, no biometrics (FR13)

As the product,
I want the v1 surface to be strictly adults-only with no biometric identification anywhere,
So that no flow can produce an under-13 profile and no identity is ever derived from a plate photo.

**Acceptance Criteria:**

**Given** any signup or data-collection surface
**When** a user interacts
**Then** no child accounts exist and no flow can produce an under-13 profile (FR13)
**And** no face or voice-print biometric is used anywhere — voice stays transcription-only (FR3, FR13); plate photos are processed with no identity linkage; local inference stays on-device (FR13, NFR4).

### Story 5.2: Managed-oversight seam declared, COPPA-blocked (FR14, v2)

As the product,
I want the parent/guardian managed-oversight concept expressed as a declared v2 seam,
So that the architecture doesn't preclude it while it remains out of v1 pending privacy-law review.

**Acceptance Criteria:**

**Given** the v2 roadmap
**When** managed-oversight is considered
**Then** it is documented as a declared seam — read-only-from-guardian, framed as support not surveillance — with no v1 implementation (FR14)
**And** it is explicitly phase-blocked pending COPPA/privacy-law review (OQ-4); no under-13 or teen profile machinery ships in v1 (FR13).

### Story 5.3: No-Dark-Patterns Standard as a named QA gate (FR15)

As the product,
I want the banned list enforced as a QA checklist gate in CI/review owned by a named reviewer,
So that no-pressure UX is provable, not aspirational.

**Acceptance Criteria:**

**Given** any merge to release
**When** the QA gate runs
**Then** a named reviewer owns the No-Dark-Patterns checklist pass covering the banned-everywhere list — streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, resolve spinners (FR15, UX-DR13, AD-7)
**And** the gate runs in CI/review with a durable sign-off; every user-facing coach string already lives in the key store passing the NDP tone review (NFR3, AD-7).

### Story 5.4: Accessibility floor enforced across all surfaces

As a user with accessibility needs,
I want the full a11y floor verified across every surface,
So that nothing ships that fails screen readers, keyboards, or motion preferences.

**Acceptance Criteria:**

**Given** all shipped surfaces
**When** the a11y pass runs
**Then** touch targets are ≥48px, keyboard + screen-reader parity holds (balance arc announces food groups; status chips announce transitions), reduced-motion collapses to fade, color is never the sole signal, dynamic type is honored at the largest setting (NFR7, UX-DR13)
**And** dark mode first-class skin follows device theming and respects reduce-motion on every surface (NFR8, UX-DR12); the a11y floor is part of the named-reviewer QA gate (FR15).