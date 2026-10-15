# Multi-language plan: English + French

Goal: ship the PWA in English and French, with the language chosen per person and kept with their
data. A third language touches `src/i18n` plus `catalog/`, `ai/` and `public/boot-guard.js` (see
`CONTRIBUTING.md`, "Adding a language"); no screen or component changes.

## Status: done

All five phases are implemented (A: locale plumbing, B: preference, C: French catalogue, D: food
data and AI, E: shell and docs). What was hard-wired to English at the start, and where it went:

| Place | Now |
| --- | --- |
| `src/i18n/index.ts` | Current locale held by `LocaleProvider`; `Intl` objects cached per locale (`perLocale`) |
| `src/components/day/format.ts`, `src/screens/settings/format.ts` | Locale-aware date formatters |
| `index.html` | Static `lang="en"` default; `public/boot-guard.js` sets `<html lang>` before the app bundle runs, `LocaleProvider` keeps it current |
| `public/manifest.webmanifest` | One manifest, `lang: en`, unchanged brand name (`docs/pwa.md`) |
| `public/boot-guard.js` | Has no user-facing text, so nothing to translate |
| `src/catalog/seed-foods.ts` | Stable ids; names/units live in `foods.*` of each catalogue |
| `src/catalog/food-group-classifier.ts` | One shared keyword list covering English and French |
| `src/ai/openai-compatible-provider.ts` | `RECOGNITION_PROMPTS`: a fixed template per locale |
| `src/catalog/off-barcode-source.ts` | `NAME_FIELDS` per locale; requests `product_name_fr` |
| Persisted plates | Still store the text they were logged with; seed foods re-derive from `sourceRef` |

## Decisions taken during implementation

- The hint key is `anc.pwa.locale` (`LOCALE_HINT_KEY`), swept by erase with the other `anc.pwa.` keys.
- The language is not part of the JSON export (a strict plates envelope).
- A first run (no store yet) ignores and clears the hint.
- A locked or unreadable store is "unknown": it changes neither the hint nor the language.
- The late meal slot is "Nuit" in French.
- Seed `sourceRef` values (`seed:apple`) are unchanged.
- The AI recognition prompt is a fixed per-locale template; the `group` enum stays English.
- Exports can mix languages (names are stored as logged); the stable `sourceRef` identifies seed foods.
- The pre-paint `<html lang>` lives in `boot-guard.js` (CSP forbids inline script); a test keeps its
  hint key and supported list in sync with the TypeScript.

## Known follow-ups

- Name the French copy tone reviewer in `REVIEWERS.md` (still a placeholder handle).
- The dock's week route overflows below 336 px in every language (48 px touch-target floor x 7).
- Out of scope: fr-CA and other region variants, right-to-left languages.

## Original analysis (kept for reference)

At the start, every user-facing string already lived in a typed catalogue read through `useStrings()`,
an ESLint gate rejected literal copy, and sentence assembly was isolated in `src/i18n/sentences.ts`,
so this was "add a second catalogue and a switch", not a rewrite.

## Decisions

1. **Where the preference lives ("profile").** There is no account: the profile is the encrypted
   local store. The language is a new `kv` row, `KV_KEYS.uiLocale` (`'en' | 'fr'`), so it is
   encrypted and wiped by "Erase all local data". It is NOT part of the JSON export, which is a
   strict plates envelope.
2. **Before unlock.** The gate screens (create passphrase, unlock, lost store, unavailable) render
   before the `kv` table can be read. They use, in order: a plaintext localStorage hint
   `anc.pwa.locale` (written whenever the preference changes, swept by erase with the other `anc.pwa.` keys), else the browser
   (`navigator.languages`: the first entry we support wins, so `['de-DE', 'fr-FR']` → `fr`; any `fr*` tag → `fr`; `navigator.language` is used when the list is empty; nothing supported → `en`). The hint reveals only
   "this browser prefers French"; that is acceptable and is documented in `docs/your-data.md`.
   Malformed tags must still never break boot (parity-checklist rule). On a first run (no store
   yet) the hint is ignored and cleared: a stale one left by an evicted store must not show.
3. **Default.** Until the person picks one, the app follows the browser ("Match my device"). Picking
   a language pins it. Settings offers: Match my device / English / Français.
4. **No i18n library.** Keep the in-house typed catalogue (small bundle, no CSP or external-host
   impact, already gated). Add only what is missing: a locale context and locale-aware `Intl`.
5. **Type safety.** `fr.ts` is typed `Strings` (derived from `en`), so a missing or extra key fails
   `tsc`. A unit test also checks that every placeholder set (`{name}`) matches between locales.
6. **Already-logged plates.** History keeps the words it was logged with, except where we can
   re-derive: seed foods render from their stable `sourceRef` (`seed:apple`) and quantity labels
   from `(low, high, unit)`. OFF products and AI names stay as returned. New entries keep storing
   the text too, so exports stay readable.

