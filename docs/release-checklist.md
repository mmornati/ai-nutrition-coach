# Release checklist — AI Nutrition Coach v1

The release pipeline is intentionally lightweight. Every tagged
release runs this checklist end-to-end; a tag cannot ship until
the durable sign-offs are recorded. The CI workflow
`.github/workflows/release-gate.yml` automates the gating; the
named reviewer records the human sign-off.

## Gate A — Build

- [ ] `pnpm install --frozen-lockfile` resolves `apps/web` and `packages/core` from the committed
  lockfile without a diff.
- [ ] `pnpm verify` exits 0. It runs the Prettier check, ESLint (warnings are errors) and `tsc` in
  every package, the unit tests (the AD-1 purity test and the self-tests of the gates included),
  the same tests re-run under `TZ=Europe/Paris`, the release-posture gates (`pnpm gates`), the
  scanner self-tests, the release build, and the secrets and third-party-host scans of
  `apps/web/dist`.
- [ ] `pnpm e2e` is green in Chromium and, with `PW_WEBKIT=1`, in WebKit (CI runs both).

## Gate A2 — Schema v2 is forward-only

- [ ] Release notes say that the local store moved to schema v2 (grams and per-100 g nutrients) and
  that the move is forward-only: there is no migration back to v1.
- [ ] A browser tab still running the previous (v1) build and left open across the update meets a
  v2 store and gets `SchemaTooNewError`; the fix is to reload the tab, which picks up the new
  build. Nothing is lost.
- [ ] Rollback is honest: the export is a readable copy of the plates, not a way back (there is no
  import). Rolling the deploy back means the older build cannot open a v2 store; the person keeps
  the export for reference and the store stays for the newer build.

## Gate A3 — Schema v3 is forward-only

- [ ] Release notes say that the local store moved to schema v3 (saved meals and recipes: four new
  tables, no change to plates) and that the move is forward-only: there is no migration back to v2.
- [ ] A browser tab still running the previous (v2) build and left open across the update meets a
  v3 store and gets `SchemaTooNewError`; the fix is to reload the tab, which picks up the new
  build. Nothing is lost.
- [ ] Rollback is honest: the export (Settings → Your data) is a readable copy, and the JSON one
  also carries the saved meals and recipes, but there is no import. Rolling the deploy back means
  the older build cannot open this v3 store; keep the export for reference and keep the store for
  the newer build.

## Gate B — Self-host

- [ ] `scripts/smoke_self_host.sh` is green (FR-11 / NFR9).
  - Image builds in under 5 minutes on a standard CI runner.
  - The app shell is served on `http://localhost:<port>/` (loopback by
    default); `sqlite3mc-<ver>.wasm` is `application/wasm`.
  - `nginxinc/nginx-unprivileged` and `caddy` are digest-pinned.
  - CSP + security headers are present on html, js and wasm responses; no
    server version is disclosed.
  - The container is non-root, read-only, `cap_drop: ALL`,
    `no-new-privileges`.
  - It boots and serves on a docker `--internal` network (no egress).
- [ ] `bash tools/check_no_external_hosts.sh apps/web/dist` is green (part of `pnpm verify`): the
  built web bundle references no third-party host (fonts and the wasm assets are self-hosted).
- [ ] `docs/self-host.md` still states that plain HTTP over a network is
  unsupported and that data lives in the browser (export = backup).

## Gate B2 — PWA (ADR-0003, [`docs/pwa.md`](./pwa.md))

- [ ] `pnpm build` generated `sw.js` and `precache-manifest.json` in `apps/web/dist`; the bundle
  contains the self-hosted zxing decoder and the host scan still passes.
- [ ] **Service-worker update test.** Against the release image: install, then change the build id
  (`AI_NUTRITION_COACH_BUILD_ID=...` + `node tools/generate_precache_manifest.mjs apps/web/dist`, or a rebuild); the old version keeps running,
  the calm "A new version is ready" line appears, *Reload* reloads exactly once, old caches are gone,
  the data is still there after unlocking. `scripts/webkit_smoke.sh` automates this in Chromium and WebKit.
- [ ] **WebKit smoke.** `scripts/webkit_smoke.sh` is green (WebKit and Chromium): create → log → reload →
  unlock → offline reload → update. Record any browser-specific finding in `docs/pwa.md`.
- [ ] **Traefik config.** `docker compose -f infra/docker-compose.traefik.yml config` (with `AI_NUTRITION_COACH_DOMAIN`
  set) renders with **no published port** and the expected labels; the overlays render;
  `bin/ai-nutrition-coach up --traefik` refuses hostile values (exit 42). `scripts/smoke_self_host.sh` asserts all of it.
- [ ] `sw.js`, `precache-manifest.json` and `manifest.json` are `Cache-Control: no-cache`
  (asserted by the self-host smoke).
- [ ] **Real iPhone with VoiceOver ON.** Create a passphrase, log a plate through *Type or talk*
  and type in the food search. The app is DOM text, so VoiceOver reads it natively, but this has
  only been exercised with axe and Playwright's WebKit, never on a device (a known accepted gap).
  A failure is an **accessibility release blocker**.
