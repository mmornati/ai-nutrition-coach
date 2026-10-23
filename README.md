# AI Nutrition Coach

_(formerly OpenPlate)_

AI Nutrition Coach is a quiet, offline-first plate-logging app: log what you
ate via photo, barcode, or voice/typing, and it lands on your Day
Board as one honest row per meal. No streaks, no scores, no
guilt. Real numbers (grams, nutrients) are planned and will be shown
plainly and calmly, as estimates where they are estimates (ADR 0006).

The project is open-source (MIT — see [`LICENSE`](./LICENSE)) and
self-hostable with one command. The trust mechanic is architecture,
not policy: a local encrypted store, an optional exporter, an
optional sync to your own infrastructure, zero telemetry by default.

## Trust posture

Every promise below names the test that proves it (`Proof`).
`pnpm check:release-posture` (part of `pnpm verify`) fails if a row has no proof, if a named
file does not exist, is not a `*.test.*` / `*.spec.*` file, or contains no real, un-skipped
test. A shell script may stand beside the tests (the container egress test
`scripts/smoke_self_host.sh`, which the `self-host` job of the `ci` workflow runs) only if it exists and a
workflow invokes it. Unit tests (`apps/web/src`, `packages/core/test`) and the gate self-tests
(`tools/gates`, `tools/pwa`) run in `pnpm verify`; the Playwright specs (`apps/web/e2e`,
Chromium and WebKit) run in CI via `pnpm e2e`, and `tools/webkit_smoke/smoke.spec.mjs` is the
smoke of the production image (`scripts/webkit_smoke.sh`, the `image` job of the `ci` workflow).

