---
name: AI Nutrition Coach (formerly OpenPlate)
description: The day drawn as a transit map. Four food lines, each meal a station, on midnight enamel.
colors:
  enamel: "#0E1A3A"
  enamel-raised: "#15244B"
  rule: "#2C3F72"
  control: "#5B6C9C"
  control-raised: "#6474A6"
  porcelain: "#F3F1EA"
  porcelain-dim: "#C9CFE0"
  signal-muted: "#A3AFCF"
  line-veg: "#3FAE5A"
  line-protein: "#E5432F"
  line-starch: "#F2A41C"
  line-dairy: "#5C9CF5"
typography:
  display:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.03em"
  title:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.05em"
  section:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
  button:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  label:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  quantity:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.03em"
    fontFeature: "tnum"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0px"
  station: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  gutter-desktop: "28px"
  column-gap: "36px"
components:
  button-solid:
    backgroundColor: "{colors.enamel}"
    textColor: "{colors.porcelain}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "48px"
  button-porcelain:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.enamel}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "48px"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "48px"
  button-ghost-on-porcelain:
    backgroundColor: "transparent"
    textColor: "{colors.enamel}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "48px"
  chip-status:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
    height: "36px"
  preset:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "44px"
  preset-selected:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.enamel}"
  coach-card:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.enamel}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "14px 14px 12px"
  field:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "56px"
  dock:
    backgroundColor: "{colors.enamel-raised}"
    textColor: "{colors.signal-muted}"
    height: "76px"
  dock-log:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.enamel}"
    typography: "{typography.button}"
    width: "92px"
---

# Design System: AI Nutrition Coach (formerly OpenPlate)

> Reference implementation: `docs/design/food-lines/index.html` (self-hosted Barlow and Barlow Condensed in `docs/design/food-lines/fonts/`). Production target: the React 19 + Tailwind v4 PWA in `apps/web` (see `docs/pwa-refactor-plan.md`); the tokens above port to Tailwind `@theme` variables. The fixed "proto" screen switcher at the top of the prototype is a prototype-only navigation aid and is not part of this system. This file supersedes the visual layer of the earlier "Sage & Cream calm" DESIGN.md; its behavior rules still hold.

## Overview

**Creative North Star: "The Night Line Map"**

The day is a transit diagram printed on midnight enamel. The four food groups are four coloured lines running the full height of the day; each meal is a station where some lines stop and others pass through. Balance is read the way a rider reads a map, by which lines served a station, never as a score, ring or donut. Real nutrient values (grams, kcal, per-100 g facts) are planned as plain text and neutral horizontal bars against a reference intake, drawn as quiet signage beside the station and never as a verdict (ADR 0006). Everything else is signage: porcelain ink, condensed uppercase station names, square outlined buttons, thick porcelain rules under headers.

Density is wayfinding-calm rather than dashboard-busy: one diagram, a few station names, one coach question at a time. The energy comes from the saturated line inks against a deep ground and from the condensed display type, not from motion or decoration. The world is dark-first; a porcelain-ground light variant is unresolved and has not been built.

The system rejects the category default of white cards with macro donuts, progress rings and red over-budget states. Numbers are welcome; pressure is not.

**Key Characteristics:**
- Four line inks are the only chromatic colours; everything else is enamel and porcelain.
- Station dots, interchange rings and capsules are the only rounded forms; every control is square-cornered.
- Barlow Condensed uppercase for anything you read like a sign; Barlow for anything you read like a sentence.
- Structure is drawn with rules and outlines, not shadows.
- Lines run straight and bend only at 45° or 90°.

## Colors

A midnight enamel ground with porcelain ink and four saturated transit-line colours that each mean exactly one food group.

### Primary
- **Porcelain** (porcelain): all primary text, station ticks and stop dots, the 4px header rule, outlined button borders, the coach card ground and filled primary buttons. It is the system's "ink" and its strongest action colour.

### Line inks (food groups)
- **Veg & Fruit Green** (line-veg): the veg & fruit line, its legend swatch, tag bars; also the "Local" status dot.
- **Protein Scarlet** (line-protein): the protein line and its swatches.
- **Starch Amber** (line-starch): the starch line and its swatches. Also the system's "you are here / attention" signal: the focus ring, text selection, today's interchange in the week route and network map, the active rail-nav underline, and the "Reading the plate…" resolving line.
- **Dairy Cobalt** (line-dairy): the dairy line and its swatches.