## Phases (the original plan)

This is the plan as first written; the sections above record what was built. Each phase is one PR, green on `pnpm verify`.

### Phase A: locale plumbing (no French yet)

- `src/i18n/locale.ts`: `type Locale = 'en' | 'fr'`, `SUPPORTED_LOCALES`, `resolveLocale(pref,
  hint, navigatorLanguages, navigatorLanguage?)` (pure, tested with malformed tags).
- `src/i18n/index.ts`: replace the module constant with a `LocaleProvider` + `useLocale()`;
  `useStrings()` reads the context. `strings()` (non-hook) reads a module-level "current locale"
  that the provider updates, so `sentences.ts` and `ai/copy.ts` keep working.
- Make `plural`, `joinNames`, `joinPlain` and the date formatters take the locale; cache the
  `Intl` objects per locale.
- Set `document.documentElement.lang` on every locale change (screen readers pick the voice from it).
- Mount the provider above the gate in `AppRoot`, seeded from the pre-unlock resolution; after
  unlock, re-resolve with the `kv` preference.
- Tests: existing suites run unchanged in `en`; add a test that switching the provider re-renders.

### Phase B: the preference

- `KV_KEYS.uiLocale` + a small `LocalePrefs` store (same pattern as `PrivacyPrefs`: unreadable →
  default, write failure → keep in memory and retry).
- localStorage hint `anc.pwa.locale` written alongside; `local-data-eraser` removes it (it sweeps
  the `anc.pwa.` prefix). A locked or unreadable store is "unknown", not "absent": it changes
  neither the hint nor the language.
- Settings: a "Language" row (reuse `ChoiceGroup`) under the existing settings list, with
  "Match my device" first. Labels for each language are written in that language ("Français",
  "English") and tagged with `lang` for screen readers.
- The preference is not in the JSON export (a strict plates envelope); CSV unaffected.
- e2e: pick French, lock, reload → gate is in French; unlock → app in French; erase → back to browser
  default.

### Phase C: French catalogue

- `src/i18n/fr.ts`: full translation of `en.ts`, including the 18 coach questions, consent dialogs,
  privacy and About pages.
- Tone: the No-Dark-Patterns standard applies to French too (calm, no shaming, no streaks, honest
  ranges such as `~2 poings`, `une poignée`). French copy needs a named reviewer in `REVIEWERS.md`.
- Typography: French spacing before `: ; ? !` uses a narrow no-break space (U+202F); typographic
  apostrophe; `«  »` quotes. Add a test that flags a plain space before those marks in `fr.ts`.
- Layout: French runs ~15–25 % longer. Check the dock, chips, departure board, station labels and
  sheet buttons at 320 px; the a11y-floor gate and axe e2e run in both locales.
- Plural rules differ (French treats 0 and 1 as `one`); keep explicit `zero` forms where the copy
  needs them.

### Phase D: food data and AI

- Seed foods: give each entry a stable `id` and move names/labels into the catalogue
  (`foods.apple`, `foods.portion.piece`), so search, display and `sourceRef` are locale-independent.
  Search matches the current locale's name plus the English name, accent-insensitive
  (`normalize('NFD')`), so "pomme", "Pomme" and "apple" all find it.
- Quantity labels: build `~1–2 tasses` from `(low, high, unit)` with the locale's unit names and
  number formatting (`1,5` in French) instead of storing pre-made English text.
- Classifier: add French keywords (`pomme`, `poulet`, `riz`, `fromage`, `lait d'avoine`, …) and keep
  the override passes; extend the tests with French cases and the false-friend checks.
- OFF: request `product_name_fr` too and prefer the current locale's field; the `fr:` category tags
  already strip their prefix.
- AI photo prompt: ask for `name` in the person's language ("in French" / "in English"), keep the
  `group` enum in English. The prompt stays a fixed template per locale (no free text), and the
  consent/privacy copy is updated to say the language is part of the request.

### Phase E: shell and docs

- `index.html` `lang` set at boot by a tiny inline-free script (CSP: no inline) or by `main.tsx`
  before first paint; ~~`boot-guard.js` fallback text in both languages~~ (resolved: the guard has no
  user-facing text, so there is nothing to translate).
- Manifest: one manifest stays (`lang: en`); browsers do not localise it per user, so the install
  name stays "AI Nutrition Coach" (~~decide if a neutral brand name is wanted~~ resolved: the brand
  name is kept).
- Docs: README "Languages" section, CONTRIBUTING "Adding a language" (copy `en.ts`, add to
  `SUPPORTED_LOCALES`, translate seed names and classifier keywords, tone review).

## Out of scope for now

- Right-to-left languages, per-region variants (fr-CA vs fr-FR), translating already-stored OFF or
  AI food names, translating exported files' column headers (kept English so imports stay stable).

## Rough size

A: 1 day · B: 1 day · C: 2–3 days incl. review · D: 2 days · E: half a day.
