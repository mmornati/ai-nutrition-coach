# No-Dark-Patterns Standard — AI Nutrition Coach v1

The no-pressure UX promise is enforceable, not aspirational. This
page is the named-reviewer QA gate (FR-15 / NFR3 / AD-7). Every PR
that touches user-facing copy is signed off against this list;
every release tag includes this standard at HEAD.

## Banned everywhere

The following patterns are **banned everywhere** in v1. They do
not ship. The named reviewer ticks each one off on every PR.

- **Streaks** — no consecutive-day counts, no "don't break your
  streak" copy, no streak-loss banners.
- **Countdowns** — no "X hours until your quota resets" timers, no
  "X days until…" aff ordances. Honest reset copy only ("the
  quota resets tomorrow" or "at <human-readable local time>").
- **Badges** — no earned badges, no level-ups, no unlockable
  cosmetics tied to usage.
- **Celebratory pop-ups** — no "great job!" modals, no
  confetti, no fireworks, no celebratory sound on a successful
  commit.
- **Push-notification re-engagement** — no "we miss you"
  notifications, no scheduled re-engagement nudges, no
  notifications-as-a-feature.
- **Card sprawl** — no card grid on the Day Board (UX-DR3 / NFR6);
  one hairline-divided vertical stack only.
- **Red-guilt states** — no red on failure (FR-15); muted amber
  only, and only as a calm accent; the failure state is the same
  mono voice as the rest of the chrome.
  Nutrient values never turn red, amber or any warning colour,
  whatever their size.
- **Over-budget framing** — no "over budget", "exceeded", "calories
  remaining" or "left today" copy, no allowance being spent down, and
  no guilt-coloured numbers. App-invented scores, points and grades are
  banned with it.
- **Resolve spinners** — no `CircularProgressIndicator` on the
  resolve path; a quiet inline shimmer at most (UX-DR6); the
  chip-flip is `Opacity`-only.

## Allowed: real numbers, calmly framed

Since 2026-10-21 (ADR 0006, `docs/adr/0006-nutrition-numbers-calm-framing.md`)
the app may show grams, kcal and nutrient values. Allowed, with the
reviewer checking each use:

- Plain value + unit text ("about 18 g of sugars"), with "~" on estimates
  and ranges where data is uncertain.
- Neutral horizontal bars against a named reference (EU Reference Intake
  or the person's own target): one neutral colour, the same at every
  amount, with the value always in text (see `DESIGN.md`, Nutrient Bars).
- Open Food Facts Nutri-Score and NOVA as attributed third-party product
  information, never as a score of the person.
- A coach that states specific nutrition facts while still asking rather
  than scolding.

A number is information against a reference, never an allowance being
spent down. Rings, donuts, grades, points, red bars and "calories
remaining" stay banned.

## Allowed since 2026-11-15: your daily guide and optional body data

ADR 0008 (`docs/adr/0008-goals-body-data-daily-guide.md`) adds the following. The reviewer checks each use.

- The personal energy figure is called **"your daily guide"** (French "votre repère du jour"). Going past it is
  visible but neutral: same colour, plain text ("about 112 % of your daily guide").
- **One opt-in line, off by default**, in *Settings → Nutrition* (*Show the distance to my daily guide*): plain
  text, "about 450 kcal to your daily guide", and past it "about 120 kcal past your daily guide". No colour change,
  no icon, no ring, no allowance visual, never in the coach's voice. **This is the only place the wording "to your
  daily guide" and "past your daily guide" may appear.** Every other banned word stays banned there and everywhere:
  maximum, limit, budget, exceeded, over, and remaining as pressure.
- **Optional body data**: height, dated weigh-ins and dated waist. BMI and waist-to-height ratio may be shown as
  plain numbers next to the WHO and NICE reference ranges written as text, behind a disclosure, with the caveats
  (muscular build, 65 and over, pregnancy, the lower ranges for some backgrounds). Never a label on the person
  ("you are overweight"), never colour-coded.
- A coach that may help with weight loss when the person chose that goal, within the safeguards of ADR 0008.

- **Trends** (the weight trend, the weigh-in history and the intake history; the neutral name, never "Progress"
  or "Progrès": a weight is not progress or its opposite): the trend is drawn in one neutral ink with the weigh-ins
  as faint dots, an axis that never narrows below 4 kg or 5 % of the body weight, no goal line and no fill; it is
  described in words ("lower than", "higher than", "about the same as"), the value is always in text and a table
  carries the same data. The comparison names the real span between the points ("5.0 kg lower than 60 days ago").
  A weigh-in far from its neighbours is taken for a typing slip and left out of the trend, marked "not used for the
  trend" and still editable; a weight far from the last one is asked about once ("That is quite different from your
  last weigh-in. Save it as typed?", no figure repeated). One calm fixed line appears when the trend falls faster
  than about 1 % of body weight a week over 14 days, given at least 28 days of history, three weigh-ins spanning
  14 days within the last 28 and a latest weigh-in at most 14 days old (ADR 0008, Safeguards). **It appears in
  exactly three places: on Trends, next to the daily guide in Profile, and on Today**; it is the same ink and the
  same words, links to the pace choice, can be hidden for 14 days, and stays visible with numbers hidden. The
  first-run welcome and the one quiet "add a few details" line on Today are dismissible and asked of nobody twice.

Still banned with it: birth date, weight-change targets used as scores, streaks of weigh-ins, weigh-in reminders by
default, charts coloured good or bad, and any countdown or ring.

## Support

Food and weight can weigh on people. The app carries one calm, always-available line, in
*Settings → Nutrition* (under the numbers switch), in the "What are reference intakes?"
disclosure under the bars, next to the goal and pace choice in *Settings → Profile* (always, whatever the goal),
and once in the Body section (*Settings → Profile → Body*), covering weight, height and waist: "If food or weight worries take up a lot of your thoughts, talking to someone can
help." followed by a link. It never tells anyone they have a problem, and it is not conditioned on
anything the person logged. Separately, when a safeguard of ADR 0008 holds the daily guide at maintenance (a
low or unknown BMI with the goal to lose weight, a guide that could only be reached below the floor, pregnancy or
breastfeeding, or age 65 and over with a BMI below 30), a calm fixed line says so and points to a doctor or a
dietitian. English wording: "Your daily guide stays at what keeps your weight steady. If you want to lose weight,
talking to a doctor or a dietitian first can help." At 65 and over: "After 65, weight loss is best decided with a
doctor. Your daily guide stays at what keeps your weight steady." The link opens in a new tab (`rel="noopener noreferrer"`) and is never
fetched by the app; the exact URLs are allow-listed in `tools/check_no_external_hosts.sh`
(the scanner reads the built bundle, hrefs included) and defined in
`apps/web/src/components/nutrition/support.ts`.

One well-known organisation per language, verified 2026-10-21 (page loaded, correct organisation):

| Language | Organisation | URL |
| --- | --- | --- |
| English | Beat, the UK eating disorder charity (its helpline serves the UK only and the page tells visitors elsewhere to look for a local service) | https://www.beateatingdisorders.org.uk/get-information-and-support/get-help-for-myself/support-now/ |
| French | FFAB, Fédération Française Anorexie Boulimie (écoute téléphonique) | https://www.ffab.fr/trouver-de-l-aide/permanence-telephonique |

Re-verify both links at each release and update the date here.

**Crisis and emergency lines in Ask the coach** (shown as text only, no link and no fetch; a question about
self-harm or a possible emergency is answered on the device and never sent to an AI). Numbers verified 2026-10-21 on
the official pages:

| Where | Line | Source |
| --- | --- | --- |
| France | 3114, national suicide prevention number, free, 24 h/24 and 7 j/7 | https://3114.fr ("Le 3114 est accessible 24h/24 et 7j/7, gratuitement, en France entière") |
| United Kingdom | Samaritans, 116 123, free from any phone, any time | https://www.samaritans.org/how-we-can-help/contact-samaritan/ |
| United States | 988 Suicide & Crisis Lifeline, call or text 988, free, 24/7 | https://988lifeline.org/ |
| Emergencies | 112 (EU), 999 (UK), 911 (US), 15 or 112 (France) | Standard national emergency numbers |

The self-harm copy names the French and the UK and US lines and, elsewhere, the local emergency number or a crisis
line; the urgent-symptom copy names the four emergency numbers.

## Named reviewer

The named reviewer owns the pass on every PR that touches
user-facing copy. The reviewer is recorded in the PR thread and
the durable sign-off lives in the release artefact. v1's named
reviewer is the project's lead maintainer; the role is
documented in `CONTRIBUTING.md` and is the single sanctioned
authority for the gate.

## Gate frequency

- **Every PR that touches user-facing copy** — a PR that touches
  a file under `apps/web/src/components/`, `apps/web/src/screens/`,
  `apps/web/src/i18n/`, `packages/core/src/coach/`, or any
  user-visible string in the docs requires a named-reviewer
  sign-off against this list.
- **Every release tag** — the release checklist
  ([`docs/release-checklist.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/release-checklist.md)) re-runs
  the gate end-to-end at tag time. The tag cannot ship until the
  sign-off is recorded.

## Surface where the gate is enforced

The gate has two enforcement surfaces:

1. **Code-level** — every user-facing string is keyed: UI copy in
   `apps/web/src/i18n/en.ts` and its French twin `apps/web/src/i18n/fr.ts`
   (`pnpm lint` rejects a string literal handed
   straight to JSX text, `aria-label`, `title`, `placeholder`, ...), coach
   copy keyed in `packages/core/src/coach`. The banned components and words
   are pinned by `apps/web/src/no-dark-patterns.test.ts`; the French
   catalogue has its own banned-vocabulary test in
   `apps/web/src/i18n/fr.test.ts`.
   The key stores are the single source of truth; a new
   string is a new key, and the named-reviewer tick is required
   for the PR that introduces the key. The `en*` value in the
   same file is the canonical, calm, non-judgmental copy.
2. **Docs-level** — every user-facing privacy / posture claim in
   `docs/ai-tiers.md`, `docs/self-host.md`, `docs/your-data.md`,
   and `docs/telemetry-posture.md` is checked against this list.
   `pnpm check:telemetry` pins the docs-vs-code invariant
   (Story 4.5).

## Cross-references

- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface; same
  no-pressure promise.
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture; the no-telemetry invariant is part of this
  gate.
- [`docs/self-host.md`](./self-host.md) — the self-host install;
  same posture.
- [`docs/release-checklist.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/release-checklist.md) — the
  release checklist; this standard is the gate.
- [`CONTRIBUTING.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/CONTRIBUTING.md) — the contributor path;
  the named-reviewer sign-off lives here.
