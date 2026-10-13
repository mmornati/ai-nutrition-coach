# PWA refactor plan: Flutter → React PWA with the "Food Lines" interface

Status: proposed · 2026-10-13

## Why

- OpenPlate will not ship on the Apple or Google stores. Without the stores, Flutter's benefits (native keystore, native scanner, store distribution) mostly disappear, and iOS has no sane sideload path (7-day free signing, or a paid developer account).
- A PWA installs from a link: Safari → Share → Add to Home Screen, Chrome → Install. Updates are automatic.
- Camera, barcode and photo capture work in a PWA over HTTPS (`getUserMedia`, `<input capture>`, `BarcodeDetector` with a `zxing-wasm` fallback for iOS).
- The current Flutter web build is the weakest target: built with `--pwa-strategy=none`, web storage is an in-memory placeholder (`packages/integrations/lib/src/store/create_encrypted_store_web.dart:75`), and it imports `drift/native.dart`.
- Flutter was never evaluated against alternatives; the PRD records it as an `[ASSUMPTION]`.

Known trade-offs vs native Flutter: the web encryption key comes from a passphrase, not the OS keystore (AD-8 already says so); barcode scanning on iOS uses the slower WASM fallback; going to the stores later would need a Capacitor wrapper.

## Target stack

React 19 + Vite + TypeScript + Tailwind v4 + `vite-plugin-pwa`, pnpm, Vitest + Testing Library, Playwright (e2e + axe). Same family as ai-finance-coach.

## Target interface: "Food Lines"

Chosen on 2026-10-13 from four directions (Crate Label, Thali Table, Food Lines, Plate Tiles). It replaces the earlier "Sage & Cream calm" visual world. The behavior rules (EXPERIENCE.md, No-Dark-Patterns Standard) are unchanged.

**Idea:** the day is a transit map. The four food groups are four coloured lines; each meal is a station where lines stop or pass through. Balance reads as "which lines stopped here", never as a score, ring or calorie total.

- **Prototype:** [`docs/design/food-lines/index.html`](design/food-lines/index.html). Open it in a browser and resize between phone and desktop.
- **Direction contract:** `.impeccable/surfaces/docs-design-food-lines-index-html.md`
- **Design system:** `DESIGN.md` (written from the prototype)
- **Rejected options, for the record:** `.impeccable/mocks/decision/*.html|png`

| Token | Value |
|---|---|
| Ground (midnight enamel) | `#0E1A3A`, raised `#15244B`, rule `#2C3F72` |
| Ink / buttons (porcelain) | `#F3F1EA` |
| Veg & fruit line | `#3FAE5A` |
| Protein line | `#E5432F` |
| Starch line | `#F2A41C` |
| Dairy line | `#5C9CF5` |
| Display face | Barlow Condensed 600/700, uppercase, +0.04em |
| Body face | Barlow 400/500/600 |

Screen map (old → new):

| Old Flutter screen | New screen |
|---|---|
| `day_board` + `balance_arc` + `week_strip` | **Today**: vertical line map with station per meal; desktop adds the week network beside it |
| `log_plate` / `capture_targets` | **Log a plate** sheet: Snapshot (dominant), Barcode, Type it |
| `capture_photo` / `capture_barcode` | Camera views opened from the sheet; resolving station shows "Reading the plate…" |
| `manual_entry` | Type it: ranked matches + portion presets (~½ fist … ~3 fists) |
| expanded plate / match sheets | **Plate** detail: line bar, ruled entries list with flush-right portions, coach follow-up |
| (week strip only) | **Week**: 7-day network map + day-by-day list |
| settings, `your_data`, `about` | **Settings** departures board → Your AI (4 tiers as radio lines), Your data, Tip jar, About |
| `lock_screen` / `unlock_gate` | **Unlock**: passphrase on the line diagram |

The signature interaction: when a plate resolves, the station ring draws in and each present line's stop pops on in line order (60ms stagger). Under reduced motion it jumps straight to the end state.

Navigation on phone: a fixed bottom dock holds the seven-stop week route (tap a day) and a square LOG button. Week and Settings are icon buttons in the Today header. On desktop a left rail holds Today / Week / Settings / Log a plate, and the footmark "yours to run · open source".

