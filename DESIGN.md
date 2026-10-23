---
name: AI Nutrition Coach
description: The day as a striped kitchen towel. Each meal weaves one band; each food group on the plate is a dyed stripe across it.
colors:
  ink: "#262421"
  ink-soft: "#4A453F"
  thread: "#6B655E"
  veg: "#1F7A4D"
  protein: "#B5262E"
  starch: "#C08420"
  dairy: "#2D5DA8"
  cloth: "#FBFBF8"
  raised: "#FFFFFF"
  seam: "#E4E1DA"
  control: "#8A847B"
  control-raised: "#857F76"
  scrim: "rgb(38 36 33 / 0.45)"
  cotton-on-ink: "#D9D5CC"
  cotton-faded: "#BDB7AD"
  control-on-ink: "#9A948A"
typography:
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "3.125rem"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.035em"
  display-desktop:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "4.25rem"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline-desktop:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  button:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  label:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  quantity:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  literal:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.92em"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  tag: "4px"
  cloth: "8px"
  sheet: "16px"
  pill: "9999px"
  device: "44px"
spacing:
  gutter: "20px"
  gutter-desktop: "28px"
  column-gap: "36px"
  fab-size: "56px"
  fab-offset: "92px"
  fab-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "6px 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "6px 20px"
    height: "48px"
  button-floating:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "6px 20px"
    height: "48px"
  button-log:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px 0 18px"
    height: "{spacing.fab-size}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "48px"
  preset:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "48px"
  preset-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "48px"
  sewn-label:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "6px 12px"
    height: "36px"
  coach-label:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.cloth}"
    padding: "16px 18px"
  text-field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cloth}"
    padding: "0 14px"
    height: "56px"
  sheet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "20px"
  dialog:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cloth}"
    padding: "20px"
    width: "480px"
  rail-item-current:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "48px"
  button-on-ink:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "6px 22px"
    height: "48px"
  button-on-ink-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.cloth}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "6px 22px"
    height: "48px"
  device-frame:
    backgroundColor: "{colors.cloth}"
    rounded: "{rounded.device}"
    padding: "6px"
  terminal:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    typography: "{typography.literal}"
    rounded: "{rounded.cloth}"
    padding: "16px 22px 22px"
---

# Design System: AI Nutrition Coach

## Overview

**Creative North Star: "The Torchon"**

The day is a kitchen towel laid on the table. Each meal weaves one band across it; every food group on the plate is a dyed stripe across that band, and a group that is not there leaves bare cotton, drawn as a dashed seam. Balance is read from which stripes a band carries, never from a score, a ring or a countdown. The week is seven towels, folded in the phone dock and hung side by side on the week screen.

The ground is bright white cotton with a barely visible weave, set in warm near-black ink. Colour is rationed to the four dyes, and the dyes are rationed to food groups. Everything a person can press is a pill or a circle with a 2px edge; everything that states a fact is a small sewn label with a dashed stitch inside its edge. One grotesque family carries the whole interface: very heavy and tight for names, plain for sentences, sentence case throughout. The mood is daylight in a kitchen: calm, legible at arm's length, one-handed.

Motion is the weave itself. When a plate resolves its stripes are woven in from the left edge one after another; a plate being read breathes; nothing spins. Under reduced motion, stripes appear at once and entrances become a plain fade.

**Key Characteristics:**

- White cotton ground with a two-way 1px thread texture; ink text and ink rules.
- Four dyes, one per food group, in fixed order: veg and fruit, protein, starch, dairy.
- Absence is a dashed seam or a dashed outline, never a colour.
- Pill buttons with 2px ink edges, 4px sewn labels with a dashed stitch, 8px cloth panels.
- One family (Schibsted Grotesk), heavy names, plain sentences, sentence case.
- Flat cloth; a single white raised plane; one soft shadow, on the floating Log pill only.

## Colors

A white-cotton and warm-ink palette with four saturated dyes that each mean exactly one food group.

### Primary

