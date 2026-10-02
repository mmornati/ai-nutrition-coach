# OpenPlate as an installable, offline-capable web app (PWA)

OpenPlate's web build is a **Progressive Web App**: you open one URL on your
phone, add it to the home screen, and from then on it has its own icon, opens
without a connection and tells you calmly when a new version is ready. For a
family trial this is the primary way to use OpenPlate; the Android and iOS apps
come from the same code and keep working, but the web app is what you deploy and
hand around.

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
| BYOK key and AI settings lived in memory, re-entered after every lock | They are stored **inside the encrypted web store** (schema v5) and read after you unlock |
| Barcode scanning only where the browser has `BarcodeDetector` (not Safari) | A SHA-256-verified zxing-wasm decoder is served from your own origin: Safari/iOS and Firefox scan too |
| Deploy: loopback or the Caddy profile | Also: behind your existing Traefik (Docker or host), no published port |

Nothing about the trust model changed: the server is still a static file server
that holds no data, makes no outbound request and never sees your passphrase or
your history (ADR-0002). The strict CSP is unchanged
(`script-src 'self' 'wasm-unsafe-eval'`, no inline script, no CDN).

## How it works

### Service worker: caches, offline, updates

`flutter build web --pwa-strategy=none` stays (Flutter's own worker is
deprecated). After the build, `tools/generate_precache_manifest.dart` writes two
files into the bundle:

- `precache-manifest.json` — `{ buildId, files: [ { url, sha256, size } ] }` for every
  file needed to boot offline: `index.html`, `flutter.js`, `flutter_bootstrap.js`,
  `main.dart.js`, the web manifest, icons, `assets/`, the fallback font, the
  versioned `sqlite3mc-<ver>.wasm`, the self-hosted zxing decoder and the CanvasKit
  builds a browser can pick. Left out: `skwasm*`/`wimp*` (unused without
  cross-origin isolation), `*.symbols`, source maps, `version.json`, Flutter's own
  worker.
- `sw.js` — from `tools/pwa/sw.template.js` with the **build id** baked in. The build
  id is a hash of the file list, so *any* change to a shipped file changes the bytes of
  `sw.js`, which is exactly what makes a browser run its update check.
  (`OPENPLATE_BUILD_ID=...` / `--build-id` forces an id, e.g. to test the banner.)

What the worker does:

| Event | Behaviour |
| --- | --- |
| install | Precache the manifest into the cache `openplate-precache-<buildId>`: cache-busting fetches, each body checked against its SHA-256, files unchanged since the previous build reused from its cache. Any failure aborts the install and the running version is untouched. |
| waiting | The new worker waits. It **never** takes over by itself. |
| `SKIP_WAITING` message | Sent when you tap *Reload* → `skipWaiting()`. |
| activate | Deletes every other `openplate-precache-*` cache and claims open pages. |
| fetch | **GET + same-origin only.** A page navigation (a path without a file extension) gets the cached `index.html`, online or offline, so a page load is always one consistent build. A precached file is served cache-first. Anything else goes to the network untouched. **Cross-origin requests (Open Food Facts, your AI endpoint) and all non-GET requests are never intercepted**, and the worker never writes a cache at run time, so no API response can be cached. |

Registration is done by the app itself (`main.dart.js`, a same-origin script — hence no
inline script and no CSP change), **only on a secure context and only in a release build**
(`flutter run` never registers it, so development is never served from a stale cache). The
app checks for a new version on every load and whenever it comes back to the foreground.

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
`OPENPLATE_CONNECT_SRC_EXTRA` and restarting the container is a new service-worker version**: installed apps show the
"new version is ready" line and pick up the new CSP when the user taps Reload. nginx serves `sw.js`, `precache-manifest.json`, `manifest.json`, `index.html` and the loader/app
code with `Cache-Control: no-cache`; the worker is served from `/`, so its scope is `/` and no
`Service-Worker-Allowed` header is needed. CSP `worker-src 'self' blob:` already allows it.

### Storage and persistence

Your data is the encrypted SQLite database in the browser's IndexedDB (ADR-0002;
[`your-data.md`](./your-data.md)). Browsers may clear a site's storage when space runs low unless
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

Unchanged: ChaCha20-Poly1305 pages in IndexedDB; the key is derived from your passphrase with
PBKDF2-HMAC-SHA256, 600,000 iterations and a random salt, held in memory only while unlocked; the page
locks after idle / hidden time; one tab at a time (Web Locks).

