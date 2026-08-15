# Epic 1 Context: Capture the plate (the core loop)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Log a plate with photo, barcode, or voice/typing — it resolves to food entries with honest quantities and lands on your Day Board. This is the MVP core loop every later epic builds on: the monorepo scaffold, the encrypted local store foundation, and all three entry paths converging on one quiet, honest row per meal. No streaks, scores, or false-exact calories anywhere.

## Stories

- Story 1.1: Scaffold the monorepo and reproducible build
- Story 1.2: Record a plate in the local encrypted store
- Story 1.3: Day Board — today's plates
- Story 1.4: Week strip — tap-a-day navigation
- Story 1.5: Type or talk a food, get ranked matches (FR3)
- Story 1.6: Capture sheet fan-out
- Story 1.7: Scan a barcode on packaged food (FR2)
- Story 1.8: Photograph a plate (FR1)

## Requirements & Constraints

- Performance budgets: photo recognition resolves in ≤3s on a midrange device; known barcode resolves in ≤2s.
- Honest quantities: store and render as ranges ("~2 fists"), never false-exact kcal; portion estimates carry explicit uncertainty.
- Ambiguous input never fails the log: fall back to pick-from-closest-matches or manual quantity (photo and unknown-barcode paths).
- Convergence: all three entry paths produce the same local Plate Log record via the same flow — no UX divergence by input method.
- Manual/voice logging stays fully available with the AI tier off and offline; cached resolutions work with network revoked.
- Voice input is speech-to-text transcription of food names only — never a voice-print or biometric; plate photos carry no identity linkage.
- Offline-first: the full feature set works with network revoked; local store is the single source of truth.
- No-pressure UX everywhere: no countdowns, fabricated urgency, streaks, rewards, spinners for resolve, or red-guilt states.
- Adults-only, no under-13 accounts; no biometric identification anywhere in v1.
- Accessibility floor: touch targets ≥48px, keyboard + screen-reader parity, reduced-motion collapses to fade, color never the sole signal, dynamic type honored at the largest setting.

## Technical Decisions

- Hexagonal ports-and-adapters with a pure-Dart domain core (`packages/domain_core`, no Flutter/SQLite/HTTP imports); UI code never imports drift/dio/mobile_scanner directly — only through ports (AD-1).
- One responsive Flutter codebase for iOS/Android/web in `apps/client`; `flutter build web` serves the self-host client (AD-2). Desktop deferred.
- Every domain mutation flows through a core use-case that commits to the drift store before any UI reflects it; Riverpod state is derived, never a second source (AD-3).
- One `FoodCatalog` port in front of OFF + USDA with a local cache adapter; photo, barcode, and manual/voice paths all call it (AD-4).
- AI is a swappable tier behind one `AiRung` port (AD-5): in this epic the `no-op` rung is active — photo recognition dispatches through the port and degrades honestly (recognize → closest-matches → manual). Real recognizers land in Epic 3.
- Encrypted store mobile-first: drift schema with sqlite3mc AES-256, 32-byte DB key from Keychain/Keystore via flutter_secure_storage (AD-8); this epic creates only `PlateLog` and `FoodEntry` tables — nothing more.
- Monorepo: `apps/client`, `packages/domain_core`, `packages/integrations`, `infra/` (Docker + nginx), `melos.yaml` on Dart pub workspaces; `melos bootstrap` resolves all packages.
- Reproducible self-host build: multi-stage Docker `cirruslabs/flutter:stable → flutter build web --release → nginx:alpine try_files SPA` (NFR9); CI runs `flutter analyze` + smoke test on every PR.
- Stack pins (web-verified Aug 2026): Flutter 3.47.0, Dart ^3.13.0, flutter_riverpod 3.4.2 (codegen), drift 2.34.3, sqlite3 3.5.x (sqlite3mc build hook), flutter_secure_storage 11.0.0, mobile_scanner 7.4.0, image_picker 1.2.3, dio 5.11.0, melos 8.2.2.
- Conventions: domain entities PlateLog, FoodEntry, DatabaseFood in `domain_core`; ports named by role; files kebab-case, packages snake_case; local DB ids autoincrement ints; external refs kept verbatim (OFF barcode strings, USDA FDC ids); dates UTC ISO-8601 rendered local; typed domain results (nearest-match, not-found) rather than raw exceptions crossing ports.
- Sage & Cream light+dark design tokens (palette, 4px spacing scale, radii, typography voices) scaffolded here as the shared token source; dark mode ships in v1.

## UX & Interaction Patterns

- Day Board: vertical stack of plate rows (Breakfast/Lunch/Dinner + open dents) divided by hairline rules, no cards/fills/dashboard grid; full day always visible; capture is one floating `+` thumb-reach with no scroll-to-button guardrail.
- Balance arc: per-meal 4-segment ring (Veg&Fruit / Protein / Starch / Dairy), sage fill on a hairline track, arcnote "3 of 4" in mono; screen reader announces food groups, not a count; color is never the sole signal.
- Status chips: `· local` is the only base state in this epic — `· pending` / `· synced` arrive with Epic 4. Tiny mono, never louder than the coach.
- Week strip: 7 mini-dots at the Day Board bottom, sage fill on balanced days only, neutral outline otherwise; tap-a-day navigation; mono whisper "no streaks · no countdowns · no guilt"; no week-report screen.
- Capture sheet: bottom sheet fan-out from `+` — Snapshot dominant (sage-deep tile) / Scan a barcode / Type or talk (subtiles); closes back to the Day Board after a log; quick-repeat re-shoot affordance for multi-meal capture.
- Resolving state: quiet inline shimmer + "reading…" arcnote, never a spinner. Empty day = quiet dents ("An open, quiet place."), no accusation. Ambiguous food = closest matches + manual quantity.
- Tap-to-expand plate rows (expanded = edit surface, one tap to correct food/quantity); ranked matches + quantity presets for manual/voice (pick match + "~1 fist").
- Typography: humanist sans for all UI text, serif italic reserved for the coach, mono for quantities/status/arcnote — no role crossover.
- Accessible states: arc segments always paired with text labels; balanced-day dots have accessible names; dynamic type legible without truncation at the largest setting.

## Cross-Story Dependencies

- Story 1.1 (monorepo scaffold + tokens + CI) is the foundation every other story builds on.
- Story 1.2's `RecordPlate` use-case is beneath the Day Board (1.3) and all three entry paths (1.5, 1.7, 1.8) — they all commit through the same path for convergence.
- Story 1.6's capture sheet fans out into the manual, barcode, and photo flows; after a log it returns to the Day Board.
- Photo logging (1.8) dispatches through the `AiRung` port with `no-op` active now; real recognizers plug in during Epic 3 behind the same port. Coach whisper anchors (Epic 2) appear on just-logged plates from these flows. Pending/synced chip states and the week-balance logic are shared with Epic 4/2 respectively.