| Promise | Where it lives | Proof |
| ------- | -------------- | ----- |
| Local encrypted store (sqlite3mc, key derived from your passphrase): the stored file is not plaintext SQLite, a wrong passphrase cannot open it, the key is dropped on lock, erase removes every byte. The browser adapters (OPFS worker, IndexedDB header copy, `localStorage`) are proved in Chromium and WebKit by the e2e spec, not on real devices: Safari / Firefox are untested | AD-8, ADR-0002 — [`docs/your-data.md`](./docs/your-data.md) | `apps/web/src/storage/sqlite-engine.test.ts`, `apps/web/src/storage/store-controller.test.ts`, `apps/web/e2e/storage.spec.ts` |
| Exporter: CSV/JSON offline, no account | AD-9 | `apps/web/src/export/csv-exporter.test.ts`, `apps/web/src/export/json-exporter.test.ts`, `apps/web/src/export/web-export-destination.test.ts` |
| Sync is a seam only: in-memory outbox, no transport yet; the UI says "on this device", never "synced" | AD-6 | `apps/web/src/sync/sync.test.ts`, `packages/core/test/sync.test.ts`, `apps/web/src/components/day/StatusChip.test.tsx` |
| Photos sent to your AI endpoint are metadata-stripped, consent is per host (and per photo by default), the key is bound to its host | N1 — [`docs/ai-tiers.md`](./docs/ai-tiers.md) | `apps/web/src/capture/photo-sanitizer.test.ts`, `apps/web/src/ai/consent.test.ts`, `apps/web/src/ai/ai-settings.test.ts`, `apps/web/src/ai/byok-ai-rung.test.ts` |
| One-command self-host: hardened static container, strict CSP, no outbound need | FR-11 — [`docs/self-host.md`](./docs/self-host.md) | `tools/pwa/infra.test.mjs`, `apps/web/e2e/csp.spec.ts`, `scripts/smoke_self_host.sh` |
| Installable, offline-capable web app: our own service worker precaches a checksummed manifest, never intercepts cross-origin or non-GET requests, never caches at run time, and waits for you to tap *Reload* before a new version takes over. The worker is executed by `sw.behaviour.test.mjs` and, in real browsers, by `e2e/pwa.spec.ts`; the production-image run is the opt-in `scripts/webkit_smoke.sh` | ADR-0003 — [`docs/pwa.md`](./docs/pwa.md) | `tools/pwa/precache.test.mjs`, `tools/pwa/sw.behaviour.test.mjs`, `apps/web/src/pwa/app-update.test.ts`, `apps/web/src/components/shell/UpdatePrompt.test.tsx`, `apps/web/e2e/pwa.spec.ts` |
| The AI key and settings live inside the encrypted store, never in `localStorage`; the last-export date and the quiet export suggestion are encrypted too | ADR-0003 — [`docs/ai-tiers.md`](./docs/ai-tiers.md), [`docs/your-data.md`](./docs/your-data.md) | `apps/web/src/storage/store-controller.test.ts`, `apps/web/src/ai/ai-settings.test.ts`, `apps/web/src/screens/settings/YourDataScreen.test.tsx` |
| Per-plate delete & privacy page: remove one plate (and its coach note) after a calm confirm, reachable by screen reader too; a one-time "About this app" notice and a one-time Open Food Facts notice, both kept in the encrypted store; an in-app page saying what is stored and sent; photos ask before **every** upload by default | PV1 / PV5 / PV7 — [`docs/your-data.md`](./docs/your-data.md) | `packages/core/test/delete-plate.test.ts`, `apps/web/src/screens/plate/PlateScreen.test.tsx`, `apps/web/src/screens/settings/PrivacyScreen.test.tsx`, `apps/web/src/screens/about/AboutNotice.test.tsx`, `apps/web/src/catalog/privacy-prefs.test.ts`, `apps/web/src/ai/consent.test.ts` |
| What leaves the device is pinned exactly: the AI request has a fixed key set, the Open Food Facts request is `GET /api/v2/product/<barcode>?fields=` with no Referer / Cookie, no log call can carry content, the browser blocks every other origin (CSP `connect-src`), and the self-host container logs no request (no User-Agent, address truncated) unless asked | PV2 / PV3 / PV9 — [`docs/telemetry-posture.md`](./docs/telemetry-posture.md) | `apps/web/src/ai/openai-compatible-provider.test.ts`, `apps/web/src/catalog/off-barcode-source.test.ts`, `tools/gates/log-hygiene.test.mjs`, `apps/web/e2e/csp.spec.ts`, `tools/pwa/infra.test.mjs` |
| Zero telemetry by default; only user-enabled network paths (an import-based gate over the TypeScript AST, run by `pnpm check:telemetry`) | FR-12 — [`docs/telemetry-posture.md`](./docs/telemetry-posture.md) | `tools/gates/telemetry.test.mjs` |
| Adults-only: no biometric API, no under-13 / teen / parent profile machinery (`pnpm check:adults-only`) | FR-13 / FR-14 — [`docs/adults-only.md`](./docs/adults-only.md) | `tools/gates/adults-only.test.mjs`, `packages/core/test/managed-oversight-seam.test.ts` |
| No-Dark-Patterns Standard (no streaks, badges, countdowns, spinners, red) | FR-15 — [`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md) | `apps/web/src/no-dark-patterns.test.ts`, `tools/gates/release-posture.test.mjs` |
| Every screen meets the accessibility floor (axe: names, roles, contrast, target size) in jsdom and in a real browser | NFR-7 — [`docs/accessibility.md`](./docs/accessibility.md) | `apps/web/src/a11y-floor-gate.test.ts`, `apps/web/src/screens/today/TodayScreen.test.tsx`, `apps/web/e2e/gallery.spec.ts` |

What is *not* proven yet (real-device Safari and Chrome, Firefox) is listed under "Known accepted
gaps" below and in `_bmad-output/review/security-and-quality-review-2026-10-01.md`.

## Quickstart

AI Nutrition Coach's primary way to run is as an **installable, offline-capable web app**
(a PWA): deploy one container, open its HTTPS address on each phone, add it to the
home screen. Everything about building, deploying (including behind Traefik),
installing and updating is in [`docs/pwa.md`](./docs/pwa.md).

### Self-host

```sh
bin/ai-nutrition-coach up            # builds + serves http://localhost:8080 (loopback only)
bin/ai-nutrition-coach up --tls      # + automatic HTTPS for $AI_NUTRITION_COACH_DOMAIN (Caddy), for other devices
AI_NUTRITION_COACH_DOMAIN=plate.example.com bin/ai-nutrition-coach up --traefik   # behind YOUR Traefik: no published port
bin/ai-nutrition-coach down
```

Open `http://localhost:8080/`; choose a passphrase to create your store. The
container is a static server and holds no data: your history is encrypted in
*your browser*, and the in-app export is the backup path. Plain HTTP over a
network is unsupported (the web store needs https or localhost). See
[`docs/self-host.md`](./docs/self-host.md) and [`docs/pwa.md`](./docs/pwa.md).

### Build from source

Needs Node 24 and pnpm 11.14.0 (`corepack enable`); Docker only for the image and the smokes.

```sh
pnpm install                 # the workspace: apps/web (React PWA) + packages/core
pnpm dev                     # Vite dev server (first fetches the pinned, SHA-256-verified wasm assets)
pnpm verify                  # the one gate: format, lint, types, tests, DST re-run, posture gates, build, bundle scans
pnpm --filter @anc/web exec playwright install chromium webkit   # once: the Playwright browsers (or use PW_CHANNEL=chrome for your installed Chrome)
pnpm e2e                     # Playwright against the built preview (PW_WEBKIT=1 adds WebKit)
docker build -f infra/Dockerfile -t ai-nutrition-coach:dev .   # the production image (nginx, non-root, read-only)
```

`pnpm build` writes the release bundle to `apps/web/dist` with `sw.js` and
`precache-manifest.json`. The sqlite3mc and zxing wasm assets and the Argon2id build are fetched by
`scripts/fetch_web_sqlite3mc.sh`, `scripts/fetch_web_zxing_pwa.sh` and `scripts/fetch_web_argon2.sh` (never committed).

### Known accepted gaps

Stated, not hidden (details in [`docs/migration/parity-checklist.md`](./docs/migration/parity-checklist.md)):
Firefox is untested; Safari and Chrome are proved with Playwright's WebKit and Chromium, not on real
devices; without the Web Locks API there is no tab exclusion (two tabs can open the same store);
exports are plaintext files you hold; devices shared by several people see one history; there is no
import; the hosted AI tier is not built (you bring your own key); the Tip jar is pending the named
reviewer; there is no light theme.

## Languages

The app speaks English and French (Français). It follows your device's language until you choose:
**Settings → Language** offers *Match my device*, *English* and *Français*. The choice is stored in
the encrypted local store with the rest of your settings, plus a plain `localStorage` hint (the
language code only) so the passphrase and unlock screens can show it before the store is open.
"Erase all local data" removes both. Adding a language is described in
[`CONTRIBUTING.md`](./CONTRIBUTING.md#adding-a-language).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the build / test /
smoke commands, the gate frequency, and the contribution
expectations. The release posture is enforced by
[`docs/release-checklist.md`](./docs/release-checklist.md).

## Where things live

```
apps/web/                the React PWA (Vite, Vitest, Playwright)
packages/core/           pure-TypeScript domain core (no React / DOM / storage / network imports)
infra/                   Docker + nginx (+ Caddy TLS profile, Traefik compose) self-host definition
docs/                    user-facing docs (pwa, your-data, self-host, ai-tiers,
                         telemetry-posture, no-dark-patterns-standard)
_bmad-output/            planning / implementation artifacts, NOT product docs
                         (see _bmad-output/README.md)
tools/                   repo-level gates (check_telemetry_claims, check_release_posture,
                         check_accessibility_floor, ...) and their self-tests (tools/gates, tools/pwa)
scripts/                 verify.sh (wrapper for pnpm verify), fetch_*, smokes, local web
```

## License

MIT — see [`LICENSE`](./LICENSE).
