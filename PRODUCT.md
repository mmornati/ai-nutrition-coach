# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, mobile-first, also used on desktop browsers. Not distributed through the Apple or Google app stores; people install it from a self-hosted URL (Add to Home Screen / Install app).

## Stack

React 19 + Vite + TypeScript + Tailwind v4 + vite-plugin-pwa, matching the maintainer's ai-finance-coach frontend. Replaces the earlier Flutter client (see the PWA refactor plan in `docs/pwa-refactor-plan.md`).

## Users

Public open-source self-hosters and the people they share their instance with. Primary user: an adult who cooks for a household and wants to understand what they eat, not count it. Logs meals in the moment (at the table, in a shop aisle, after the fact from memory), usually one-handed on a phone; reviews the day or week on phone or desktop. v1 is adults-only: no child profiles, no under-13 language, no biometrics.

## Product Purpose

AI Nutrition Coach (formerly OpenPlate) records what you ate — photo, barcode, or typing — and lands each meal on a Day Board as one honest plate, then coaches with a question instead of a verdict. Success: meals logged with understanding (a "why" surfaced or a coach question answered), choices that improve over weeks, and a tool that never scolds.

## Positioning

A coach, not a calculator. Trust is architectural: no account, local encrypted store, optional sync only to the user's own infrastructure, zero telemetry, AI optional (free quota → bring your own key → local model in v2). The no-AI core is a complete product.

## Operating Context

- Capture: snapshot of a plate (dominant path), barcode scan of packaged food (Open Food Facts), or typing a food name with ranked matches and quantity presets.
- Day Board: breakfast / lunch / dinner / open plate stacked for today; tap a plate to expand and edit; week strip to change day.
- Settings: Your AI (quota, BYOK, local v2), Your data (export CSV/JSON, sync status), Tip Jar, About.
- Web unlock: a passphrase opens the encrypted store on each session.
- Works fully offline; sync status shown as `local → pending → synced`.

## Capabilities and Constraints

- Balanced-plate model: four food groups (veg & fruit, protein, starch, dairy) marked present/absent per plate; portions as honest ranges ("~2 fists"), never fake-exact kcal.
- Photo recognition ≤3s, barcode ≤2s budgets; ambiguous food falls back to closest matches + manual quantity, never fails the log.
- Quota exhaustion offers three calm paths (keep logging without AI / bring your own key / wait), no countdown.
- Voice input is v1 transcription-only and currently not implemented.
- Requires HTTPS for camera access.
- Coach strings live in a localization key store; multiple languages expected.

## Brand Commitments

- Name: AI Nutrition Coach (formerly OpenPlate). Footmark: "yours to run · open source".
- Voice: warm-but-reserved calm kitchen friend; asks, never tells; no exclamation marks, no celebratory language, no streak vocabulary.
- No-Dark-Patterns Standard (`docs/no-dark-patterns-standard.md`) is binding: no streaks, scores, badges, countdowns, celebratory pop-ups, red-guilt states, push re-engagement, or spinners for resolve.
- Energy in the visuals is welcome; the behavioral rules above constrain devices, not exuberance.

## Evidence on Hand

- Product brief, PRD, EXPERIENCE and earlier DESIGN contract under `_bmad-output/planning-artifacts/` (the earlier "Sage & Cream calm" visual world is superseded by the PWA redesign; its behavior rules still hold).
- Seed food catalog and coach templates in `packages/integrations`.
- No user testimonials, usage metrics, or press exist; do not fabricate them.

## Product Principles

1. Understanding over numbers: every surface should teach something about the plate, not total it.
2. Never fail the log: offline, no AI, unknown barcode — the meal still lands.
3. Ownership is visible: where the data lives and which AI is used are always legible.
4. Ask, don't judge: the coach offers one question; dismissing costs nothing.
5. One thumb, one plate: capture is reachable in one motion from the home surface.

## Accessibility & Inclusion

Touch targets ≥48px; keyboard and screen-reader parity (balance arcs announce food groups, not counts); reduced motion collapses to fades; color never the sole signal; dynamic type without truncation; all strings localizable. See `docs/accessibility.md`.