New: the schema is **v5**, with a small `kv_table`. On web it holds your **BYOK key** (bound to the host it
was entered for, as on mobile) and your **AI settings and per-host consents**. They are inside the
encrypted database, readable only after the passphrase unlock, and deleted by *Erase all local data*. They
are never in `localStorage` (the app still purges what older builds left there). The old "kept in memory,
paste it again after every lock" behaviour is gone. On mobile the key stays in the OS keystore. See
[`ai-tiers.md`](./ai-tiers.md).

Because settings are read from the open database, the app restarts its view after every unlock as well as
every lock (you may notice a blink).

### Barcode decoder

`mobile_scanner` uses the browser's native `BarcodeDetector` where it exists (Chrome, Edge) and otherwise
`zxing-wasm`. By default it loads that from a CDN, which the CSP blocks. The build therefore self-hosts it:
`scripts/fetch_web_zxing.sh` downloads the exact npm tarball `mobile_scanner 7.4.x` expects (zxing-wasm 3.1.1,
MIT, bundling zxing-cpp, Apache-2.0), verifies its SHA-256, rewrites the one CDN wasm URL to a path next to
the reader, verifies the result against a second SHA-256, and writes `apps/client/web/zxing/3.1.1/`
(git-ignored; the version is in the path so nginx caches it as `immutable`). The decoder runs entirely on the
device; the camera never leaves it. If the decoder cannot start, the scanner shows the calm "scanning isn't
available in this browser — type it instead" and manual entry still works.

### Content-Security-Policy

