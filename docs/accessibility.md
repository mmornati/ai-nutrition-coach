# AI Nutrition Coach — accessibility floor (NFR-7 / NFR-8 / UX-DR-12 / UX-DR-13)

The floor is **measured by tests that run axe**, not by grepping for the word
`aria`. (An earlier checker passed any file that merely contained a keyword; it
measured nothing and was replaced.)

## The web app (`apps/web`)

The floor is measured like this:

- **Dark only.** The Food Lines world has one theme, midnight enamel with porcelain ink
  (`DESIGN.md`); no light theme exists, so there is one contrast context to measure, not two. If a
  light variant is ever added, every check below must run in both.
- **Per screen, with axe.** Every screen component under `apps/web/src/screens/**` needs a test
  that renders it, calls `axe()` (vitest-axe) and asserts `toHaveNoViolations()`.
  `tools/check_accessibility_floor.mjs` (run by `pnpm verify`) enumerates the exported components
  there and fails when one has no such test (skipped tests, comments and a test that never mentions
  the component do not count). Layout helpers that only ever render inside a screen are listed in
  the script with the screen that hosts them; a stale entry fails. The script is itself tested
  (`apps/web/src/a11y-floor-gate.test.ts`).
- **In a real browser.** jsdom has no layout, so axe cannot compute colour contrast or target size
  there. `apps/web/e2e/journey.spec.ts` runs `@axe-core/playwright` (WCAG 2.0/2.1/2.2 A and AA,
  which include contrast) on every settings screen at 390 px and 1440 px, and the gallery spec does
  so for the components. Both run in Chromium and WebKit.
- **Reflow and text size.** The same journey spec checks every settings screen for horizontal
  scroll at 390 px and 1440 px and at 200 % text (the root font size doubled; all type is `rem`).
  The phone dock's seven 48 px stops need 336 px: narrower (320 px, or 400 % zoom) the week route
  scrolls sideways inside the dock rather than sticking out of it, with the selected stop kept in
  view and the far stop peeking in at the edge. `apps/web/e2e/french.spec.ts` measures the dock at
  320 px and 375 px in English and French.
- **Targets and names.** Touch targets are at least 48 px (the primitives set `min-h-12`); on a
  phone the dock holds only the seven-stop week route (each stop is at least 48 px wide) and "Log a
  plate" floats above it as a 56 px square. `apps/web/e2e/targets.spec.ts` measures every
  interactive element on Today, Week, Plate, the capture sheet and Unlock at 390 px and 1440 px
  (an inline link inside a sentence is the only exemption). Every control has an accessible name,
  and state (a chosen option, a switch, a disabled tier) is carried by a tick or text, never by
  colour alone.
- **i18n.** `apps/web/eslint.config.js` runs `i18next/no-literal-string` in mode `all` over every
  `.tsx` under `src/` (tests, `main.tsx` and the dev gallery excepted): JSX text, ternary and
  template children, `aria-label={'...'}`, the text of any prop on a custom component, and a
  string handed to a state setter all fail. A lower-case token (a union member, an id) and
  strings inside `cn()` are not copy. The copy lives in `src/i18n/en.ts`;
  `src/components/i18nGate.test.ts` proves each case.

## What is _not_ measured

The checks cannot see everything. Not covered by an automated check, and so not claimed as
verified:

- keyboard traversal order and focus visibility beyond the dialogs and sheets;
- VoiceOver and TalkBack behaviour on a real device (only axe, the accessibility tree and
  Playwright's Chromium and WebKit; a known accepted gap);
- reduced-motion beyond the Day Board and the capture sheet;
- states that need a live camera or an OS dialog;
- a light theme: there is none (a known accepted gap), so there is one contrast context.

## Palette

Tokens live in `apps/web/src/styles` (Food Lines, `DESIGN.md`); touch targets are at least 48 px.
Colour is never the only signal: states carry text.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
- [`docs/adults-only.md`](./adults-only.md)
- [`CONTRIBUTING.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/CONTRIBUTING.md)
