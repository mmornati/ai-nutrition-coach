# ADR 0006: Real nutrition numbers, calm framing

Status: accepted · 2026-10-21
Supersedes: the "no numbers" rule in `PRODUCT.md` (portions as ranges, never kcal), `DESIGN.md` (no progress bars or calorie totals), PRD FR-1 / epics NFR6 ("honest ranges, never false-exact kcal") and the "Not a macro playbook" non-goal, all under `_bmad-output/planning-artifacts/`; and the "Honest quantities" line in ADR 0004.

## Context

v1 was designed to never show a number: no grams, no kcal, no macros, only food-group presence and portion ranges ("~2 fists"). Feedback on the working app is that this makes it of little use:

- There are no weights, so a plate cannot be compared with anything.
- There are no nutrients, so "how much sugar is in this yogurt" cannot be answered, even when Open Food Facts already knows.
- The coach is generic. Without data it can only ask about balance, and it repeats itself.

The maintainer decided on 2026-10-21 that the rule protected the wrong thing. What hurts people is pressure (streaks, scores, red states, shaming), not information.

## Decision

**Real numbers, calm framing.**

- Store **grams per food entry** and **per-100 g nutrients** per food: energy (kcal), protein, carbohydrate, sugars, fat, saturated fat, fibre, salt.
- Show them **per plate and per day** as value + unit text with a plain horizontal bar against a reference: the EU Reference Intakes (energy 2000 kcal, fat 70 g, saturates 20 g, carbohydrate 260 g, sugars 90 g, protein 50 g, salt 6 g; fibre about 25-30 g recommended), or against personal targets from an optional profile (phase 3).
- **Estimates are labelled** with "~". **Ranges stay allowed** where data is uncertain (photo estimates, portion presets).
- The coach still **asks rather than scolds**, and now gives concrete, specific, nutrition-based information, for example: "This yogurt has about 18 g of sugars, around a fifth of a day's reference intake."
- Open Food Facts' own Nutri-Score and NOVA may be shown as **attributed third-party product information**, never as a score of the user.
- Visual rules live in `DESIGN.md` (Nutrient Bars): neutral bars, one neutral colour, no red, no rings or donuts, text always present.

## What stays banned

Reaffirmed, unchanged, in `docs/no-dark-patterns-standard.md`:

- Streaks, and any consecutive-day count.
- Scores, points or grades invented by the app (a ranking of the person's day or week, a "health score").
- Badges and levels.
- Celebratory pop-ups, confetti, "great job" modals.
- Countdowns.
- Push-notification re-engagement.
- Red or guilt states: no red bars, no "over budget", no "exceeded", no colour that changes meaning with the amount.
- Shaming language and exclamation marks.
- "Calories remaining" or "left today" pressure framing. A value is shown against a reference ("about a fifth of the reference intake"), never as an allowance being spent down.

## Consequences

- **Schema v2.** Food entries gain `grams` (and an estimate flag or range); foods gain per-100 g nutrients. A migration for existing local stores is needed (entries without grams stay valid; presets map to default grams where the catalogue knows them). The `QuantityRange` value type stays for presets and uncertain estimates.
- **Open Food Facts.** The barcode lookup must read `nutriments` (`energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `sugars_100g`, `fat_100g`, `saturated-fat_100g`, `fiber_100g`, `salt_100g`) and the product's `nutriscore_grade` / `nova_group` when present, with missing values kept missing, never zero. The CSP and the host allow-list do not change (same OFF host).
- **Catalogue nutrient source.** The seed catalogue needs per-100 g values. Candidates: CIQUAL (ANSES, Etalab Open Licence) or USDA FoodData Central (public domain). **Licensing and attribution must be checked before any import**, and the chosen source credited in `apps/web/public/licenses/` and the About screen.
- **Tests and gates.** The tests that banned `kcal`, "calorie" and "objectif" now ban the pressure vocabulary instead (points, scores, streaks, remaining, over budget, exclamation marks). The no-dark-patterns test gains a guilt-framing detector.
- **Docs.** `PRODUCT.md`, `DESIGN.md`, README, CONTRIBUTING and the standard are updated; the planning artifacts carry a dated "Superseded 2026-10-21" note instead of being rewritten.
- **Risk.** Numbers can be misused by the reader or the interface. Mitigation: the bans above, estimates labelled, and the named-reviewer gate on every copy change.

## Roadmap

1. **Phase 1, quick wins.** A clear message when photo recognition has no AI configured; barcode camera on iPhone; a coach patch.
2. **Phase 2, nutrition data.** Grams input, nutrient model, OFF nutriments, catalogue nutrients, schema v2 and migration, Nutrient Bars per plate and per day.
3. **Phase 3, a real coach.** Optional profile and goals, a day- and week-aware coach, an LLM coach through the existing `Coach` port.
4. **Phase 4, instance-wide AI key.** An AI key held on the server and used through a server-side proxy, configured in `infra/server.env`, so a self-hoster can offer AI to the people they share the instance with without each of them bringing a key. Built (an `instance` rung behind a same-origin nginx proxy); see `docs/ai-tiers.md` and `docs/self-host.md`.