Unchanged and still strict. The worker and the decoder are both `'self'`. The one knob is
`OPENPLATE_CONNECT_SRC_EXTRA`: **this is where you add the origin of your own AI endpoint** (BYOK), e.g.
`https://api.openai.com`. Without it the browser blocks the call. Details in
[`self-host.md`](./self-host.md#content-security-policy-and-your-ai-endpoint).

## Build

All Flutter work runs in the pinned toolchain image (Flutter 3.44.0 by digest); you only need Docker.

```sh
# The whole gate (format, analyze, tests, release posture, release web build, scans):
scripts/verify.sh

# Just the release web bundle (fetches sqlite + zxing, builds, generates sw.js + the manifest, scans):
scripts/flutter_docker.sh dart run melos run build:web      # = melos run build:web inside the container
# -> apps/client/build/web

# Re-generate only sw.js + precache-manifest.json for an existing bundle
# (OPENPLATE_BUILD_ID forces a new build id, e.g. to test the update banner):
OPENPLATE_BUILD_ID=test-2 scripts/flutter_docker.sh dart run melos run pwa:manifest

# The production image (multi-stage: build above, then nginx-unprivileged):
docker build -f infra/Dockerfile -t openplate:dev .
```

Icons are generated deterministically from one piece of geometry by `tools/generate_icons.dart`
(`scripts/flutter_docker.sh dart run tools/generate_icons.dart`); the SVG sources are in `tools/icons/`.
The Android/iOS launcher icons are still the Flutter placeholders.

## Run locally

```sh
bin/openplate up                 # builds the image, serves http://localhost:8080/ (loopback only)
bin/openplate down
scripts/run_local_web.sh         # build in the toolchain image + serve build/web with python, open Chrome
```

`http://localhost` counts as a **secure context**, so the service worker, the encrypted store and the camera
all work there; `http://192.168.x.y:8080` does **not**. To try it on a phone you need HTTPS: use the Caddy
profile or Traefik below (or `scripts/run_local_web.sh --tunnel` with throwaway data).

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
   OPENPLATE_DOMAIN=plate.example.com \
   OPENPLATE_TRAEFIK_CERTRESOLVER=letsencrypt \
   OPENPLATE_CONNECT_SRC_EXTRA="https://api.openai.com" \
     bin/openplate up --traefik
   ```

   (`bin/openplate down` stops it. The network is external and is never removed.) The equivalent compose
   command, which `bin/openplate up --traefik` runs after building the image:

   ```sh
   OPENPLATE_DOMAIN=plate.example.com OPENPLATE_TRAEFIK_CERTRESOLVER=letsencrypt \
     docker compose -f infra/docker-compose.traefik.yml \
                    -f infra/docker-compose.traefik-certresolver.yml up -d
   ```
3. Open `https://plate.example.com/`.

What `infra/docker-compose.traefik.yml` does: the same hardened container as the base file (read-only, no
capabilities, `no-new-privileges`) with **no `ports:`**, joined to the external network; labels
`traefik.enable=true`, router `openplate` with ``Host(`$OPENPLATE_DOMAIN`)`` on `$OPENPLATE_TRAEFIK_ENTRYPOINT`,
`tls=true`, service port 8080, and a middleware `openplate-hsts` (Strict-Transport-Security, one year, no
`preload`, subdomains only if you ask). That middleware sets *only* HSTS: Traefik's headers middleware changes
nothing it is not told to, so the app's CSP, COOP, Permissions-Policy and the rest pass through untouched.
It is a standalone file (not an override of `docker-compose.yml`) because compose cannot remove a published
port inherited from another file without `!reset`; here the absence of `ports:` is structural.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENPLATE_DOMAIN` | **required** | Public host name (`bin/openplate` checks it is a plain hostname). |
| `OPENPLATE_TRAEFIK_NETWORK` | `traefik` | The existing Docker network shared with Traefik (must exist). |
| `OPENPLATE_TRAEFIK_ENTRYPOINT` | `websecure` | Name of Traefik's HTTPS entrypoint. |
| `OPENPLATE_TRAEFIK_CERTRESOLVER` | unset | Your ACME resolver name. When set, `up --traefik` adds the overlay `docker-compose.traefik-certresolver.yml`; when unset **no** certresolver label exists at all (use this if Traefik serves a wildcard/default certificate). |
| `OPENPLATE_TRAEFIK_ALLOWLIST` | unset | Comma-separated CIDRs allowed to connect, e.g. `192.168.1.0/24,100.64.0.0/10`. Adds the overlay `docker-compose.traefik-allowlist.yml` (Traefik v3 `ipAllowList`). |
| `OPENPLATE_TRAEFIK_HSTS_SUBDOMAINS` | `false` | `true` adds `includeSubdomains` to HSTS. |
| `OPENPLATE_CONNECT_SRC_EXTRA` | empty | Extra CSP `connect-src` origins — **the BYOK AI endpoint goes here** (validated: space-separated `https://host[:port]` only). |
| `OPENPLATE_IMAGE_TAG` | `openplate:dev` | Image to build/run. |

`bin/openplate up --traefik` validates every value with a strict pattern before it reaches a label (a
domain, network, entrypoint or resolver can never add a label or alter the router rule), and exits with 41
(no domain), 42 (invalid value) or 43 (the network does not exist).

### Variant B — Traefik on the host

Run the app container loopback-only (the default), and route to it with the file provider:

```sh
bin/openplate up --compose            # 127.0.0.1:8080 only
cp infra/traefik/openplate-dynamic.yml /etc/traefik/dynamic/openplate.yml    # your providers.file directory
# edit the domain, entrypoint and resolver marked EDIT; add `openplate-allow` to the router for family-only access
```

`infra/traefik/openplate-dynamic.yml` routes ``Host(`plate.example.com`)`` to `http://127.0.0.1:8080` with the
same HSTS-only middleware and an optional `ipAllowList`.

### DNS and certificates

Point an `A`/`AAAA` record at the host (the same name as `OPENPLATE_DOMAIN`). For Let's Encrypt, ports 80 and 443
must reach Traefik and your resolver must be configured in Traefik's *static* configuration. If you prefer
no public exposure, use a DNS-01 resolver or a wildcard certificate and keep the host reachable only over your
VPN. Browsers need a valid certificate for the service worker and the encrypted store; a self-signed
certificate you clicked through is *not* enough for a service worker.

### Family-only access

Pick one, in this order of preference:

1. **Don't expose it publicly:** a VPN (WireGuard, Tailscale) and a name that only resolves inside it.
2. **IP allow-list** in Traefik (`OPENPLATE_TRAEFIK_ALLOWLIST`). It judges the address Traefik *sees*: behind
   Docker NAT or another proxy that may be the proxy's address, so test from outside the list.
3. Nothing: the app itself is protected by the passphrase (data is encrypted in each browser, the server
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
  **Install OpenPlate**.

What installing changes: it opens without a connection once it has loaded once; it has its own icon and no
browser bars; on iPhone, Safari may clear a *website's* data after a while without a visit, but an app added to
the Home Screen is not subject to that. It does **not** move data: see below.

## Updating

Deploy a new image (`bin/openplate up --traefik` again, or `docker compose ... up -d` with a new
`OPENPLATE_IMAGE_TAG`). Installed apps check for a new version when they open and when they return to the
foreground. When the new version has finished installing in the background they show the calm line "A new
version is ready" — tap **Reload** (the page reloads once and asks for your passphrase again) or **Later**.
Old caches are deleted when the new version activates. Nothing else is needed on the phones; data is untouched.
Schema migrations (like v4 → v5) run automatically the first time the new version opens the store, and are
written to be safely re-runnable.

### If an update goes wrong: the escape hatches

1. **A build that crashes at start-up** can keep serving itself from the worker's cache, and it never reaches the
   Dart code that shows the banner. `flutter_bootstrap.js` (served by the worker like everything else) therefore
   checks, 20 s after it ran, whether the engine painted anything; if not, and a newer worker is *waiting*, it
   activates it **once** (a `sessionStorage` flag prevents reload loops) and the page reloads into the fix. Deploy
   the fixed image; open the app; wait ~30 s.
2. **Kill switch** — when that is not enough (the bootstrap itself is broken, or no newer worker will install):
   restart the container with `OPENPLATE_SW_KILL=1`, e.g.

   ```sh
   OPENPLATE_SW_KILL=1 docker compose -f infra/docker-compose.traefik.yml up -d   # or: docker run -e OPENPLATE_SW_KILL=1 ...
   ```

   The container then serves `tools/pwa/sw.kill.js` as `/sw.js` (an empty precache manifest). Browsers fetch it on
   their next visit/foreground; it takes over immediately (no banner, no tap), **deletes every cache** (they hold
   only app files — never your history, which is the encrypted IndexedDB database), and reloads each open window once
   from the network. It has no fetch handler, so everything then loads straight from the server. It deliberately does
   **not** unregister itself (the app registers `/sw.js` on every load; an unregistered kill switch would be
   re-installed and reload the page forever). Once users are healthy, **redeploy normally** (without the variable):
   the normal worker replaces the kill switch through the usual banner flow.
3. **Data written by a newer version** (for example another tab still ran a newer build): the unlock screen says
   "This data was opened by a newer version of OpenPlate… reload the page to update". Nothing is lost or changed;
   reloading gets the current build.

Also: every tab reloads once when a new worker takes control (not only the tab where you tapped Reload), and *Reload*
never dead-ends: if no worker is waiting it reloads directly, and if the browser never reports the takeover it
reloads after 10 s.

## Backup and restore

There is **no server-side data** — the server cannot back anything up. Every browser/device is an independent
store: your phone, your partner's phone and the laptop each have their own history, protected by their own
passphrase. Use **Your data → Export** (CSV or JSON) as the backup; the app records the date and suggests a new
export every few weeks. There is no import yet: an export is a readable copy of your history, not a restore
path. A forgotten passphrase cannot be recovered by anyone.

## Limitations

- **iOS keeps an installed app's data separate from Safari's.** What you logged in a Safari tab is not in the
  Home Screen app (and vice versa). Install first, then log; use exports to carry anything across.
- **iOS storage rules.** Safari may evict a *tab's* site data after a period without visiting; Home Screen apps are
  exempt. Chromium and Firefox decide `persist()` differently (see above). Keep exports regardless.
- **Passphrase every time the app opens**, and again after the idle lock (15 minutes by default) or 5 minutes
  hidden. This is by design (ADR-0002); there is no "stay unlocked".
- **One tab at a time.** A second tab/window says OpenPlate is open elsewhere.
- **No sync.** Devices do not talk to each other.
- **Camera** needs HTTPS (or localhost) and your permission; the scanner decodes on the device.
- **Locale:** an unparseable `navigator.languages` entry (POSIX-style `en-US@posix`, `en_US.UTF-8`) used to stop the
  engine at start-up ("RangeError: Incorrect locale information provided"); `flutter_bootstrap.js` repairs or drops such
  tags before the engine reads them and the app resolves any locale to English.
- **Fonts:** emoji/CJK render as boxes (no CDN fallback, by design).
- **Android/iOS launcher icons** of the native apps are still placeholders.

## Browser smoke (WebKit and Chromium)

`scripts/webkit_smoke.sh` runs the production image under Playwright (the official image, pinned by digest) in
WebKit — Safari's engine — and Chromium, over `http://localhost`:
manifest + icons valid; service worker registers and precaches exactly the manifest; create a passphrase, log a
plate by manual entry; reload → unlock → the plate is there; **offline reload** served by the worker and the
data opens; **update**: the build id changes → the worker waits → the banner appears → *Reload* reloads exactly
once and the old cache is deleted; no request left the origin. It is opt-in (needs Docker and the network, ~10
minutes the first time) and runs as its own CI job; it is in the [release checklist](./release-checklist.md).

```sh
scripts/webkit_smoke.sh                       # both browsers (builds the image)
BROWSERS=webkit scripts/webkit_smoke.sh --no-build
```

**Result of the last run (2026-10-02, Playwright 1.60 on Linux, release image):** 8/8 steps passed in WebKit
and 8/8 in Chromium. In particular the web store works in WebKit — sqlite3mc-wasm in IndexedDB, the WebCrypto
key derivation and Web Locks — and the service worker precaches, serves the app offline and updates there too.
No bug in the web store, the service worker or the encryption was found. What it did find:

- **A real bug, fixed (review):** the service worker stored precached responses with only a content type and a hash, so
  the cached `index.html` lost the CSP and every other security header for returning users (an injected inline script
  would have run). It now keeps the network headers, and a smoke step asserts the CSP on a worker-served navigation
  and that an injected inline script is blocked.
- **A real bug, fixed:** the "new version is ready" line was drawn but invisible to screen readers when placed
  next to the app's Navigator (a route blocks the semantics of siblings that precede it). The banner now follows
  the Navigator in semantic order and is still drawn on top; a widget test pins it.
- **Open question, not ours to fix:** with Flutter's accessibility semantics *on*, characters typed into a text
  field in Playwright's WebKit stay in the semantics `<input>` and never reach the app (Chromium is fine).
  Text entry without semantics works. So the smoke types by coordinates with semantics off and turns semantics on
  only to read the screen (`tools/webkit_smoke/calibrate.mjs` records the coordinates; re-run it if a screen on the
  path changes). Whether VoiceOver users on Safari / iOS are affected is **not verified** — worth a manual check on a
  real iPhone with VoiceOver on, and an upstream Flutter issue if it reproduces.
- Playwright's WebKit offers no `navigator.storage`, so "Storage: …" is not shown there (the app hides it when the
  API is missing); real Safari has it. Its offline emulation also aborts navigations that a service worker would
  answer, so the smoke empties the server instead (any request reaching it would 404) and additionally uses the
  network-level switch in Chromium.
- Flutter needs `navigator.language` to be set: a headless Chromium with no locale fails at start-up ("Incorrect
  locale information provided"); the smoke sets `en-US`.

**Also done in the Chromium built into the Claude desktop app:** the bundle loads and the manifest, icons and
create-passphrase flow render; that embedded browser refuses *every* service-worker registration (even Flutter's
empty file), so installability, offline reload and the update banner were verified in Playwright's Chromium and
WebKit instead (above), not in the pane.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Stuck on an old version | Close every OpenPlate tab/app window and reopen (the update applies on next open), or tap *Reload* on the banner. To force it from a desktop browser: DevTools → Application → Service Workers → *Unregister*, and Cache Storage → delete the `openplate-precache-*` entries, then reload. **Do not use "Clear site data" / "Clear storage"**: that also erases your encrypted history (IndexedDB) — export first if you must. On a phone: removing the Home Screen app and re-adding it also fixes it (on iOS this discards that app's data — export first). |
| "Web storage unavailable" / store unavailable | The page is not a **secure context**: you opened `http://<ip>` instead of `https://…` or `http://localhost`, or the certificate is not trusted. Fix the URL/certificate. Private browsing modes can also block IndexedDB. |
| The app never becomes installable / no install icon | Needs HTTPS with a valid certificate, the manifest and the service worker. Check `https://<host>/manifest.json` and `/sw.js` load without credentials (basic auth breaks this) and DevTools → Application → Manifest shows no errors. |
| The AI call is blocked / "Test connection" fails | CSP `connect-src`: add the endpoint origin to `OPENPLATE_CONNECT_SRC_EXTRA` and restart the container (browser console shows a CSP violation). |
| Camera / scanner does nothing | Allow the camera for the site in the browser settings; needs HTTPS. If the decoder fails to start the screen says so and manual entry still works. |
| White page / the app never starts after an update | Wait ~30 s (the bootstrap activates a waiting fix once). Still broken: use the **kill switch** (see *Updating → If an update goes wrong*). |
| The banner never appears after a deploy | The browser checks on open/foreground; reopen the app once. Check that `sw.js` is served `no-cache` (`curl -I https://<host>/sw.js`) and that its `BUILD_ID` differs from the old one (it changes with the bundle *and* with any change to the security headers, e.g. `OPENPLATE_CONNECT_SRC_EXTRA`). |
| "Open in another tab" | Another tab/window holds the store; lock or close it, then retry. |
| Blank page after an update on iOS | Remove the Home Screen app and re-add it (export first if it had data). |
