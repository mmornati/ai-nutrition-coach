---
title: OpenPlate — DESIGN
status: final
created: 2026-08-13
updated: 2026-08-13
colors:
  canvas: '#F6F3ED'
  surface: '#FDFCF9'
  ink: '#2C2A25'
  muted: '#716B5E'
  accent-sage: '#6E8376'
  sage-deep: '#54685C'
  sage-tint: '#E9ECE5'
  on-track-green: '#52705A'
  amber-warm: '#A45B31'
  hairline: '#E2DCD0'
  mono-chip-ink: '#6F695C'
  tipjar: '#8F5E2B'
  danger: '#B05A3C'
  canvas-dark: '#221F1B'
  surface-dark: '#2C2924'
  ink-dark: '#EDE9DF'
  muted-dark: '#9D9688'
  accent-sage-dark: '#8FA68B'
  sage-deep-dark: '#A9BCA0'
  on-track-green-dark: '#7FA37F'
  amber-warm-dark: '#D2A070'
  hairline-dark: '#3B372F'
  mono-chip-ink-dark: '#8E8778'
  tipjar-dark: '#D29652'
  danger-dark: '#C96F4C'
typography:
  kicker:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas'
    fontSize: 12px
    fontWeight: '500'
    letterSpacing: '0.3em'
    textTransform: 'uppercase'
  day-title:
    fontFamily: '-apple-system, "SF Pro Display", "Segoe UI", system-ui'
    fontSize: 34px
    fontWeight: '300'
    letterSpacing: '-0.005em'
  meal:
    fontFamily: '-apple-system, "SF Pro Display", "Segoe UI", system-ui'
    fontSize: 19px
    fontWeight: '400'
    letterSpacing: '-0.005em'
  label:
    fontFamily: '-apple-system, "SF Pro Display", "Segoe UI", system-ui'
    fontSize: 13px
    fontWeight: '500'
    letterSpacing: '0.14em'
    textTransform: 'uppercase'
  qty:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas'
    fontSize: 12.5px
    fontWeight: '400'
  grace:
    fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype"'
    fontSize: 14px
    fontStyle: 'italic'
  coach:
    fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype"'
    fontSize: 18px
    fontStyle: 'italic'
    lineHeight: '1.6'
  chip:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas'
    fontSize: 9.5px
    fontWeight: '500'
    letterSpacing: '0.05em'
  arcnote:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas'
    fontSize: 11.5px
    fontWeight: '400'
  week-lead:
    fontFamily: '-apple-system, "SF Pro Display", "Segoe UI", system-ui'
    fontSize: 15px
    fontWeight: '300'
  foot:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas'
    fontSize: 10px
    fontWeight: '400'
    letterSpacing: '0.22em'
    textTransform: 'uppercase'
rounded:
  sm: 5px
  md: 24px
  lg: 28px
  sheet-top: 34px
  pill: 26px
  full: 999px
spacing:
  unit: 4px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 32px
  '8': 40px
components:
  button-primary:
    background: '{colors.sage-deep}'
    foreground: '{colors.surface}'
    radius: '{rounded.pill}'
  chip:
    background: '{colors.surface}'
    border: '{colors.hairline}'
    radius: '{rounded.sm}'
    font: '{typography.chip}'
  chip-on:
    background: '{colors.sage-tint}'
    border: 'rgba(84,104,92,.3)'
    radius: '{rounded.sm}'
  snapshot-tile:
    background: '{colors.sage-deep}'
    foreground: '{colors.surface}'
    radius: '{rounded.lg}'
  subtile:
    background: '{colors.canvas}'
    border: '{colors.hairline}'
    radius: '{rounded.md}'
  capture-sheet:
    background: '{colors.surface}'
    borderTop: '{colors.hairline}'
    radiusTop: '{rounded.sheet-top}'
  fab:
    background: '{colors.accent-sage}'
    foreground: '{colors.surface}'
    radius: '{rounded.full}'
