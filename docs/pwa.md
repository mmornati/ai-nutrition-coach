# AI Nutrition Coach as an installable, offline-capable web app (PWA)

AI Nutrition Coach's web build is a **Progressive Web App**: you open one URL on your
phone, add it to the home screen, and from then on it has its own icon, opens
without a connection and tells you calmly when a new version is ready. For a
family trial this is the way to use AI Nutrition Coach: the web app is what you
deploy and hand around.

This page is the whole story: what changed and why, how it works, how to build,
run and deploy it (including behind Traefik), how to install it on a phone, how
updates work, backup and limits, and what to do when something looks wrong.
Design record: [ADR-0003](../_bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ADR-0003-pwa-primary-distribution.md).

- [What changed and why](#what-changed-and-why)
- [How it works](#how-it-works)
- [Build](#build)
- [Run locally](#run-locally)
- [Deploy behind Traefik](#deploy-behind-traefik)
- [Install on phones](#install-on-phones)
- [Updating](#updating)
- [Backup and restore](#backup-and-restore)
- [Limitations](#limitations)
- [Browser smoke (WebKit and Chromium)](#browser-smoke-webkit-and-chromium)
- [Troubleshooting](#troubleshooting)

## What changed and why

| Before | Now |
| --- | --- |
| Needed a connection to start; no icon | Own service worker precaches the app: opens offline, installable (manifest with maskable icons, iOS tags) |
| No update story | A new image shows a calm "A new version is ready — Reload" line; one tap activates it |
| The browser could evict the data silently | The app asks the browser to protect it (`navigator.storage.persist()`), says what the browser answered, tracks the last export and suggests one now and then |
| BYOK key and AI settings lived in memory, re-entered after every lock | They are stored **inside the encrypted web store** and read after you unlock |
| Barcode scanning only where the browser has `BarcodeDetector` (not Safari) | A SHA-256-verified zxing-wasm decoder is served from your own origin: Safari/iOS and Firefox scan too |
| Deploy: loopback or the Caddy profile | Also: behind your existing Traefik (Docker or host), no published port |

Nothing about the trust model changed: the server is still a static file server
that holds no data, makes no outbound request and never sees your passphrase or
your history ([ADR-0005](./adr/0005-web-encrypted-store.md)). The CSP is strict
(`script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self'`, no inline script or style, no CDN).

## How it works

### Service worker: caches, offline, updates

The app is a Vite build (`apps/web`). Vite names its JS and CSS by content hash
(`assets/index-<hash>.js`), so the **build id is a hash of the file list and their SHA-256s**:
any change to a shipped file changes the bytes of `sw.js`, which is exactly what makes a browser
run its update check. After `vite build`, `tools/generate_precache_manifest.mjs` writes two files into `apps/web/dist`:

- `precache-manifest.json` — `{ buildId, files: [ { url, sha256, size } ] }` for every file in
  the bundle except source maps and dotfiles: `index.html`, `boot-guard.js`, the hashed JS/CSS
  chunks (including `store.worker-<hash>.js`), the web manifest, icons, fonts, licence texts, the
  versioned `sqlite3mc/<ver>/` engine (`sqlite3.mjs` + `sqlite3.wasm`) and the self-hosted
  `zxing/<ver>/` decoder and the `argon2/<ver>/argon2.umd.min.js` build (encrypted backups work offline). The generator **refuses a bundle that cannot boot offline**: it must
  contain the document, the web manifest, the boot guard, every local script/stylesheet/module the
  document references, the store worker chunk and the sqlite3mc, zxing and Argon2id files.
- `sw.js` — `tools/pwa/sw.template.js` with the build id baked in. (`AI_NUTRITION_COACH_BUILD_ID=...`
  or `--build-id` forces an id, e.g. to test the banner.)

The worker is hand-written and hardened (`tools/pwa/sw.template.js`); its
manifest is generated for Vite's output, and `vite-plugin-pwa`/Workbox is not used (the plugin's
`generateSW` could not express the SHA-256 verification, the always-refetched `index.html`, the
header-preserving cache entries or the waiting-only update; the generator and the template are
~350 lines and are covered by `tools/pwa/*.test.mjs`, which executes the worker against a fake
CacheStorage).

What the worker does:

| Event | Behaviour |
| --- | --- |
| install | Precache the manifest into the cache `ai-nutrition-coach-precache-<buildId>`: cache-busting fetches, each body checked against its SHA-256, files unchanged since the previous build reused from its cache. Any failure aborts the install and the running version is untouched. |
| waiting | The new worker waits. It **never** takes over by itself. |
| `SKIP_WAITING` message | Sent when you tap *Reload* → `skipWaiting()`. |
| activate | Deletes every other `ai-nutrition-coach-precache-*` cache and claims open pages. |
| fetch | **GET + same-origin only.** A page navigation (a path without a file extension) gets the cached `index.html`, online or offline, so a page load is always one consistent build. A precached file is served cache-first. Anything else goes to the network untouched. **Cross-origin requests (Open Food Facts, your AI endpoint) and all non-GET requests are never intercepted**, and the worker never writes a cache at run time, so no API response can be cached. |

Registration is done by the app itself (`apps/web/src/pwa/app-update.ts`, a same-origin module —
hence no inline script and no CSP change), **only on a secure context and only in a release build**
(`pnpm dev` never registers it, so development is never served from a stale cache). The app checks
for a new version on every load and whenever it comes back to the foreground. The web manifest
(`apps/web/public/manifest.webmanifest`) is a static file linked from `index.html`.

The manifest is one file with `"lang": "en"`: browsers read it once, at install, and do not
localise it per person, so the install name ("AI Nutrition Coach"), short name and description stay
English whatever language the app is set to. (The brand name is not translated.) The language the
person picked applies inside the app; `<html lang>` is set before the app bundle runs by
`boot-guard.js` (no inline script is allowed by the CSP) and kept up to date by the app.

The *update flow* in the UI: the new worker finishes installing → the app shows one
dismissible line ("A new version is ready. Reloading locks your data, so you will enter your
passphrase again." — *Reload* / *Later*) → *Reload* posts `SKIP_WAITING` → the page reloads
**once**, when the browser reports the new worker in control. "Later" hides the line for the
visit; there is no badge, no counter, no repeat.

**The `sw.js` and `precache-manifest.json` your server sends are rendered when the container starts**
(`infra/nginx/docker-entrypoint.d/30-render-sw.sh`): the build id is `<bundle id>-<12 hex of a hash of the rendered
security headers>`. The headers matter because the worker serves the *cached* `index.html` with the headers it was
fetched with (the stored responses keep the network response's headers, minus `Content-Encoding`/`Content-Length`/
`Transfer-Encoding`/`Set-Cookie`, and the document is always re-fetched on an update). So **changing
`AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` and restarting the container is a new service-worker version**: installed apps show the
"new version is ready" line and pick up the new CSP when the user taps Reload. nginx serves `sw.js`, `precache-manifest.json`, `manifest.webmanifest`, `index.html` and `boot-guard.js`
with `Cache-Control: no-cache`; Vite's hashed `assets/*` and the versioned `sqlite3mc/<ver>/`,
`zxing/<ver>/` and `argon2/<ver>/` files are `public, max-age=31536000, immutable`; the worker is served from `/`, so its
scope is `/` and no `Service-Worker-Allowed` header is needed. CSP `worker-src 'self' blob:` already
allows it.

### Storage and persistence

Your data is the encrypted SQLite database in the browser's origin-private file system (OPFS), opened by a
worker (ADR-0005; [`your-data.md`](./your-data.md)). Browsers may clear a site's storage when space runs low unless
the site is *persistent*, so after every create/unlock (once, and only if not already protected)
the app calls `navigator.storage.persist()`. **Your data** then shows one plain line:

- "Storage: protected from automatic clean-up." or
- "Storage: the browser may clear this data if space runs low — export regularly."

Whether the request is granted is the browser's decision (Chromium usually grants it to an installed
app; Firefox asks you; Safari grants it for apps added to the Home Screen). The app does not nag in
either case.

The time of the last export is stored in the encrypted store (not in `localStorage`). **Your data**
shows "Last export: <date>" (or "never"), and — only if there is data and the last export is older
than 14 days or never happened — one quiet line suggesting an export, with "Not now". A dismissal is
remembered for another 14 days. No badge, no modal, no streak
([No-Dark-Patterns Standard](./no-dark-patterns-standard.md)).

### Encryption recap and where the BYOK key lives

ChaCha20-Poly1305 pages (SQLite3 Multiple Ciphers, WebAssembly) in a worker on OPFS; the key is derived
from your passphrase and held in memory only while unlocked; the page locks after idle / hidden time; one tab
at a time (Web Locks). The parameters are in [ADR-0005](./adr/0005-web-encrypted-store.md).

Your **BYOK key** (bound to the host it was entered for) and your **AI settings and per-host consents** live
**inside the encrypted database**, readable only after the passphrase unlock, and deleted by *Erase all local
data*. They are never in `localStorage`. See [`ai-tiers.md`](./ai-tiers.md).

### Barcode decoder

The scanner uses the browser's native `BarcodeDetector` where it exists (Chrome, Edge) and otherwise
`zxing-wasm`. By default that library loads its wasm from a CDN, which the CSP blocks. The build therefore
self-hosts it: `scripts/fetch_web_zxing_pwa.sh` downloads the exact npm tarball (zxing-wasm 3.1.1, MIT,
bundling zxing-cpp, Apache-2.0), verifies its SHA-256, rewrites the one CDN wasm URL to a path next to the
reader, verifies the result against a second SHA-256, and writes `apps/web/public/zxing/3.1.1/` (git-ignored;
the version is in the path so nginx caches it as `immutable`). The decoder runs entirely on the device; the
camera never leaves it. If the decoder cannot start, the scanner shows the calm "scanning isn't available in
this browser — type it instead" and manual entry still works.

### Argon2id for the encrypted backup

The encrypted backup file (`docs/adr/0007-encrypted-vault.md`, phase S1) derives its key from a
passphrase with Argon2id, which WebCrypto does not have. `scripts/fetch_web_argon2.sh` downloads the
exact npm tarball (hash-wasm 4.12.0, MIT, Dani Biro), verifies its SHA-256, removes the one package
URL from the licence banner (the host scan flags any URL), verifies the result against a second
SHA-256 and writes `apps/web/public/argon2/4.12.0/argon2.umd.min.js` (git-ignored; versioned path, so
`immutable`; precached). It is the same single file the unit tests run, loaded by a module worker
(`src/sync/vault/argon2.worker.ts`) so the 64 MiB, three-pass derivation never blocks the page; the
worker is terminated as soon as it answers. CSP needs nothing new (`'wasm-unsafe-eval'` and
`worker-src 'self' blob:` are already there) and nothing is requested from another host.

### Content-Security-Policy

Strict, and **set by the server** (`infra/nginx/templates/ai-nutrition-coach-headers.inc.template`):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:;
font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:;
connect-src 'self' https://world.openfoodfacts.org <AI_NUTRITION_COACH_CONNECT_SRC_EXTRA>;
manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

- **No `'unsafe-inline'`, not even for styles.** The build ships its CSS as a file, and React's `style={}` props
  are applied through the CSSOM (`element.style`), which `style-src` does not govern; only `style=""`
  attributes in markup and `<style>` elements are. The e2e suite and the browser smoke fail on any
  Content-Security-Policy violation, so an inline style added later is a red build. (`vite dev` adds
  `'unsafe-inline'` for its HMR style injection; the release never has it.)
- `index.html` also carries a `<meta>` CSP with **only** `script-src`, `worker-src`, `object-src`, `base-uri`
  and `form-action`: a meta and a header CSP are both enforced, so a meta `connect-src` could never be widened
  by the knob below. `connect-src` therefore exists **only** in the header.
- The one knob is `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA`: **this is where you add the origin of your own AI
  endpoint** (BYOK), e.g. `https://api.openai.com`. Without it the browser blocks the call. Details in
  [`self-host.md`](./self-host.md#content-security-policy-and-your-ai-endpoint).

## Build

Needs Node 24 and pnpm (`corepack enable`; the version is pinned in `package.json`), or just Docker for the image.

```sh
pnpm install
# The whole gate (format, lint, typecheck, unit tests incl. the service-worker tests, build, scans):
pnpm verify

# Just the release web bundle (fetches + verifies sqlite3mc, zxing and Argon2id, tsc, vite build, then writes
# sw.js + precache-manifest.json and refuses a bundle that cannot boot offline):
pnpm --filter @anc/web build            # -> apps/web/dist

# Re-generate only sw.js + precache-manifest.json for an existing bundle
# (AI_NUTRITION_COACH_BUILD_ID forces a new build id, e.g. to test the update banner):
AI_NUTRITION_COACH_BUILD_ID=test-2 pnpm --filter @anc/web precache

# The production image (node build stage, then nginx-unprivileged; the scans fail the build):
docker build -f infra/Dockerfile -t ai-nutrition-coach:dev .
```

Icons: the SVG sources are in `tools/icons/`; the PNGs in `apps/web/public/icons/` are committed (the
192 px maskable icon is the 512 px one scaled down). The generator that drew them was removed with
the earlier client; to change the icon, edit the SVGs and re-render the PNGs with any SVG rasteriser.

## Run locally

```sh
bin/ai-nutrition-coach up                 # builds the image, serves http://localhost:8080/ (loopback only)
bin/ai-nutrition-coach down
scripts/run_local_web.sh         # the Vite dev server on 127.0.0.1 (no service worker), open Chrome
```

`http://localhost` counts as a **secure context**, so the service worker, the encrypted store and the camera
all work there; `http://192.168.x.y:8080` does **not**. To try it on a phone you need HTTPS: use the Caddy
profile or Traefik below (or `scripts/run_local_web.sh --tunnel`, which serves the release bundle through
an ngrok URL, with throwaway data).

## Deploy behind Traefik

Your Traefik terminates HTTPS and proxies to the app container, which stays local-only: **no published
port**. Two variants.

### Variant A — Traefik in Docker on the same host (most likely)

Assumptions: Traefik v3 with the Docker provider (`providers.docker`, `exposedByDefault=false`), already
attached to a Docker network (conventionally called `traefik`), an HTTPS entrypoint (conventionally
`websecure`), and a DNS record for your domain pointing at the host.

1. Create the network if you do not have one, and attach Traefik to it:
   `docker network create traefik`.
2. Build and start:

   ```sh
   AI_NUTRITION_COACH_DOMAIN=plate.example.com \
   AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER=letsencrypt \
   AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="https://api.openai.com" \
     bin/ai-nutrition-coach up --traefik
   ```

   (`bin/ai-nutrition-coach down` stops it. The network is external and is never removed.) The equivalent compose
   command, which `bin/ai-nutrition-coach up --traefik` runs after building the image:

   ```sh
   AI_NUTRITION_COACH_DOMAIN=plate.example.com AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER=letsencrypt \
     docker compose -f infra/docker-compose.traefik.yml \
                    -f infra/docker-compose.traefik-certresolver.yml up -d
   ```
3. Open `https://plate.example.com/`.

What `infra/docker-compose.traefik.yml` does: the same hardened container as the base file (read-only, no
capabilities, `no-new-privileges`) with **no `ports:`**, joined to the external network; labels
`traefik.enable=true`, router `ai-nutrition-coach` with ``Host(`$AI_NUTRITION_COACH_DOMAIN`)`` on `$AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT`,
`tls=true`, service port 8080, and a middleware `ai-nutrition-coach-hsts` (Strict-Transport-Security, one year, no
`preload`, subdomains only if you ask). That middleware sets *only* HSTS: Traefik's headers middleware changes
nothing it is not told to, so the app's CSP, COOP, Permissions-Policy and the rest pass through untouched.
It is a standalone file (not an override of `docker-compose.yml`) because compose cannot remove a published
port inherited from another file without `!reset`; here the absence of `ports:` is structural.

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_NUTRITION_COACH_DOMAIN` | **required** | Public host name (`bin/ai-nutrition-coach` checks it is a plain hostname). |
| `AI_NUTRITION_COACH_TRAEFIK_NETWORK` | `traefik` | The existing Docker network shared with Traefik (must exist). |
| `AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT` | `websecure` | Name of Traefik's HTTPS entrypoint. |
| `AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER` | unset | Your ACME resolver name. When set, `up --traefik` adds the overlay `docker-compose.traefik-certresolver.yml`; when unset **no** certresolver label exists at all (use this if Traefik serves a wildcard/default certificate). |
| `AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST` | unset | Comma-separated CIDRs allowed to connect, e.g. `192.168.1.0/24,100.64.0.0/10`. Adds the overlay `docker-compose.traefik-allowlist.yml` (Traefik v3 `ipAllowList`). |
| `AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS` | `false` | `true` adds `includeSubdomains` to HSTS. |
| `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` | empty | Extra CSP `connect-src` origins — **the BYOK AI endpoint goes here** (validated: space-separated `https://host[:port]` only). |
| `AI_NUTRITION_COACH_IMAGE_TAG` | `ai-nutrition-coach:dev` | Image to build/run. |

`bin/ai-nutrition-coach up --traefik` validates every value with a strict pattern before it reaches a label (a
domain, network, entrypoint or resolver can never add a label or alter the router rule), and exits with 41
(no domain), 42 (invalid value) or 43 (the network does not exist).

### Variant B — Traefik on the host

Run the app container loopback-only (the default), and route to it with the file provider:

```sh
bin/ai-nutrition-coach up --compose            # 127.0.0.1:8080 only
cp infra/traefik/ai-nutrition-coach-dynamic.yml /etc/traefik/dynamic/ai-nutrition-coach.yml    # your providers.file directory
# edit the domain, entrypoint and resolver marked EDIT; add `ai-nutrition-coach-allow` to the router for family-only access
```

`infra/traefik/ai-nutrition-coach-dynamic.yml` routes ``Host(`plate.example.com`)`` to `http://127.0.0.1:8080` with the
same HSTS-only middleware and an optional `ipAllowList`.

### DNS and certificates

Point an `A`/`AAAA` record at the host (the same name as `AI_NUTRITION_COACH_DOMAIN`). For Let's Encrypt, ports 80 and 443
must reach Traefik and your resolver must be configured in Traefik's *static* configuration. If you prefer
no public exposure, use a DNS-01 resolver or a wildcard certificate and keep the host reachable only over your
VPN. Browsers need a valid certificate for the service worker and the encrypted store; a self-signed
certificate you clicked through is *not* enough for a service worker.

### Logs behind Traefik

AI Nutrition Coach's own container logs nothing per request by default
(`AI_NUTRITION_COACH_ACCESS_LOG=off`, [`docs/self-host.md`](./self-host.md#logs)). **Traefik is the
one that sees the real client addresses**, and its access log is off unless you turned it on.
Recommendations:

- Leave Traefik's access log **disabled**. If you need it, keep it short-lived and
  minimal: `--accesslog.fields.defaultmode=drop` with `--accesslog.fields.names.RequestPath=keep`,
  `DownstreamStatus=keep`, `StartUTC=keep`, and **no `ClientAddr` / `ClientHost`**; or let
  Traefik anonymise it with `--accesslog.fields.names.ClientAddr=drop`. Never keep the
  `request_User-Agent` / `request_Referer` headers (`--accesslog.fields.headers.defaultmode=drop`).
- Set a retention: rotate (or let Docker rotate: `json-file` with `max-size` / `max-file`) and
  delete after days, not months. Address + time + path is personal data about *when the family
  uses the app*.
- Do not forward AI Nutrition Coach's or Traefik's logs to a third-party log service.

### Family-only access

Pick one, in this order of preference:

1. **Don't expose it publicly:** a VPN (WireGuard, Tailscale) and a name that only resolves inside it.
2. **IP allow-list** in Traefik (`AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST`). It judges the address Traefik *sees*: behind
   Docker NAT or another proxy that may be the proxy's address, so test from outside the list.
3. **A forward-auth sign-in** you already run (Authentik, Authelia): the `traefik-auth` (+ `traefik-authentik`)
   overlays, see [`docs/self-host.md`](./self-host.md#behind-authentik-traefik-forward-auth-cloudflare-tunnel).
   The manifest is requested with the session cookie, so the app stays installable.
4. Nothing: the app itself is protected by the passphrase (data is encrypted in each browser, the server
   holds none). Open access to the *app shell* exposes only static files.

Prefer these to **Traefik basic auth** in front of this app: the browser fetches the web manifest without
credentials, so installability checks can fail behind basic auth (not tested here). A VPN or an IP allow-list
avoids the question; the passphrase still protects the data.

## Install on phones

Open your HTTPS address in the phone's browser first (add it to the home screen *before* you start logging —
see [limitations](#limitations)).

- **iPhone / iPad (Safari):** tap **Share** → **Add to Home Screen** → **Add**. (Other iOS browsers can also
  add to the Home Screen from their share menu on recent iOS versions.) There is no install prompt on iOS;
  Settings → *Install on your phone* in the app repeats these steps.
- **Android (Chrome):** menu (⋮) → **Install app** (or **Add to Home screen**). Settings → *Install on your
  phone* also shows an **Install** button when Chrome offers installation.
- **Desktop (Chrome / Edge):** the install icon at the right of the address bar, or the browser menu →
  **Install AI Nutrition Coach**.

What installing changes: it opens without a connection once it has loaded once; it has its own icon and no
browser bars; on iPhone, Safari may clear a *website's* data after a while without a visit, but an app added to
the Home Screen is not subject to that. It does **not** move data: see below.

## Updating

Deploy a new image (`bin/ai-nutrition-coach up --traefik` again, or `docker compose ... up -d` with a new
`AI_NUTRITION_COACH_IMAGE_TAG`). Installed apps check for a new version when they open and when they return to the
foreground. When the new version has finished installing in the background they show the calm line "A new
version is ready" — tap **Reload** (the page reloads once and asks for your passphrase again) or **Later**.
Old caches are deleted when the new version activates. Nothing else is needed on the phones; data is untouched.
Store migrations run automatically the first time the new version opens the store.

### If an update goes wrong: the escape hatches

1. **A build that crashes at start-up** can keep serving itself from the worker's cache, and it never reaches the
   code that shows the banner. `boot-guard.js` (a separate classic script, loaded by `index.html` independently
   of the app bundle and served by the worker like everything else) therefore checks, 20 s after it ran,
   whether the app painted anything into `#root`; if not, and a newer worker is *waiting*, it activates it
   **once** (a `sessionStorage` flag prevents reload loops) and the page reloads into the fix. Deploy the fixed
   image; open the app; wait ~30 s.
2. **Kill switch** — when that is not enough (the bootstrap itself is broken, or no newer worker will install):
   restart the container with `AI_NUTRITION_COACH_SW_KILL=1`, e.g.

   ```sh
   AI_NUTRITION_COACH_SW_KILL=1 docker compose -f infra/docker-compose.traefik.yml up -d   # or: docker run -e AI_NUTRITION_COACH_SW_KILL=1 ...
   ```

   The container then serves `tools/pwa/sw.kill.js` as `/sw.js` (an empty precache manifest). Browsers fetch it on
   their next visit/foreground; it takes over immediately (no banner, no tap), **deletes every cache** (they hold
   only app files — never your history, which is the encrypted store in OPFS), and reloads each open window once
   from the network. It has no fetch handler, so everything then loads straight from the server. It deliberately does
   **not** unregister itself (the app registers `/sw.js` on every load; an unregistered kill switch would be
   re-installed and reload the page forever). Once users are healthy, **redeploy normally** (without the variable):
   the normal worker replaces the kill switch through the usual banner flow.
3. **Data written by a newer version** (for example another tab still ran a newer build): the unlock screen says
   "This data was opened by a newer version of AI Nutrition Coach… reload the page to update". Nothing is lost or changed;
   reloading gets the current build.

Also: every tab reloads once when a new worker takes control (not only the tab where you tapped Reload), and *Reload*
never dead-ends: if no worker is waiting it reloads directly, and if the browser never reports the takeover it
reloads after 10 s.

## Backup and restore

There is **no server-side data** — the server cannot back anything up. Every browser/device is an independent
store: your phone, your partner's phone and the laptop each have their own history, protected by their own
passphrase. Use **Your data → Save an encrypted backup** as the backup (a `.ancvault` file, restorable on the
create-passphrase screen or in Your data; [`your-data.md`](./your-data.md#encrypted-backup-and-restore)); the app records
the date and suggests a new one every few weeks. A CSV or JSON export is a readable copy of your history, not a
restore path. A forgotten passphrase cannot be recovered by anyone.

## Limitations

- **iOS keeps an installed app's data separate from Safari's.** What you logged in a Safari tab is not in the
  Home Screen app (and vice versa). Install first, then log; use exports to carry anything across.
- **iOS storage rules.** Safari may evict a *tab's* site data after a period without visiting; Home Screen apps are
  exempt. Chromium and Firefox decide `persist()` differently (see above). Keep exports regardless.
- **Passphrase every time the app opens**, and again after the idle lock (15 minutes by default) or 5 minutes
  hidden. This is by design (ADR-0002); there is no "stay unlocked".
- **One tab at a time.** A second tab/window says AI Nutrition Coach is open elsewhere.
- **No sync.** Devices do not talk to each other.
- **Camera** needs HTTPS (or localhost) and your permission; the scanner decodes on the device.
- **Fonts:** Barlow is self-hosted; a character outside it falls back to the system font (no CDN, by design).

## Browser smoke (WebKit and Chromium)

`scripts/webkit_smoke.sh` runs the **production image** (hardened like the compose file) and drives it with
Playwright (the official image, pinned by digest, sharing the server's network namespace so the page is
`http://localhost:8080`, a secure context) in WebKit — Safari's engine — and Chromium, with real selectors
(`tools/webkit_smoke/smoke.spec.mjs`):

1. the web manifest and icons are valid, the service worker registers and **precaches exactly the files of
   `precache-manifest.json`**, with no CSP violation;
2. first run: create a passphrase, log a plate by *Type it*, see it on Today and the **durable-storage line**;
   reload → unlock → the plate is there;
3. **offline reload** served by the worker; unlock; the plate is there;
4. **update**: the build id changes → the new worker waits (both caches exist) → the banner appears → *Reload*
   reloads exactly once → the old cache is deleted → unlock → the data is intact;
5. in **Chromium only** (Playwright's WebKit has no fake camera): a **barcode** step: a fake camera shows an
   EAN-13, the one-time Open Food Facts notice appears *before* anything is sent, and after *OK* exactly one
   request leaves — `GET /api/v2/product/<code>?fields=…`, no Referer / Cookie / Authorization (the host is
   answered by the test; nothing real is contacted);
6. **export** downloads a plain CSV;
7. in every test, no request to any other origin (each is aborted and recorded) and no uncaught page error.

It is opt-in (needs Docker and the network; the Playwright image is ~3 GB), runs as its own CI job
(`.github/workflows/browser-smoke.yml`) and is in the [release checklist](./release-checklist.md). The same
offline-reload and update flows also run on every PR in `pnpm e2e` (`apps/web/e2e/pwa.spec.ts`, Chromium and
WebKit) against a small static server that plays "a new version was deployed".

```sh
scripts/webkit_smoke.sh                       # both browsers (builds the image)
BROWSERS=webkit scripts/webkit_smoke.sh --no-build
```

Known gaps, stated plainly: Firefox is not tested, and neither is a real iPhone Safari (Playwright's WebKit is
the same engine, not the same browser: it has no `navigator.storage.persist()` grant, for one).

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Stuck on an old version | Close every AI Nutrition Coach tab/app window and reopen (the update applies on next open), or tap *Reload* on the banner. To force it from a desktop browser: DevTools → Application → Service Workers → *Unregister*, and Cache Storage → delete the `ai-nutrition-coach-precache-*` entries, then reload. **Do not use "Clear site data" / "Clear storage"**: that also erases your encrypted history (OPFS) — export first if you must. On a phone: removing the Home Screen app and re-adding it also fixes it (on iOS this discards that app's data — export first). |
| "Web storage unavailable" / store unavailable | The page is not a **secure context**: you opened `http://<ip>` instead of `https://…` or `http://localhost`, or the certificate is not trusted. Fix the URL/certificate. Private browsing modes can also block OPFS (an ephemeral WebKit context has none). |
| The app never becomes installable / no install icon | Needs HTTPS with a valid certificate, the manifest and the service worker. Check `https://<host>/manifest.webmanifest` and `/sw.js` load without credentials (basic auth breaks this) and DevTools → Application → Manifest shows no errors. |
| The AI call is blocked / "Test connection" fails | CSP `connect-src`: add the endpoint origin to `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` and restart the container (browser console shows a CSP violation). |
| Camera / scanner does nothing | Allow the camera for the site in the browser settings; needs HTTPS. If the decoder fails to start the screen says so and manual entry still works. |
| White page / the app never starts after an update | Wait ~30 s (the bootstrap activates a waiting fix once). Still broken: use the **kill switch** (see *Updating → If an update goes wrong*). |
| The banner never appears after a deploy | The browser checks on open/foreground; reopen the app once. Check that `sw.js` is served `no-cache` (`curl -I https://<host>/sw.js`) and that its `BUILD_ID` differs from the old one (it changes with the bundle *and* with any change to the security headers, e.g. `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA`). |
| "Open in another tab" | Another tab/window holds the store; lock or close it, then retry. |
| Blank page after an update on iOS | Remove the Home Screen app and re-add it (export first if it had data). |
