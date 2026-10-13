---
version: 1
slug: "docs-design-food-lines-index-html"
primary_target: "docs/design/food-lines/index.html"
related_targets: ["apps/web"]
---

# Surface: OpenPlate app shell (Day Board, capture, plate detail, week, settings, unlock)

Scope: the whole PWA app UI, phone first (390px) and desktop (≥1024px). Mode: Operate.
Audience/job: an adult logging a meal in seconds one-handed, then glancing at the day/week to understand balance. Constraints: PRODUCT.md rules (no streaks/scores/badges/countdowns, ask-don't-judge coach, honest ranges, offline-first, ≥48px targets, color never alone).

## Direction contract

THESIS: The day is a transit map. The four food groups are four coloured lines; each meal is a station where lines stop or pass through. Balance is read as "which lines stopped here", never as a score, ring or calorie total. Refuses the category default of white cards with macro donuts.

OWN-WORLD: Midnight enamel ground (#0E1A3A), porcelain white (#F3F1EA) for ink, station ticks and buttons. Line inks: Veg & fruit green #3FAE5A, Protein scarlet #E5432F, Starch amber #F2A41C, Dairy cobalt #5C9CF5. Lines bend only at 45°/90°. Barlow Condensed uppercase for station names and labels, Barlow for body. Square-cornered outlined buttons, porcelain interchange rings, a thin porcelain rule under headers.

STORY: Open the app and see today's route: which lines ran through breakfast and lunch, and the open station waiting at dinner. Tap Log, snap, and watch the lines stop at the new station. The coach speaks at the station as one question.

FIRST VIEWPORT: Phone: header (day name, date, LOCAL chip) over a 4px porcelain rule; legend row; full-height map with four vertical lines on the left 140px and station names, contents and the coach card to the right; a "Log a plate" pill bottom right; week route bar fixed at the bottom. Desktop: left nav rail, today's line diagram in the centre column, the week drawn as a seven-station network map to the right.

FORM: Midnight transit diagram (catalog challenger wayfinding-cartography-signage-midnight-transit-diagram), chosen over my grounded list (Crate Label was assigned #5; Thali was the pick). Seed key 0ee23ea9.

SIGNATURE INTERACTION: When a plate resolves, the station ring draws in and each present line's stop dot pops onto it in line order (staggered 60ms); reduced motion skips straight to the end state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- How snacks (5+ stations a day) compress on phone: proposal is a collapsed "+2 stops" segment.
- Light theme: the enamel world is dark-first; a porcelain-ground light variant is to be validated during the build.