- [ ] **Kill switch rehearsal.** Start the container with `AI_NUTRITION_COACH_SW_KILL=1` and confirm an installed app reloads
  once and then loads from the network (docs/pwa.md "If an update goes wrong").
- [ ] On a real iPhone (Safari) and a real Android phone (Chrome): install from HTTPS, open offline,
  log a plate, export. (Not automated and untested so far, a known accepted gap; the maintainer
  records the result.)

## Gate C — Release posture (Story 4.6 / FR-12)

- [ ] `pnpm check:release-posture` is green. It asserts that every row of the README trust table
  names a proof test that exists and contains a real, un-skipped test, and that `pnpm verify` still
  chains every gate (`pnpm check:a11y` asserts that every screen has an axe test; the i18n-literal
  rule runs in `pnpm lint`).
- [ ] `LICENSE` (MIT) is at HEAD.
- [ ] `CONTRIBUTING.md` is at HEAD and documents the build / test /
  smoke commands.
- [ ] `docs/no-dark-patterns-standard.md` is at HEAD and enumerates
  the banned-everywhere list.
- [ ] The named-reviewer sign-off for the No-Dark-Patterns gate
  is recorded in the PR thread + the release artefact.

## Gate P — Privacy (privacy audit 2026-10-12, [`docs/telemetry-posture.md`](./telemetry-posture.md))

- [ ] `pnpm check:release-posture` and `pnpm check:log-hygiene` are green (no `console.*` call
  carries content; every interpolating log is a reviewed `content-free` marker).
- [ ] **Project URL.** `AI_NUTRITION_COACH_BUILD=release [AI_NUTRITION_COACH_PROJECT_URL=<override>] node tools/check_project_url.mjs`
  is green (the default is the project repository, so this only fails for an empty or `.invalid` override; set the URL for a fork).
  Build the container with `--build-arg AI_NUTRITION_COACH_PROJECT_URL=… --build-arg AI_NUTRITION_COACH_RELEASE=1`
  (the build then enforces the rule itself; `.github/workflows/release-gate.yml` does this from the repository variable
  `AI_NUTRITION_COACH_PROJECT_URL`).
- [ ] **Consent copy.** Open Your AI with a key set, take a photo: the dialog says what is sent, what the host also
  sees, that it may keep requests, what is not sent, and links to the in-app privacy page. **Ask before every photo
  upload** is on for a fresh install.
- [ ] **First-run notices.** A fresh install shows *About this app* once (before the passphrase screen) and the
  Open Food Facts notice at the first scan; neither returns after being answered; *Settings → Privacy* opens the page
  and its barcode switch works.
- [ ] **Delete a plate.** Open a plate from Today, choose *Remove this plate*, confirm: the plate and its coach note are gone from the Day Board;
  with a screen reader the "Remove this plate" action is offered.
- [ ] **No leftover photos.** A photo is held in memory only (never written to storage); after a
  recognition the object URL is revoked and *Erase all local data* leaves nothing behind.
- [ ] **Self-host logs.** `bash scripts/smoke_self_host.sh` is green (it asserts `AI_NUTRITION_COACH_ACCESS_LOG` off by default
  and, with `on`, no User-Agent / Referer / query string and a truncated address). If you run Traefik, its access log is
  off or anonymised and has a retention ([`docs/pwa.md`](./pwa.md#logs-behind-traefik)).
- [ ] **Browser smoke.** `scripts/webkit_smoke.sh` is green: the Open Food Facts request (Chromium) and the export
  (both browsers) leave nothing else off-origin.
- [ ] Known and accepted for v1, stated on the privacy page: shared devices see one history (PV6); exports are
  plaintext files you hold, cover plates only, and there is no import (PV10).

## Gate D — Telemetry (Story 4.5 / FR-12)

- [ ] `pnpm check:telemetry` is green (import-based).
- [ ] Only the allow-listed adapters import a network transport; no
  telemetry SDK is declared or imported.
- [ ] The app entry (`apps/web/src/main.tsx`) imports no network transport.
- [ ] Every "no telemetry" claim in `docs/` is anchored to the
  gate.

## Gate E — Tag

- [ ] The version tag (`vX.Y.Z`) is created from `main`.
- [ ] The release notes enumerate the closed stories (Epic 1-5).
- [ ] The CI workflow `.github/workflows/release-gate.yml` is
  green on the tag commit.

## Known accepted gaps (v1)

Recorded here so no release pretends otherwise:

- Firefox is untested. Safari and Chrome are proved with Playwright's WebKit and Chromium, not on
  real devices.
- Web Locks is not used, so there is no tab exclusion: two tabs can open the same store.
- Exports are plaintext files; there is no import.
- Devices shared by several people see one history.
- The hosted AI tier is not built (bring your own key).
- The Tip jar is pending the named reviewer.
- There is no light theme.
- No store, no native app: Gate F (mobile signing, store metadata) was removed with the earlier native client.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Gate C).
- [`docs/self-host.md`](./self-host.md) — the self-host affordance
  (Gate B).
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture (Gate D).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  + the gate frequency.
- [`LICENSE`](../LICENSE) — the MIT license text (Gate C).