- **Torchon Ink** (#262421): all primary text, the 2px edge of every button and sewn label, the filled primary pill and the floating Log pill, the 2px rule over day totals and the week's day list, the reference tick on Nutrient Bars, and the focus ring. 15.2:1 on cloth.

### Secondary (the four dyes)

Each dye is a food group and nothing else, always paired with the group's name in text. All four reach at least 3:1 on cloth as non-text stripes.

- **Garden Green** (#1F7A4D): vegetables and fruit.
- **Basque Red** (#B5262E): protein. Never an error or warning colour.
- **Ochre** (#C08420): starch. Shipped darker than the first proposal so the stripe clears 3:1 on cloth (3.09:1).
- **Indigo Blue** (#2D5DA8): dairy.

The "other" group has no dye: its stripe is a 3px dashed control-grey line.

### Neutral

- **White Cotton** (#FBFBF8): the page ground, under the weave texture; also the text colour on ink surfaces.
- **Label White** (#FFFFFF): the one raised plane: sewn labels, coach label, sheets, dialogs, the phone dock, the desktop rail, the floating button variant.
- **Soft Ink** (#4A453F): secondary sentences (hints, plate summaries, group names in legends) and the Nutrient Bars fill. 9.6:1 on cloth.
- **Thread Grey** (#6B655E): metadata, times, section headings, placeholders, "Written by AI" marks. 5.6:1 on cloth.
- **Seam** (#E4E1DA): dividers between rows and the dashes of bare cotton. Too faint to outline a control.
- **Control Edge** (#8A847B): the 2px outline of an unselected control on cloth (3.6:1), dashed empty bands, the scrollbar thumb.
- **Control Edge, Raised** (#857F76): the same outline on a white label, sheet or dock (3.7:1).
- **Scrim** (ink at 45%): behind sheets and dialogs.

### Named Rules

**The One Dye, One Group Rule.** A dye appears only where its food group is meant, always beside the group's name or a sentence naming it.

**The Bare Cotton Rule.** Absence is drawn, not coloured: a dashed Seam stripe where a group is missing, a dashed Control Edge band where a meal is still open.

## Typography

**Display Font:** Schibsted Grotesk (with system-ui, sans-serif), variable 400–900, self-hosted (Latin and Latin Extended subsets).
**Body Font:** the same family.

**Character:** One grotesque doing two jobs. Names are set very heavy and tight, so a day name reads like a woven label; sentences are set plain at 400 with generous leading.

### Hierarchy

- **Display** (900, 3.125rem / 4.25rem from 1024px, line-height 0.9, -0.035em / -0.04em): the screen's name ("Today", "This week"), top left; one per screen.
- **Headline** (800, 1.5rem / 1.875rem from 1024px, 1.05, -0.02em): meal names beside each band, sheet titles.
- **Title** (700, 1.25rem, 1.15, -0.01em): dialog titles, the rail's app name.
- **Section** (700, 0.9375rem, 1.25): section headings in Thread Grey ("Today's nutrition", "Day by day"), always real headings over real content.
- **Button** (700, 1rem, 1.15): every pill label.
- **Label** (600, 0.875rem, 1.25): sewn labels, field labels, group names in legends.
- **Quantity** (700, 1.1875rem, 1.2, -0.01em): nutrient values and portions, proportional figures, right-aligned.
- **Body** (400, 1rem, 1.45): sentences, the coach's question. Hints are capped near 34–40ch.
- **Body small** (400, 0.9375rem, 1.45): reference sentences under bars, captions, field messages.

Every size is in rem, so the whole interface follows the browser's text size.

### Named Rules

**The Sentence Case Rule.** Every name, button and heading is sentence case with no added tracking. Weight, not capitals, makes a name.

**The Heavy Name Rule.** Display and headline go heavy (900/800) with negative tracking; body text never goes above 400 except for a bold lead phrase.

## Layout

Phone first at 390px with a 20px gutter (28px from 1024px). The day is a stack of full-width bands separated by Seam rules; each band is a two-column grid: the stripe field on the left (104px, 136px from 1024px), bleeding to the screen edge, and the meal text on the right (headline name with the time at the far end, summary, one plain nutrient line). A band is at least 132px tall (144px on desktop).

On the phone a white dock fixed to the bottom under a 2px ink edge holds only the week of folded towels; the ink Log pill floats bottom right above it. The page's bottom padding is the dock offset plus the pill size plus 32px of air, and the same sum sets scroll padding so a focused control is never hidden behind the pill.

From 1024px a 240px white rail sits on the left (app name, navigation pills, a full-width Log pill, the storage note at its foot); the dock disappears. The week screen hangs seven towels side by side under weekday names, with group names down the left, followed by a day list ruled in 2px ink. Gate screens (unlock, create passphrase) are a single centred 440px column under a drawn towel.

## Elevation & Depth

Flat cloth. Depth comes from two planes only: White Cotton with its faint weave, and Label White for anything laid on top (labels, sheets, dock, rail). Edges are 2px ink or a Seam rule, not shadow. Sheets and dialogs sit over the ink scrim.

### Shadow Vocabulary

- **Floating pill** (`box-shadow: 0 10px 22px -10px rgb(38 36 33 / 0.7)`): the phone's floating Log pill only, because it floats over scrolling content.

### Named Rules

**The Laid-Flat Rule.** Nothing casts a shadow except the floating Log pill. A new surface is raised by turning it white and giving it an edge.

## Shapes

Three corner families. Pills and circles (fully round) for everything pressable: buttons, presets, icon buttons, the current rail item. Small sewn corners (4px) for labels, tags and tick boxes. Cloth corners (8px) for panels: the coach label, fields, dialogs, the open-meal band's right end. Bottom sheets take 16px top corners on phones and become 8px dialogs from 1024px. Stripes are square-ended bands; a folded towel in the dock is a 26×32px white rectangle with 3px corners.

**The Stitch Rule.** A sewn label carries a 1.5px dashed line inset 3px inside its edge, in its text colour at 35%, following its corners. It decorates labels that state something (storage status, the coach); it is never added to a button.

## Components

### Buttons

Bold, plain pills.

- **Shape:** fully round, 2px edge, at least 48×48px.
- **Primary:** ink fill, White Cotton label: the one action that moves the task on.
- **Secondary:** transparent with an ink edge and ink label.
- **Floating:** Label White with an ink edge, for a control over content.
- **Press / busy / disabled:** pressing scales to 0.98 over 150ms. Busy keeps focus, swaps the label for a progress phrase ("Logging…") and never shows a spinner. Disabled and busy turn the edge dashed at 60% opacity.
- **Icon button:** a 48px circle with a Control Edge outline (Raised variant on white); the current page takes an ink edge.

### Chips

- **Sewn label:** Label White, 2px ink edge, 4px corners, the stitch, Label type, at least 36px tall, with an optional 9px status dot. It states a fact and is not pressable.
- **Status dots:** on this device, an ink dot; synced, an ink dot with a thin ink ring; pending, an ink ring; retry later, a dashed Thread Grey ring. Each sits beside its words, so state never rests on colour.
- **Version tag:** a 1.5px Thread Grey outline, 4px corners, beside an unavailable choice.
- **Portion presets:** pills with a Control Edge outline; the selected preset fills ink with White Cotton text and is marked `aria-pressed`.

### Cards / Containers

- **Coach label:** Label White, 2px ink edge, 8px corners, the stitch, 16–18px padding. One question in body type, an optional heavy title, an optional "Written by AI" line in Thread Grey, then a primary and a secondary pill. It rises in once (0.35s, 8px).
- **Sheets:** Label White with a 2px ink edge; a bottom sheet with 16px top corners that slides up over 350ms on phones, a centred 560px dialog with 8px corners from 1024px. A headline title and a 48px close circle head every sheet.
- **Dialogs:** Label White, 2px ink edge, 8px corners, 480px wide at most.

### Inputs / Fields

- **Style:** Label White, 2px Control Edge, 8px corners, 56px tall, Label-type label above in Soft Ink.
- **Focus:** the frame turns ink and takes the ink focus ring.
- **Messages:** a calm Body-small line in Soft Ink, never red.
- **Tick boxes:** 24px, 4px corners, Control Edge Raised outline; checked fills ink with a drawn tick.

### Navigation

- **Desktop rail:** Label White with a 2px Seam edge. Items are 48px rows of icon plus 1.125rem semibold name in Soft Ink; the current page becomes a white pill with a 2px ink edge and ink text.
- **Phone dock:** seven folded towels, each a small white towel with a 1.5px edge carrying 3px stripes for the groups logged that day. A dashed edge means nothing logged; a small ink knot means logged with no group. The day showing is outlined in ink; today's name is bold and underlined.

### Day Towel (signature)

The day's meals as woven bands. A logged band shows four stripe rows (10px tall, 6px apart) in fixed group order: dyed where the group is on the plate, a dashed Seam row where it is not. An open meal is an empty band with a dashed Control Edge outline, open at the screen edge and rounded at its right end. A legend of the four dyes with their names sits above the bands. The weave is `aria-hidden`; each band's text carries its meaning.

**The Weave-In Rule.** When a plate resolves, its dyed stripes grow from the left edge one after another (0.5s each, 60ms stagger, the weave easing `cubic-bezier(0.16, 1, 0.3, 1)`). While it is being read, the empty band breathes between full and 45% opacity every 1.2s. Reduced motion shows the end state at once.

### Week Towels (signature)

Seven towels side by side under weekday names, group names down the left, each towel showing a dyed stripe for every group that appeared that day and a dashed Seam row for the rest; today's towel takes an ink outline. A plain sentence under it says which groups showed up. Below, a day list under a 2px ink rule: heavy day name, four small stripe segments (dashed when absent), and the plate count in Thread Grey.

### Nutrient Bars

Per plate, per day and as a weekly daily average, each nutrient with data (energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt) is one row between Seam rules: the name, the value with its unit in Quantity type at the right, a bar, and a sentence naming the reference ("about 24% of the EU reference intake (2000 kcal)" or "of your daily guide" when a profile is set). Sugars and saturates are indented under their parent in Soft Ink. Coverage gaps are said in a sentence, and "What are reference intakes?" opens a disclosure with a drawn chevron.

- The track is bare cotton (a 4px dashed Seam line); the fill is one neutral colour, Soft Ink, round-ended, for every nutrient and every amount; a 1px ink tick marks the reference.
- The fill is clamped at the track end; past the reference the sentence says so in plain words ("about 120% of the reference"), with no exclamation, no "over budget", no "remaining".
- Value and unit are always text and the bar is `aria-hidden`; colour and length are never the only signal. Never `role="progressbar"`.
- Estimates carry "~"; uncertain values may be a range.
- No rings, donuts, radial gauges, grades or summed scores. Nutri-Score and NOVA appear only as attributed Open Food Facts product information.
- The bar does not animate.

**The Neutral Thread Rule.** A nutrient bar is never dyed, never red and never changes colour with its amount.

### Public site (landing and docs)

The site (`website/`, `docs/stylesheets/torchon.css`) is the same towel at page size. It adds only these:

- **The ink band.** One full-bleed Torchon Ink section per page (the trust band), White Cotton text, a 2px White Cotton rule over its lists and 18% White Cotton rules between rows; the focus ring turns White Cotton inside it. Secondary text on ink is **Cotton on Ink** (#D9D5CC, 10.6:1) for sentences and **Faded Cotton** (#BDB7AD, 7.8:1) for section labels, fine print and placeholders in request lines. Pills on ink are a White Cotton fill with ink label, or a White Cotton 2px outline. The terminal panel is the one other ink surface: 8px corners, a sewn label restitched in White Cotton.
- **Literal type.** The system monospace stack (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`) is reserved for text a person types or a machine sends: commands, request lines, file names. It is never a heading, label or UI face; everything else stays Schibsted Grotesk.
- **Device frame.** A real app screenshot sits in a phone frame: a 10px ink bezel, 44px outer radius, 6px White Cotton mat, screen corners 30px top and 12px bottom. It may be laid on the cloth at a slight tilt (2.2° at most). No shadow, no reflection, no drawn notch. In docs, inline screenshots take a 2px ink edge with 16px (phone) or 8px (desktop) corners instead.
- **Defaults as lines.** A setting's state is a 3px line beside its word: solid White Cotton for on, dashed Control on Ink (#9A948A) for off, with a small legend in the heading. The word always carries the state.
- **Ruled lists.** Lists of facts, steps, rules, tiers and doc links open under a 2px ink rule and separate with 1px Seam rules, a heavy name over a Soft Ink sentence. Steps count in 900 numerals; doc links end in a drawn chevron that slides 4px on hover.
- **Result band per way in.** Each way of logging carries a small woven band (8px stripes, 5px apart) showing the plate it produces, with the plate named in Label type beside it.
- **Towel hem.** The footer opens with a full-width hem of the four dyes as 6px rows, 4px apart, under a 2px ink rule; the docs header carries the same hem at 3px. It is the site's mark, `aria-hidden`, always all four in fixed group order: the one place the dyes appear without a group named, and only in site chrome, never in the app or on content.

## Do's and Don'ts

### Do:

- **Do** show balance only as which dyed stripes a band, towel or day row carries.
- **Do** pair every dye with its group's name or a sentence, so colour is never the only signal.
- **Do** draw absent and pending states dashed and neutral (bare cotton, open band, empty towel, disabled pill).
- **Do** show nutrient values as value and unit text with a neutral Soft Ink bar against a named reference, with "~" on estimates.
- **Do** make every control at least 48×48px, pills and circles with a 2px edge (Control Edge unselected, ink selected or current).
- **Do** use the ink focus ring (3px at 2px offset), turning White Cotton on ink surfaces.
- **Do** honour reduced motion: no weaving, no breathing, entrances collapse to a fade.
- **Do** self-host the type; Schibsted Grotesk ships from the app.

### Don't:

- **Don't** introduce rings, donuts, radial gauges, scores, grades, streaks, points or countdowns.
- **Don't** colour a nutrient value or bar red, ochre or any dye, or write "over budget", "remaining", "exceeded" or "calories left".
- **Don't** use a dye for anything other than its food group, and never use Basque Red as an error or warning colour.
- **Don't** outline a control with Seam; it is for dividers and bare cotton only.
- **Don't** add shadows or blur for depth; the floating Log pill is the only shadow.
- **Don't** set names in uppercase or with added letter-spacing.
- **Don't** show a spinner; a resolving band breathes and a busy button says what it is doing.
- **Don't** load fonts from a CDN.