### Neutral
- **Midnight Enamel** (enamel): page ground, text on porcelain surfaces, the hollow centre of station rings, `theme-color`.
- **Raised Enamel** (enamel-raised): the bottom dock and the capture sheet, the only raised planes.
- **Night Rule** (rule): dividers between list rows, the rail border, the week-route track. Never a control outline.
- **Control Edge** (control, #5B6C9C, ≥3:1 on enamel): outlines of unselected controls (portion presets, AI tiers, icon buttons).
- **Raised Control Edge** (control-raised, #6474A6, 3.3:1 on raised enamel, 3.7:1 on enamel): the same outlines when the control sits on a raised enamel plane (capture sheet, bottom dock), where the plain control edge falls to 2.9:1.
- **Porcelain Dim** (porcelain-dim): secondary sentences (stop summaries, hints, tier descriptions, back links, inactive rail items).
- **Signal Muted** (signal-muted): metadata, times, sub-headers, section labels, inactive week-route days, placeholders.

### Named Rules
**The One Line, One Group Rule.** Green, scarlet, amber and cobalt each belong to one food group. They never decorate, never mark success or failure, and never appear as backgrounds behind text.

**The Amber Signal Rule.** Starch amber doubles as the "you are here" and focus signal, so it always arrives with a shape (3px outline, interchange ring, 4px underline) and never as a colour change alone.

**The No Red Guilt Rule.** Protein scarlet is a line colour, not an error state. An absent line is drawn dashed and neutral, never in red.

## Typography

**Display Font:** Barlow Condensed (500/600/700, self-hosted woff2, fallback system-ui)
**Body Font:** Barlow (400/500/600, self-hosted woff2, fallback system-ui)

**Character:** Condensed grotesque signage over a plain, friendly grotesque. The condensed face names places (days, meals, lines, actions); the regular face speaks in sentences.

### Hierarchy
- **Display** (700, 44px phone / 64px desktop, 0.95, uppercase): the screen name in the header: the day, "This week", "Settings", a meal name on plate detail; 48px on the unlock screen.
- **Headline** (700, 28px phone / 34px desktop, 1, uppercase): station names on the day map; the capture sheet title (26px).
- **Title** (700, 20–24px, uppercase): settings rows, AI tiers, capture options, week day codes.
- **Section** (700, 17px, 0.12em, uppercase, signal-muted): labels heading a block ("On the plate", "Day by day", "This week's network").
- **Button** (700, 16px, 0.08em, uppercase): every button label; 19px on the full-width unlock button.
- **Label** (600, 13–15px, 0.05–0.1em, uppercase): legend, line bar cells, station times, chip text, route day letters, tags.
- **Quantity** (600, 19px, tabular figures): honest-range portions ("~2 fists").
- **Body** (400, 16px, 1.45): coach copy and sentences; hints held to 34ch, week notes to 40ch.
- **Body small** (400, 14.5–15px): meta lines, descriptions, sub-headers.

### Named Rules
**The Signage Rule.** Anything uppercase is Barlow Condensed with positive tracking (0.01–0.12em, wider as size drops). Barlow body text is never uppercased.

**The Self-Hosted Rule.** Fonts ship with the app as woff2 with `font-display: swap`; no font CDN, so the map renders identically offline.

## Layout

Phone first at 390px. A single column: header with the screen name and status chip over a 4px porcelain rule, a legend row, then the day map: a 132px lane on the left where four vertical lines run at fixed x-positions (30/54/78/102px, 8px strokes), with station names, contents and the coach card in the column to the right. Stations are at least 120px tall (140px desktop). A fixed bottom dock holds the week route (seven stations on a 4px track) and a 92px porcelain Log block; views carry 110px bottom padding to clear it. Side gutters are 20px (16px around the map), 28px on desktop.

At ≥1024px the shell becomes a 240px left rail (brand, nav, Log button, storage status pinned to the bottom) plus content; the dock is removed. Today becomes two columns: the day map (420–560px) and the week drawn as a seven-station network map, divided by a 2px rule. Plate detail, week and settings become two-column grids with a 36px column gap; the capture sheet becomes a centred 560px dialog.

Spacing is a loose 4px-based rhythm (4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 28px); vertical breathing room comes mostly from station height, not from margins.

**The 45/90 Rule.** Lines are straight. Where a diagram bends (brand mark, unlock map), it bends at 45° or 90° only. No curves, no organic paths.

## Elevation & Depth

Flat. Depth is conveyed by the raised enamel plane (dock, sheet), rules and outlines, and a dark scrim behind the capture sheet. There are no drop shadows. The only `box-shadow` in the system is a zero-blur concentric ring around today's route station, which is a drawn interchange ring, not elevation.

**The Printed Map Rule.** Surfaces lie flat like a printed diagram. Separate planes with a rule (1–4px) or the raised enamel tone, never with blur.

## Shapes

Every control, card, field, chip and sheet is square-cornered (0px). Roundness is reserved for the map vocabulary: stop dots and interchange rings are circles, a station is a capsule (rx 8 on a 16px resolved bar, rx 14 on a 28px open station), and radio indicators in the AI tier list are rings. Borders carry the structure: 2px outlines on controls, 4px porcelain rules under headers and on top of the sheet, 1px night rules between list rows. Absent or pending things are dashed: an open station is a dashed porcelain capsule, an absent line is a dashed segment or dashed hollow dot.

**The Round Means Map Rule.** If it is round, it is part of the diagram (a stop, a ring, a station). UI chrome stays square.

## Components

### Buttons
Signage buttons: uppercase condensed labels in a square 2px frame.
- **Shape:** square (0px), 2px border in the current colour, at least 48px tall, 0 18px padding, icon gap 10px.
- **Porcelain (primary on enamel):** porcelain fill, enamel text. Used for Log a plate and Unlock.
- **Line (secondary on enamel):** transparent, porcelain text and border ("See the week's network", "Add a food").
- **Solid / Ghost (inside the porcelain coach card):** solid is enamel fill with porcelain text; ghost is an enamel-outlined, transparent button.
- **Focus:** 3px starch-amber outline, 2px offset, on every interactive element.
- **Icon button:** 48×48 square, 2px control-edge border; porcelain border when it is the current page.

### Chips
- **Status chip:** a square 2px porcelain outline, condensed 700 14px, a 9px veg-green dot before "Local". It states where data lives; it is not a filter.
- **Version tag:** a 1.5px muted outline at 13px ("v2") next to an unavailable tier.

### Cards / Containers
- **Coach card:** the one inverted surface. Porcelain ground, enamel body text at 16px, square, 14px padding, actions underneath. It asks one question; its title, when present, is a short condensed uppercase line.
- **Line bar (plate detail):** a four-cell grid in a 2px porcelain frame; each cell shows its line swatch (8px bar) and name; an absent line becomes a muted dashed stroke with "· passed".
- **Lists (entries, day list, settings board):** a 2px porcelain top rule, then rows separated by 1px night rules; no card backgrounds.

### Inputs / Fields
- **Style:** square 2px porcelain frame, 56px tall, transparent fill, 17px text, muted placeholder.
- **Focus:** the frame takes the 3px amber outline at 2px offset (`:focus-within`).
- **Presets (portion ranges):** 44px square outlined buttons in condensed 16px; selected flips to porcelain fill with enamel text and `aria-pressed`.
- **Radio tiers:** full-width outlined rows with a 24px porcelain ring; checked rows take a porcelain border and a filled 10px centre; disabled rows drop to 0.75 opacity and carry a version tag.

### Navigation
- **Phone:** the bottom dock's week route is the day switcher: seven 20px station rings on a 4px rule track; a full day (all four lines) is a filled porcelain dot, a partial day is hollow; today is amber with a double interchange ring and porcelain label (the word where it fits its stop, the day's initial where it does not). Below 336px (seven 48px stops) the route scrolls sideways inside the dock, the selected stop kept in view and the far stop peeking in at the edge; stops never shrink under 48px. Settings is a header icon button; back links are condensed uppercase with a chevron.
- **Desktop rail:** brand mark plus condensed 18px uppercase items at 52px; inactive items porcelain-dim, the current item porcelain with a 64×4px amber underline.

### Day Map (signature)
Four 8px vertical lines in line order (veg, protein, starch, dairy). A resolved station is a porcelain capsule across the lane with a 10px porcelain stop dot (3.5px enamel stroke) on each line that stopped; lines that did not stop pass behind. The open station is a dashed porcelain capsule on enamel. Beside each station: name and time, contents in porcelain-dim, and a plain sentence naming which lines passed through. The whole station is one ≥48px hit target.

### Week Network Map (signature)
Days across, four horizontal lines down, each with terminus ticks. A stop is an 8px porcelain dot; a missed stop is a hollow dashed dot. Today is enclosed in an amber capsule spanning all four lines. Labelled with an accessible summary ("Wed 4 of 4 lines").

### Capture Sheet
Bottom sheet on raised enamel with a 4px porcelain top rule, sliding up (0.35s, cubic-bezier(.16,1,.3,1)) over a 60% dark scrim; becomes a centred dialog on desktop. The snapshot option is a full-width porcelain tile (132px tall); barcode and typing are outlined tiles (96px) side by side.

### Nutrient Bars (planned, schema v2)
Per plate and per day, each nutrient (energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt) is one row: label, value with unit ("18 g"), and a thin horizontal bar against a reference. The reference is the EU Reference Intake (energy 2000 kcal, fat 70 g, saturates 20 g, carbohydrate 260 g, sugars 90 g, protein 50 g, salt 6 g; fibre about 25-30 g recommended) or, later, a target from the person's optional profile, and its source is named in text ("of the EU reference intake"). Rules:
- Track in Night Rule, fill in one neutral colour (porcelain-dim), a 1px reference tick in porcelain. The fill is a single colour for every nutrient and every value, including above the reference: it never turns red, amber or any line ink, and it never changes with the amount.
- The bar is clamped at the track end and, past the reference, says so in plain words ("about 120% of the reference"), with no exclamation, no "over budget", no "remaining".
- The value and unit are always text, and the bar is `aria-hidden` or exposed as a `meter` with the same sentence. Colour and length are never the only signal. Do not use `role="progressbar"` (the No-Dark-Patterns test bans it for spinners).
- Estimates carry "~" ("~18 g"); uncertain ones may be a range ("~15-20 g").
- No rings, donuts or radial gauges, no per-meal grades, no summed "score". Nutri-Score and NOVA appear only as Open Food Facts product information, attributed ("Nutri-Score B, from Open Food Facts"), never as a grade of the person.
- Square-ended bars, no shadow, no animation beyond the reduced-motion-safe fade.

### Arrival Motion
When a plate resolves, the station capsule draws in (0.55s) and each present line's stop dot pops onto it in line order, staggered 60ms. While resolving, an amber condensed "Reading the plate…" line replaces the hint; no spinner. Reduced motion skips to the end state.

## Do's and Don'ts

### Do:
- **Do** show real nutrient values as value + unit text with a neutral bar against a named reference, with "~" on estimates (see Nutrient Bars).
- **Do** express balance only as which lines stopped at a station: dots on lines, line-bar cells, day-list segments.
- **Do** pair every line colour with its name or a text summary ("Dairy passed through without a stop") so colour is never the only signal.
- **Do** draw absent or pending states dashed and neutral (open station, missed stop, passed line).
- **Do** keep controls square with 2px outlines and at least 48px targets (44px only for inline portion presets).
- **Do** use starch amber for focus and "you are here", always with an outline, ring or underline shape.
- **Do** put Barlow Condensed uppercase on names and actions and Barlow on sentences.

### Don't:
- **Don't** introduce rings, donuts, radial gauges, scores, grades or points. Balance is shown by lines; nutrient quantities by the neutral Nutrient Bars only.
- **Don't** colour a nutrient value red, amber or any line ink, or write "over budget", "remaining", "exceeded" or "calories left"; numbers are information, not a limit the person has failed.
- **Don't** use a line ink for anything other than its food group, and don't use protein scarlet as an error or warning colour.
- **Don't** round the corners of buttons, cards, chips, fields or sheets; roundness belongs to stops, rings and station capsules.
- **Don't** add drop shadows or blur for depth; use the raised enamel plane or a rule.
- **Don't** bend a line at any angle other than 45° or 90°.
- **Don't** load fonts from a CDN.
- **Don't** outline a control with the night rule (1.7:1). Unselected controls use the control edge (the raised control edge on the sheet and the dock); selected ones use porcelain.
