# Multi-language plan: English + French

Goal: ship the PWA in English and French, with the language chosen per person and kept with their
data. Structure stays ready for a third language without code changes outside `src/i18n`.

## Where we start

The groundwork is already in place, so this is "add a second catalogue and a switch", not a rewrite:

- Every user-facing string lives in a typed catalogue, `apps/web/src/i18n/en.ts` (~630 lines), read
  through `useStrings()` / `strings()` with `{name}` placeholders (`fill`) and plural forms (`plural`).
- An ESLint gate (`eslint-plugin-i18next` + `no-restricted-syntax`, proven by
  `src/components/i18nGate.test.ts`) fails any literal copy in JSX, aria attributes, setters or
  display objects.
- Sentence assembly is isolated in `src/i18n/sentences.ts`.

What is still hard-wired to English:

| Place | What |
| --- | --- |
| `src/i18n/index.ts` | `active = en`; `Intl.PluralRules('en')`, `Intl.ListFormat('en-GB')` built once at module load |
| `src/components/day/format.ts`, `src/screens/settings/format.ts` | `Intl.DateTimeFormat('en-GB', …)` module constants |
| `index.html`, `public/manifest.webmanifest`, `public/boot-guard.js` | `lang="en"`, English name/description, any boot-time fallback text |
| `src/catalog/seed-foods.ts` | 38 offline foods with English `displayName` and `~1 piece` style labels |
| `src/catalog/food-group-classifier.ts` | English keyword list (a French food name classifies as `other`) |
| `src/ai/openai-compatible-provider.ts` | `RECOGNITION_PROMPT` asks for the name "in plain English" |
| `src/catalog/off-barcode-source.ts` | prefers `product_name`, then `product_name_en`; no French field |
| Persisted plates | `FoodEntry` stores the display name and the preset `displayLabel` as text |

## Decisions

1. **Where the preference lives ("profile").** There is no account: the profile is the encrypted
   local store. The language is a new `kv` row, `KV_KEYS.uiLocale` (`'en' | 'fr'`), so it is
   encrypted, travels with export/sync, and is wiped by "Erase all local data".
2. **Before unlock.** The gate screens (create passphrase, unlock, lost store, unavailable) render
   before the `kv` table can be read. They use, in order: a plaintext localStorage hint
   `anc.locale` (written whenever the preference changes, removed by erase), else the browser
   (`navigator.languages`: the first entry we support wins, so `['de-DE', 'fr-FR']` → `fr`; any `fr*` tag → `fr`; `navigator.language` is used when the list is empty; nothing supported → `en`). The hint reveals only
   "this browser prefers French"; that is acceptable and is documented in `docs/your-data.md`.
   Malformed tags must still never break boot (parity-checklist rule).
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

## Phases

Each phase is one PR, green on `pnpm verify`.

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
- localStorage hint written alongside; `local-data-eraser` removes it.
- Settings: a "Language" row (reuse `ChoiceGroup`) under the existing settings list, with
  "Match my device" first. Labels for each language are written in that language ("Français",
  "English") and tagged with `lang` for screen readers.
- Include the preference in the JSON export; CSV unaffected.
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
  before first paint; `boot-guard.js` fallback text in both languages.
- Manifest: one manifest stays (`lang: en`); browsers do not localise it per user, so the install
  name stays "AI Nutrition Coach" (decide if a neutral brand name is wanted).
- Docs: README "Languages" section, CONTRIBUTING "Adding a language" (copy `en.ts`, add to
  `SUPPORTED_LOCALES`, translate seed names and classifier keywords, tone review).

## Out of scope for now

- Right-to-left languages, per-region variants (fr-CA vs fr-FR), translating already-stored OFF or
  AI food names, translating exported files' column headers (kept English so imports stay stable).

## Rough size

A: 1 day · B: 1 day · C: 2–3 days incl. review · D: 2 days · E: half a day.
