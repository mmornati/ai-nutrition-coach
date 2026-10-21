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

## Support

Food and weight can weigh on people. The app carries one calm, always-available line, in
*Settings → Nutrition* (under the numbers switch), in the "What are reference intakes?"
disclosure under the bars, and next to the goal choice in *Settings → Profile* when the goal is to
lose weight: "If food or weight worries take up a lot of your thoughts, talking to someone can
help." followed by a link. It never tells anyone they have a problem, and it is not conditioned on
anything the person logged. The link opens in a new tab (`rel="noopener noreferrer"`) and is never
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
  ([`docs/release-checklist.md`](./release-checklist.md)) re-runs
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
- [`docs/release-checklist.md`](./release-checklist.md) — the
  release checklist; this standard is the gate.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path;
  the named-reviewer sign-off lives here.
