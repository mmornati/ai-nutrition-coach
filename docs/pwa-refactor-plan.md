# PWA refactor plan: Flutter → React PWA with the "Food Lines" interface

Status: proposed · 2026-10-13

## Why

- AI Nutrition Coach (formerly OpenPlate) will not ship on the Apple or Google stores. Without the stores, Flutter's benefits (native keystore, native scanner, store distribution) mostly disappear, and iOS has no sane sideload path (7-day free signing, or a paid developer account).
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

The authoritative per-phase checklists of behaviours to preserve are in [`docs/migration/parity-checklist.md`](migration/parity-checklist.md); the decision is [`docs/adr/0004-flutter-to-pwa.md`](adr/0004-flutter-to-pwa.md). No data or backward-compatibility migration is needed, so schema versions and legacy purges are not ported.

### 0. Decide and prove (≈1 day)
- ADR written (ADR 0004): supersedes AD-2 / AD-8 and the PRD's Flutter assumption. Status stays "accepted, pending the device spike".
- Spike on a real iPhone (Safari) and Android phone (Chrome) over HTTPS: photo capture, barcode with `BarcodeDetector` and the `zxing-wasm` fallback, `navigator.storage.persist()`, and encrypted storage. The storage question is no longer "does an encrypted browser store work" (it was exercised in WebKit and Chromium) but "which JS route reproduces it". Spike target: a **sqlite3mc JS/WASM build** (ChaCha20-Poly1305, as in ADR-0002) running in a **dedicated Web Worker** on the **OPFS `opfs-sahpool` VFS** (no COOP/COEP needed; its exclusive access matches the Web Locks single-tab rule), key = PBKDF2-HMAC-SHA256, 600,000 iterations, random per-store salt, from the passphrase. Confirm it on iOS Safari in the spike. **Plan B** if a sqlite3mc JS build is unavailable: official `@sqlite.org/sqlite-wasm` + `opfs-sahpool` with an app-level AES-GCM layer per row.
- ADR-0002 (`_bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ADR-0002-web-encrypted-store.md`) preferred an IndexedDB file system on the main thread and rejected OPFS plus a worker; the spike must show that `opfs-sahpool` in a dedicated worker supersedes that, and the result is recorded in a follow-up ADR.

### 1. Scaffold `apps/web` and the JS gates
- Vite + React 19 + TS + Tailwind v4, `vite-plugin-pwa` (manifest, icons, shell precache with a navigation denylist for `/api`, `/ai`, `/relay`; never cache API/AI responses; update prompt, no auto-reload), Vitest, Playwright (including an offline-reload test).
- **Design tokens first:** port the table above into Tailwind `@theme` tokens (default palette, radii and shadows removed), self-host Barlow / Barlow Condensed with their OFL licence (no Google Fonts CDN, so it works offline with no third-party calls), caret, scrollbars and focus ring from the palette.
- **JS gates, written now so every later phase is checked from the start** (done unless marked):
  - [x] Third-party host scan of `apps/web/dist` (`tools/check_no_external_hosts.sh`, with a narrow allow-list for inert React and Workbox strings), in `web.yml`.
  - [x] Secrets scan of `apps/web/dist` (`tools/check_no_secrets_in_build.sh`), in `web.yml`.
  - [x] Telemetry import scan: ESLint `no-restricted-imports` in `apps/web` and `packages/core`.
  - [x] AD-1: `packages/core` ESLint bans UI, DOM, storage, service-worker imports and I/O globals, proven by a test that lints a violating snippet.
  - [ ] Accessibility floor: phases 3 and 7 (axe per component and per screen, plus contrast floors).
  - [ ] i18n-literal scan (no user-facing literals outside the key store): phases 3 and 7.
  - [ ] README trust-table proofs (`check:release-posture` equivalent), log hygiene, adults-only, under-13: phase 9.

### 2. Port `domain_core` → `packages/core` (pure TS)
- More than "about 3.6k lines": the core also owns meal-slot mapping, "today" rollover, DST-safe day arithmetic (with a `TZ=Europe/Paris` test run), the export reminder rule and the guarded post-commit steps in `RecordPlate`. Keep the ports (AiRung, EncryptedStore, FoodCatalog, Exporter, Coach, SyncAdapter). Port the 2.6k lines of tests one-to-one as the parity check.
- Keep AD-1 (no framework imports in core) with the ESLint rules from phase 1.

### 3. UI components (Food Lines system)
Each component inherits the behaviours the checklist records (whisper actions, durable dismissal, "on this device" chip, update banner wording, photo-consent dialog, equal-weight choices). Accessibility was already measured in light and dark; keep that bar with axe. Build in this order, each with Vitest + axe checks:
1. `LineMap` (SVG): four vertical lines, stations, stop dots, open/resolving station, the arrival animation. Accessible name lists the food groups present at each station.
2. `Station` row, `CoachCard` (Sure / Ask later), `Chip` (`local → pending → synced`).
3. `CaptureSheet` (bottom sheet on phone, centred dialog on desktop, Esc and focus trap).
4. `LineBar`, `EntryList` with `PortionPresets`.
5. `WeekNetwork` (SVG grid of 4 lines × 7 days) and `DayList`.
6. `DepartureBoard` rows and `TierRadio`.
7. App shell: bottom tabs + floating "Log a plate" on phone; left rail on ≥1024px.