---

# OpenPlate — DESIGN

> Visual contract for OpenPlate, the open-source family nutrition coach — *yours to run*. Locks the D × F "Calm Coach, Self-Hosted" direction the user approved. Companion to `EXPERIENCE.md` (behavior); the PRD (`planning-artifacts/prds/prd-openplate-2026-08-12/prd.md`) is the requirements authority.

## Brand & Style

OpenPlate is a **coach, not a calculator** (PRD §1, §5). Its design language is the fused D × F direction approved from the working mocks: Direction D "Calm Coach" (spa restraint, no cards, one muted sage, big quiet type, serif-italic whisper) is the whole room; Direction F "Dev-Friendly OSS" is admitted only as quiet detail — a hairline rule under the day marker, a tiny mono status chip per plate, and a *yours to run · open source* footmark. F never raises its voice.

The register is **warm, calm, trustworthy** — a still, quiet table, not a glossy dashboard. There is no gamification, no streak chrome, no score. Balance is shown as an arc of food groups and asked about as a question ("how's the balance across your plate?"), never printed as a verdict and a number.

Open-source pride is worn lightly. It whispers in 9.5px mono at the floor of the day; it does not badge the header. **Dark mode ships in v1** (warm ink canvas + sage glow, per the decision record).

## Colors

Sage & Cream (chosen register, color-themes-1.html variation 1): warm paper canvas, one muted sage accent, deep warm charcoal ink, soft amber warmth. Light and dark are both in scope — the evening kitchen and offline use are real OpenPlate moments.

| Token | Light | Dark | Role |
|---|---|---|---|
| `{colors.canvas}` | `#F6F3ED` | `#221F1B` | App background — barely-warm paper / warm ink |
| `{colors.surface}` | `#FDFCF9` | `#2C2924` | Raised surfaces: chips, capture sheet, "Sure" pill |
| `{colors.ink}` | `#2C2A25` | `#EDE9DF` | Primary text — quiet charcoal / warm cream |
| `{colors.muted}` | `#716B5E` | `#9D9688` | Secondary text, plate labels, week lead body (AA-normal on canvas) |
| `{colors.accent-sage}` | `#6E8376` | `#8FA68B` | The **single** accent: balance arcs, fab, week-on dots (fills/graphics ≥3:1) |
| `{colors.sage-deep}` | `#54685C` | `#A9BCA0` | Pressed accent: primary action, coach emphasis, arcnote |
| `{colors.sage-tint}` | `#E9ECE5` | — | Faint sage wash behind the `· synced` chip `[ASSUMPTION: dark-mode sage-tint derives from accent ~12% alpha over canvas, the color-themes `color-mix` pattern; no hex specified for dark]` |
| `{colors.on-track-green}` | `#52705A` | `#7FA37F` | Balanced-day count in the week lead (AA-normal on canvas) |
| `{colors.amber-warm}` | `#A45B31` | `#D2A070` | The gentle pause — "Ask later" button, soft warm notes (AA-normal text on canvas) |
| `{colors.hairline}` | `#E2DCD0` | `#3B372F` | 1px rules and the arc track — lowest legible contrast |
| `{colors.mono-chip-ink}` | `#6F695C` | `#8E8778` | Status-chip text (`· local` / `· pending` / `· synced`) — AA-normal on surface |
| `{colors.tipjar}` | `#8F5E2B` | `#D29652` | Tip Jar affordance — Settings only, never interrupts (FR-15) |
| `{colors.danger}` | `#B05A3C` | `#C96F4C` | Documented, **intentionally unused** on this calm surface |

