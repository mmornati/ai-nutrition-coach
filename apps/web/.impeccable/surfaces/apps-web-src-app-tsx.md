---
version: 1
slug: "apps-web-src-app-tsx"
primary_target: "apps/web/src/App.tsx"
related_targets: ["apps/web"]
---

# Surface: AI Nutrition Coach PWA (Day Board, capture, plate detail, week, settings, unlock)

Scope: the whole PWA app UI in `apps/web`, phone first (390px) and desktop (≥1024px). Mode: Operate.
Audience/job: an adult who cooks for a household, logging a meal one-handed in seconds, then glancing at the day and week to understand balance and nutrients. Constraints: PRODUCT.md rules (no streaks/scores/badges/countdowns, ask-don't-judge coach, honest ranges, offline-first, ≥48px targets, colour never alone). Replaces the "Night Line Map" transit world (rejected by the maintainer 2026-10-21: metaphor, night mood and square signage all off-theme).

## Direction contract

THESIS: The day is a kitchen towel. Each meal weaves one band; every food group on the plate is a dyed stripe across that band, an absent group leaves bare cotton. Balance reads as which stripes a band carries, never a score, ring, line map or calorie countdown.

OWN-WORLD: Bright white cotton ground (#FBFBF8) with a barely visible weave, warm near-black ink (#262421), thread-grey secondary (#6B655E), seam dividers (#E4E1DA). Four dyes, one per group: veg green #1F7A4D, protein basque red #B5262E, starch ochre #D9962B, dairy blue #2D5DA8. Schibsted Grotesk, heavy and tight for names, plain for sentences, sentence case. Pill buttons, 4px sewn-label tags with a dashed stitch inset, 8px cloth panels, ink focus ring.

STORY: Open the app on today's towel: breakfast and lunch woven, dinner a dashed empty band. Tap Ajouter, snap, and the new band weaves in stripe by stripe. The coach speaks on a sewn label, one question.

FIRST VIEWPORT: Phone: heavy day name (50px) and date top left, the storage tag top right; bands stacked full width, stripes in a 116px left field, meal name/time/foods/one plain nutrient line right; day totals row under a 2px ink rule; coach label; ink "Ajouter" pill bottom right; dock of seven folded towels (today outlined in ink). Desktop: left rail, today's towel centre, the week as seven towels hung side by side.

FORM: Torchon basque (striped kitchen linen), #1 on my grounded list (Impeccable's pick, chosen over the rolled Émail de cuisine #4). Seed key 1f67a9f7.

SIGNATURE INTERACTION: When a plate resolves, its stripes weave in left to right one after another in group order (scaleX from the left edge, 60ms stagger); reduced motion shows them at once.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Copy that named the transit metaphor ("lines", "stations", "passed through") moves to plain plate wording; maintainer sign-off on the French strings.
- Dark variant: not built; the use scene (kitchen, table, shop aisle in daylight) sets light.