Fonts: Barlow and Barlow Condensed (SIL OFL) are self-hosted as woff2 (see `docs/design/food-lines/fonts/`) and precached by the service worker. No CDN calls.

Still to design during the build:
- Days with 5+ stations (snacks): proposal is a collapsed "+2 stops" segment.
- A light (porcelain-ground) theme variant: the world is dark-first, so validate whether light is needed.
- Camera viewfinder framing for photo and barcode.
- Quota-exhausted notice (three calm paths, no countdown) and the "not found" barcode state.

## Phases

### 0. Decide and prove (≈1 day)
- Supersede AD-2 / AD-8 and the PRD's Flutter assumption with an ADR.
- Spike on a real iPhone and Android phone over HTTPS: photo capture, barcode with `BarcodeDetector` and the `zxing-wasm` fallback, SQLite-WASM on OPFS with encryption, `navigator.storage.persist()`.

### 1. Scaffold `apps/web`
- Vite + React 19 + TS + Tailwind v4, `vite-plugin-pwa` (manifest, icons, shell precache; never cache API/AI responses), Vitest, Playwright.
- **Design tokens first:** port the table above into Tailwind `@theme` tokens, self-host Barlow / Barlow Condensed (no Google Fonts CDN, so it works offline with no third-party calls), theme selection, caret, scrollbars and focus ring from the palette.

### 2. Port `domain_core` → `packages/core` (pure TS)
- About 3.6k lines; keep the ports (AiRung, EncryptedStore, FoodCatalog, Exporter, Coach, SyncAdapter). Port the 2.6k lines of tests one-to-one as the parity check.
- Keep AD-1 (no framework imports in core) with ESLint `no-restricted-imports`.

### 3. UI components (Food Lines system)
Build in this order, each with Vitest + axe checks:
1. `LineMap` (SVG): four vertical lines, stations, stop dots, open/resolving station, the arrival animation. Accessible name lists the food groups present at each station.
2. `Station` row, `CoachCard` (Sure / Ask later), `Chip` (`local → pending → synced`).
3. `CaptureSheet` (bottom sheet on phone, centred dialog on desktop, Esc and focus trap).
4. `LineBar`, `EntryList` with `PortionPresets`.
5. `WeekNetwork` (SVG grid of 4 lines × 7 days) and `DayList`.
6. `DepartureBoard` rows and `TierRadio`.
7. App shell: bottom tabs + floating "Log a plate" on phone; left rail on ≥1024px.

### 4. Storage
- Official SQLite WASM in a Web Worker on OPFS; PBKDF2 (600k iterations, random per-install salt) → AES-GCM via WebCrypto, or a sqlite3mc WASM build.
- Export CSV/JSON by download or the Web Share API.

### 5. Capture
- Photo: `<input capture="environment">` + canvas downscale before AI.
- Barcode: `getUserMedia` + `BarcodeDetector`, `zxing-wasm` fallback; keep the OFF lookup, LRU cache and seed foods.

### 6. AI
- BYOK straight from the browser (OpenAI-compatible providers that allow CORS).
- Free hosted tier through an nginx location that injects the key from env and rate-limits, so no credential ships in the bundle.

### 7. Screens
Assemble Today, Log, Plate, Week, Settings (+ Your AI, Your data, Tip jar, About), Unlock from the components. Copy comes from the localization key store; the coach voice rules stay as they are.

### 8. Self-host
Node build stage → nginx. Document that camera access requires HTTPS (Caddy or Tailscale). Remove the unused `/data` volume.

### 9. Clean up
Delete `apps/client`, `packages/integrations`, melos and the Flutter toolchain; update README, CONTRIBUTING, the release checklist and `tools/check_*`.

## Definition of done for the UI
- Every screen in the prototype exists in the app at 390px and 1440px with no horizontal scroll.
- Touch targets ≥48px; keyboard and screen-reader parity (the line map announces groups, not counts); reduced motion respected; colour is never the only signal (every line is also labelled).
- No streaks, scores, badges, countdowns, celebratory pop-ups or red "guilt" states (No-Dark-Patterns Standard).
- Lighthouse PWA installable; works offline after first load.