**Color rule: color is for coaching states only — there is NO red-as-guilt.** `danger` exists in the token set but no surface uses red to signal failure of the user. There are no "bad" days; there are days yet to be balanced. The week strip fills calm green (`{colors.accent-sage}`) on balanced days and leaves others neutral — no red days (see PRD §4.7, FR-15, and the competitor digest's "green means go, red means stop" note).

Avoid: saturated accent variants, gradient surfaces, more than one accent, red state fills, decorative color. One muted sage, one warm note, warm neutrals.

## Typography

Three voices with **strict roles**:

- **Humanist sans** (`-apple-system`, "SF Pro Display", "Segoe UI", system-ui) — all UI text: day title, meal names, plate labels, buttons, week lead.
- **Serif italic** (Georgia, "Iowan Old Style", "Palatino Linotype") — reserved for the **coach whisper only**: the grace line under a meal, the coach paragraph, the open-dent whisper. Never in labels, buttons, or data.
- **Mono** (ui-monospace, "SF Mono", Menlo, Consolas) — the F-flourish: status chips, quantity, arc note, day kicker, version, footmark.

| Role | Spec | Voice |
|---|---|---|
| Day kicker | `{typography.kicker}` | Mono, tracked uppercase — "Tuesday · the close of the day" |
| Day title | `{typography.day-title}` | Sans light, unhurried — "Tue · dinner *done*" |
| Meal name | `{typography.meal}` | Sans, quiet |
| Plate label | `{typography.label}` | Sans medium, tracked uppercase — "Breakfast" |
| Quantity | `{typography.qty}` | Mono — honest ranges only: "~2 fists", never fake-exact kcal (PRD FR-1) *(Superseded 2026-10-21 by `docs/adr/0006-nutrition-numbers-calm-framing.md`: real numbers, calm framing.)* |
| Grace line | `{typography.grace}` | Serif italic — the per-meal whisper ("A soft start, remembered.") |
| Coach paragraph | `{typography.coach}` | Serif italic, leading 1.6 — the one true voice of the coach |
| Status chip | `{typography.chip}` | Mono — "· local" / "· synced", ~9.5px, never louder than the coach |
| Arc note | `{typography.arcnote}` | Mono — "3 of 4", "reading…" |
| Week lead | `{typography.week-lead}` | Sans light — "This week: 4 balanced days" |
| Footmark | `{typography.foot}` | Mono, tracked uppercase — "yours to run · open source" |

Dynamic type is honored at every level (accessibility floor, EXPERIENCE.md) — the largest setting must still render without truncation.

## Layout & Spacing

**One screen = one day** (the Day Board): a vertical stack of plate rows — Breakfast / Lunch / Dinner — divided by hairline rules, never borders or fills. Generous whitespace: the scroll area breathes at `{spacing.8}` top, `~{spacing.7}` between major blocks, `{spacing.6}` of quiet around each plate row. No card sprawl — no filled containers, no dashboard grid, no "Today" screen made of cards (anti-model: MFP, competitor digest).

Scale is 4-based (`{spacing.unit}`): 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px. The largest gaps land between major surfaces (day header → plates → coach → week); the smallest sit between tightly related elements (arcnote ↔ chip, `· synced` ↔ label).

The full day is always visible without a scroll-to-button guardrail — capture is one floating thumb-reach, not a hunt.

## Elevation & Depth

No chrome, hairline rules not shadows. Plates rest directly on `{colors.canvas}`, separated by 1px `{colors.hairline}`. The only elevated elements are the **single floating sage fab (`+`)** and the **sage "Sure" pill** — both at `{colors.accent-sage}`/`{colors.sage-deep}`. The capture sheet is the one object that lifts — it is literally a raised sheet — and earns a single soft shadow plus a `{colors.hairline}` top rule. Hierarchy comes from layout and typography, never from elevation.

## Shapes

Calm, not cute. Small radii on details, gentle rounding on the sheet, and fully-round only where the object is naturally round.

- Chips: `{rounded.sm}` (5px)
- Capture subtiles (Scan barcode / Type or talk): `{rounded.md}` (24px)
- Snapshot tile: `{rounded.lg}` (28px)
- Capture sheet top corners: `{rounded.sheet-top}` (34px)
- Buttons: `{rounded.pill}` (26px)
- Fully round (`{rounded.full}`): the fab, the week mini-dots, the sheet grab bar

Imagery (plate photos) follows container corners exactly.

## Components

- **Day header + hairline** — mono kicker, large sans day title, then a 1px hairline row carrying `openplate · v0.4.2` left and the `· local` chip right. The F-detail seam.
- **Plate row** — label + right cluster (arcnote + status chip) over an arc-and-legend row. Hairline-divided, tap-to-expand (EXPERIENCE.md). No card, no fill.
- **Balance arc** — per-meal 4-segment ring: Veg&Fruit / Protein / Starch / Dairy, in `{colors.accent-sage}` on a `{colors.hairline}` track. Filled segments show the plate's current balance; "3 of 4" reads in mono.
- **The dent** — the open/empty plate: a dashed sage ring with a soft center dot and a whisper ("An open, quiet place."), never an empty-state accusation.
- **Coach whisper** — serif-italic paragraphs in two plate-level anchors: a **post-resolve whisper** under the just-logged plate ("Nice balance — two colors of veg, lean protein. Want the fiber breakdown?") and an **open-plate hint** under the next/empty plate ("Greens would round this plate out — want a 10-second suggestion?"). Each as a question, with `Sure` (sage pill) and `Ask later` (quiet outline, `{colors.amber-warm}`) options. (EXPERIENCE.md anchors the two; SM-2 counts the post-resolve engagement.)
- **Status chips** — `· local` / `· pending` / `· synced` (`{colors.mono-chip-ink}`, hairline border; synced = sage-tint wash). The sync whisper flips `· syncing → · synced` (CSS-only, calm).
- **Week strip** — 7 mini-dots, `{colors.accent-sage}` fill only on balanced days, neutral outline otherwise, with the mono whisper "no streaks · no countdowns · no guilt". Tap-a-day navigation (no week-report screen in v1).
- **Capture button** — the single floating `+` fab (bottom right, `{colors.accent-sage}`).
- **Capture sheet** — `{colors.surface}` bottom sheet: dominant **Snapshot** tile (`{colors.sage-deep}`) with camera lens mark, plus two subtiles (Scan a barcode / Type or talk). Quick-repeat re-shoot affordance for multi-meal capture.
- **Footmark** — "yours to run · open source" in mono at the floor of the day.
- **Settings** — one calm list (Your AI / Your data / Tip Jar / About), each row opening a sub-screen. Tip Jar is `{colors.tipjar}`-tinted and never interrupts a flow (FR-15).

Behavior, states, and flows for all of the above live in `EXPERIENCE.md`.

## Do's and Don'ts

| Do | Don't |
|---|---|
| One muted sage accent, used for coaching states and the fab | Color-code by sentiment; red as a guilt signal for the user (there are no red days) |
| Hairline rules at lowest legible contrast | Card fills, shadows as hierarchy, gradient surfaces |
| Big quiet sans type, serif italic reserved for the coach | Set UI text in the serif; set coach text in the sans |
| Honest quantity ranges ("~2 fists") | Fake-exact kcal or false-decimal precision (FR-1, UJ-4 honesty) *(Superseded 2026-10-21 by `docs/adr/0006-nutrition-numbers-calm-framing.md`: real numbers, calm framing.)* |
| Tiny mono status chips that whisper self-host pride | Loud branding, header badges, marketing copy in the chrome |
| One calm, generous day at a time | Card-dense "Today" dashboards that bury the plate (anti-model: MFP, competitor digest) |
| Gentle quiet states: shimmer, fade, flip | Spinners, countdowns, celebratory pop-ups, streak chrome |
| Coach asks a question, names what-is-there first | Coach prints a verdict, a score, or a guilt trip (FR-4) |
| The full day is always visible | Scroll-to-button capture guardrails |
