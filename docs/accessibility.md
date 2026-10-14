# AI Nutrition Coach — accessibility floor (NFR-7 / NFR-8 / UX-DR-12 / UX-DR-13)

The floor is **measured by widget tests**, not by grepping for the word
`Semantics`. (An earlier checker passed any file that merely contained
`Semantics(`; it measured nothing and was replaced.)

## The web app (`apps/web`)

The React PWA replaces the Flutter screens, and its floor is measured like this:

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
- **Targets and names.** Touch targets are at least 48 px (the primitives set `min-h-12`); every
  control has an accessible name, and state (a chosen option, a switch, a disabled tier) is carried
  by a tick or text, never by colour alone.
- **i18n.** `apps/web/eslint.config.js` fails a string literal in JSX text or in `aria-label`,
  `title`, `alt` or `placeholder` for every `.tsx` under `src/` (tests, `main.tsx` and the dev
  gallery excepted); the copy lives in `src/i18n/en.ts`.

Still not measured automatically: keyboard order beyond the dialogs and sheets, and real screen
readers (VoiceOver, TalkBack).

The sections below describe the Flutter floor, which stays until the app is removed (plan phase 9).

## What is measured

`apps/client/test/a11y/screen_guidelines_test.dart` pumps every screen under
`apps/client/lib/screens/` — plus the recognized-food sheet, the open-plate
hint, the coach whisper and the depth panel — with the real app theme
(`buildAppTheme`) and the real localization delegates, in **light and dark**, in
the states a user actually sees (empty, with data and a seeded coach note,
camera denied, locked, own-key form open, ...). The surface is phone-wide and
**2400 dp tall on purpose**: Flutter's guidelines skip nodes that are off
screen (see `accessibility.dart` in the SDK: hidden or "too far off screen"
nodes are dropped), so on a normal 800 dp phone anything below the fold would
silently go unmeasured. Each one
must satisfy all four of Flutter's own guidelines
(`apps/client/test/a11y/a11y_helpers.dart`):

| Guideline                   | Asserts                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `androidTapTargetGuideline` | every tappable node is at least 48 × 48 dp                                     |
| `iOSTapTargetGuideline`     | every tappable node is at least 44 × 44 pt                                     |
| `labeledTapTargetGuideline` | every tappable node has a screen-reader label                                  |
| `textContrastGuideline`     | text meets WCAG contrast (4.5:1, 3:1 for large text) against what is behind it |

`tools/check_accessibility_floor.dart` (run by `melos run check:a11y` and
chained into `melos run check:release-posture`) parses the code with the
analyzer and fails unless every public widget class in
`apps/client/lib/screens/` is constructed inside a `testWidgets` / `a11yTest`
body under `test/a11y/` that also calls `expectMeetsAllGuidelines` (comments and
strings do not count), so a new screen cannot ship without one.

Running them found, and this change fixed: muted text, the sage "sure" pill,
sage text on cream (Your data pills, the quick-repeat link, the open-plate
hint) and the amber coach colour below 4.5:1 (the palette tokens were adjusted;
fills keep the sage), a plate row whose quantity and sync chip overflowed a
phone-width screen, and the coach whisper's two pills overflowing the row's text
column.

## What is _not_ measured

The guidelines cannot see everything. Not covered by an automated check, and
so not claimed as verified:

- keyboard traversal order and focus visibility;
- TalkBack / VoiceOver behaviour on a real device (only the semantics tree);
- dynamic type at the largest OS setting (Flutter scales text by default; there
  is no test at 200 %);
- reduced-motion: the whisper, hint, depth panel and shimmer widgets branch on
  `MediaQuery.disableAnimations` / `accessibleNavigation`; only the Day Board
  and capture sheet / FAB tests exercise that branch;
- states that need a live camera or an OS dialog.

## Palette

Tokens live in `apps/client/lib/theme/app_tokens.dart`; touch targets use
`AppTouchTargets.min` (48). Colour is never the only signal: states carry text.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
- [`docs/adults-only.md`](./adults-only.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
