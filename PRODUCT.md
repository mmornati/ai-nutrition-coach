# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, mobile-first, also used on desktop browsers. Not distributed through the Apple or Google app stores; people install it from a self-hosted URL (Add to Home Screen / Install app).

## Stack

React 19 + Vite + TypeScript + Tailwind v4 + a hardened hand-written service worker (no `vite-plugin-pwa`), matching the maintainer's ai-finance-coach frontend. Replaces the earlier native client (see the PWA refactor plan in `docs/pwa-refactor-plan.md`).

## Users

Public open-source self-hosters and the people they share their instance with. Primary user: an adult who cooks for a household and wants to understand what they eat, with real numbers to hand and no pressure attached. Logs meals in the moment (at the table, in a shop aisle, after the fact from memory), usually one-handed on a phone; reviews the day or week on phone or desktop. v1 is adults-only: no child profiles, no under-13 language, no biometric identification (face, voice, fingerprint). Optional body measurements the person types (height, weight, waist) are allowed; a birth date is not (age band only).

## Product Purpose

AI Nutrition Coach (formerly OpenPlate) records what you ate — photo, barcode, or typing — and lands each meal on a Day Board as one honest plate, then coaches with a question instead of a verdict. Success: meals logged with understanding (a "why" surfaced or a coach question answered), choices that improve over weeks, and a tool that never scolds.

## Positioning

A coach with real numbers, calmly framed. Since 2026-10-21 (`docs/adr/0006-nutrition-numbers-calm-framing.md`) the app stores grams and nutrients and shows them per plate and per day, against reference intakes, without scores, streaks or guilt. The earlier "a coach, not a calculator" stance, which showed no numbers at all, is superseded. Since 2026-11-15 (`docs/adr/0008-goals-body-data-daily-guide.md`) the personal energy figure is "your daily guide", and the person may add optional body measurements (height, dated weight, dated waist) that stay encrypted, synced with the vault, exported and erasable. The earlier public promise "no weight and no height" is reversed; "no name, no birth date, no account" stands. Trust is architectural: no account, local encrypted store, optional sync only to the user's own infrastructure, zero telemetry, AI optional (free quota → bring your own key → local model in v2). The no-AI core is a complete product.

## Operating Context

- Capture: snapshot of a plate (dominant path), barcode scan of packaged food (Open Food Facts), or typing a food name with ranked matches and quantity presets.
- Day Board: breakfast / lunch / dinner / open plate stacked for today; tap a plate to expand and edit; week strip to change day.
- Settings: Your AI (quota, BYOK, local v2), Your data (export CSV/JSON, sync status), Tip Jar, About.
- Web unlock: a passphrase opens the encrypted store on each session.
- Works fully offline; sync status shown as `local → pending → synced`.

## Capabilities and Constraints

- Balanced-plate model: four food groups (veg & fruit, protein, starch, dairy) marked present/absent per plate; portions as ranges ("~2 fists") for presets and uncertain estimates. Direction (ADR 0006, rolling out in schema v2): grams per food entry and per-100 g nutrients (energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt) shown per plate and per day as plain values and neutral bars against EU Reference Intakes or an optional personal target. Estimates are labelled "~"; ranges stay allowed where data is uncertain. Open Food Facts Nutri-Score and NOVA may appear as attributed third-party product information, never as a score of the person.
- Daily guide and body data (ADR 0008): an evidence-based daily guide from optional height, weight, age band, sex, activity and goal (Henry 2005 and EFSA 2013 energy, a pace-based deficit capped at 25 %, floors of 1500 or 1200 kcal that are conventions, not clinical thresholds). Going past the guide is shown as neutral text. One opt-in, off-by-default line may state the distance to the guide in plain text, never in the coach's voice. BMI and waist-to-height ratio may appear as plain numbers beside WHO and NICE reference ranges written as text, behind a disclosure, never as a label on the person and never colour-coded. Weight, height, waist and BMI are never sent to an AI; the coach receives the daily guide rounded (100 kcal, 10 g). A weight-loss or weight-gain guide needs a known BMI (height and weight), otherwise it stays at maintenance.
- Photo recognition ≤3s, barcode ≤2s budgets; ambiguous food falls back to closest matches + manual quantity, never fails the log.
- Quota exhaustion offers three calm paths (keep logging without AI / bring your own key / wait), no countdown.
- Voice input is v1 transcription-only and currently not implemented.
- Requires HTTPS for camera access.
- Coach strings live in a localization key store; multiple languages expected.

## Brand Commitments

- Name: AI Nutrition Coach (formerly OpenPlate). Footmark: "yours to run · open source".
- Voice: warm-but-reserved calm kitchen friend; asks, never tells; no exclamation marks, no celebratory language, no streak vocabulary.
- No-Dark-Patterns Standard (`docs/no-dark-patterns-standard.md`) is binding: no streaks, app-invented scores, points or grades, badges, countdowns, celebratory pop-ups, red or guilt states ("over budget"), "calories remaining" framing, push re-engagement, or spinners for resolve. Numbers are allowed; pressure is not.
- The coach still asks rather than scolds, but gives specific nutrition information ("This yogurt has about 18 g of sugars, around a fifth of a day's reference intake.").
- Energy in the visuals is welcome; the behavioral rules above constrain devices, not exuberance.

## Evidence on Hand

- Product brief, PRD, EXPERIENCE and earlier DESIGN contract under `_bmad-output/planning-artifacts/` (the earlier "Sage & Cream calm" visual world is superseded by the PWA redesign; its behavior rules still hold).
- Seed food catalog in `apps/web/src/catalog/seed-foods.ts` and coach templates in `packages/core/src/coach`.
- No user testimonials, usage metrics, or press exist; do not fabricate them.

## Product Principles

1. Understanding with numbers: every surface should teach something concrete about the plate, using real values (grams, nutrients) shown plainly against a reference, never as a verdict, a score or a limit the person has failed. A body measurement is the person's own information, optional and never a label.
2. Never fail the log: offline, no AI, unknown barcode — the meal still lands.
3. Ownership is visible: where the data lives and which AI is used are always legible.
4. Ask, don't judge: the coach offers one question; dismissing costs nothing. When the person chose to lose weight, the coach may help, inside the safeguards of ADR 0008, and points to a doctor where those safeguards hold the guide at maintenance.
5. One thumb, one plate: capture is reachable in one motion from the home surface.

## Accessibility & Inclusion

Touch targets ≥48px; keyboard and screen-reader parity (balance arcs announce food groups; nutrient bars always carry their value, unit and reference in text); reduced motion collapses to fades; color never the sole signal; dynamic type without truncation; all strings localizable. See `docs/accessibility.md`.