The accessibility-floor gate lands here (and is extended in phase 7).

### 4. Storage
- Implement the decision from the phase 0 spike: sqlite3mc JS/WASM (ChaCha20-Poly1305) in a dedicated Web Worker on the OPFS `opfs-sahpool` VFS; key = PBKDF2-HMAC-SHA256, 600k iterations, random per-store salt, from the passphrase via WebCrypto. Plan B: `@sqlite.org/sqlite-wasm` + `opfs-sahpool` with app-level AES-GCM per row.
- The artifact (wasm/JS build) is pinned with a SHA-256 in a fetch script, as `scripts/fetch_web_sqlite.sh` does today; the sqlite3mc wasm in the repo is built for the Dart bindings and cannot be reused.
- Port as designed: header (non-secret, with a copy outside localStorage), Web Locks single-tab, idle and hidden auto-lock, error taxonomy, erase flow. The AI key and settings live inside the encrypted store, never `localStorage`.
- Export CSV/JSON by download or the Web Share API.

### 5. Capture
- Photo: `<input capture="environment">` + canvas downscale before AI. Metadata stripping (JPEG, PNG, WebP; HEIC refused) is implemented in Dart and needs a TypeScript port with its tests; a canvas re-encode may help but is not a guarantee.
- Barcode: `getUserMedia` + `BarcodeDetector`, `zxing-wasm` fallback. `zxing-wasm` 3.1.1 is already self-hosted with three pinned hashes (tarball, patched reader, wasm) by `scripts/fetch_web_zxing.sh`; the same tarball works here. Keep the Open Food Facts lookup (notice, request shape, 2 MiB / timeout rules), LRU cache and seed foods. Add the Open Food Facts host to `connect-src`.

### 6. AI
- BYOK straight from the browser (OpenAI-compatible providers that allow CORS), fully specified in the checklist (endpoint rules, host-bound key, per-photo consent, pinned request body, rate-limit parsing, output caps).
- The free hosted tier is NOT implemented in Flutter (both providers are stubs, because a credential must never ship in a client). Through an nginx location that injects the key from env it is a new design: it must own quota enforcement (the on-device counter is only a courtesy), add the relay's origin to the CSP, and rate-limit. Optional for the first release.

### 7. Screens
Assemble Today, Log, Plate, Week, Settings (+ Your AI, Your data, Tip jar, About), Unlock from the components. Copy is ported, not rewritten: 166 ARB keys plus the typed key stores in `coach_strings.dart` (including the 18 coach questions); the coach voice rules stay as they are. The "Tip jar" screen needs the named reviewer's decision first (see the checklist). The i18n-literal gate and the screen-level accessibility floor land here.

### 8. Self-host
Node build stage → nginx. Most of self-host already exists and is hardened: non-root read-only container, strict CSP (exact value in checklist Appendix A), validated `CONNECT_SRC_EXTRA`, access log off by default, service worker rendered at start with a CSP-aware build id, kill switch, Caddy profile, Traefik compose and overlays, container smoke test with an egress check, browser smoke in WebKit and Chromium. Adapt asset names and cache rules to Vite's hashed output; do not redesign. nginx also sets the header-only directives (`frame-ancestors`, COOP/CORP, `X-Frame-Options`, Permissions-Policy). The CSP can probably drop `style-src 'unsafe-inline'`. Document that camera access requires HTTPS (Caddy or Tailscale). The unused `/data` volume is already removed.

### 9. Clean up
Delete `apps/client`, `packages/integrations`, melos and the Flutter toolchain; update README, CONTRIBUTING, the release checklist and `tools/check_*`. The release gates are Dart AST tools wired into `melos run check:release-posture` and `scripts/verify.sh`; each needs a JS/shell equivalent before `apps/client` is deleted (Appendix C of the checklist), otherwise the README trust table loses its proofs. Keep the secrets and external-host scans (shell) and the gitleaks/Trivy/SBOM workflows.

## Definition of done for the UI
- Every screen in the prototype exists in the app at 390px and 1440px with no horizontal scroll.
- Touch targets ≥48px; keyboard and screen-reader parity (the line map announces groups, not counts); reduced motion respected; colour is never the only signal (every line is also labelled).
- No streaks, scores, badges, countdowns, celebratory pop-ups or red "guilt" states (No-Dark-Patterns Standard).
- Lighthouse PWA installable; works offline after first load.

## Migration inputs

The security/privacy hardening and the Flutter PWA work were merged before this plan; they are the specification. Everything that must survive, per phase, plus the "Dropped (native only)" list, the exact CSP (Appendix A), the copy files to port (Appendix B) and the CI gates that need a JS equivalent (Appendix C), is in [`docs/migration/parity-checklist.md`](migration/parity-checklist.md). The points are folded into the phases above.
