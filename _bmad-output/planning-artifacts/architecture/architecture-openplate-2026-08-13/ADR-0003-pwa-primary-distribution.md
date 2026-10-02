# ADR-0003 — The installable, offline-capable PWA is the primary distribution

- **Status:** Accepted (family test, 2026-10-02)
- **Builds on:** ADR-0002 (the encrypted web store). **Revises:** the "BYOK key and AI settings are memory-only on web" decision (security review S4 / Phase 3).
- **Scope:** the Flutter web build and how it is served. Native Android / iOS builds keep working from the same codebase (they keep the OS keystore for the AI key).
- **User guide:** [`docs/pwa.md`](../../../../docs/pwa.md).

## Context
The first people to use OpenPlate are a family, on their own phones, with one self-hosted server
behind an existing Traefik. Shipping and signing native apps for that is far more work than the
web build that already exists, and ADR-0002 made the web build safe to keep real data in. What was
missing is what makes a web app feel like an app: installing it, opening it with no connection, a
sane update story, protection against the browser evicting its data, a barcode scanner on iPhone
(Safari has no `BarcodeDetector`), and a deployment path that matches how the owner already runs
HTTPS.

## Decision
1. **Own service worker, no Flutter service worker.** The build keeps `--pwa-strategy=none` (the
   Flutter-generated worker is deprecated). `tools/generate_precache_manifest.dart` runs after
   `flutter build web` and writes `precache-manifest.json` (every file needed to boot, with
   SHA-256 and size) and `sw.js` (from `tools/pwa/sw.template.js`, with the **build id** baked in).
   The build id is a hash of the file list, so any shipped change changes `sw.js` byte-for-byte —
   which is what makes the browser run an update.
   - *install*: precache the manifest into `openplate-precache-<buildId>` (cache-busting fetches,
     each body verified against its SHA-256; unchanged files are reused from the previous cache).
     Any failure aborts the install; the running version is untouched.
   - *waiting*: the new worker **never** `skipWaiting()`s by itself. The app shows one calm,
     dismissible line — "A new version is ready — Reload" — and only a tap posts `SKIP_WAITING`;
     the page reloads **once**, on `controllerchange`. The line says that reloading locks the data
     (the store is re-opened with the passphrase).
   - *activate*: delete every other `openplate-precache-*` cache, claim clients.
   - The cached `index.html` keeps the network response's **headers** (CSP, X-Frame-Options, ...): the
     stored responses copy them (dropping only wire-encoding headers and `Set-Cookie`), and the document
     is never reused from an older cache. A browser smoke step asserts the CSP on a worker-served
     navigation and that an injected inline script is blocked.
   - **The served `sw.js` / `precache-manifest.json` are rendered at container start**
     (`30-render-sw.sh`): build id = `<bundle id>-<hash of the rendered security headers>`, so a deployment
     that only changes `OPENPLATE_CONNECT_SRC_EXTRA` is a new service-worker version and installed apps get
     the update banner after the restart.
   - **Escape hatches.** `OPENPLATE_SW_KILL=1` serves `tools/pwa/sw.kill.js` (skipWaiting, delete all caches,
     reload windows once, no fetch handler; it does not unregister, which would loop). `flutter_bootstrap.js`
     (also worker-served) activates a *waiting* worker once if the engine painted nothing after 20 s, so a build
     that crashes before its own banner can still be replaced by a fixed one.
   - *fetch*: GET + same-origin only. Page navigations (no file extension) get the cached
     `index.html` — online or offline, so one page load is always **one consistent build** (a
     network-first index next to a cache-first `main.dart.js` would mix versions). Precached assets:
     cache first. Everything else: untouched network. **Cross-origin requests (Open Food Facts, a
     BYOK endpoint) and every non-GET are never intercepted, and nothing is ever written to a cache
     at run time**, so no API response can be cached.
   - Registration happens from Dart (`main.dart.js`, a same-origin script — no inline script, so the
     CSP is unchanged), only on a **secure context** and only in a **release** build.
2. **Durable storage.** After every create/unlock the app calls `navigator.storage.persist()` once,
   only if not already persisted; *Your data* states the result calmly. The date of the last export
   is kept **inside the encrypted store**; if it is older than 14 days (or never) and there is data,
   one dismissible line suggests an export (pure rule in `domain_core`, no badge/modal/streak).
3. **Schema v5: `kv_table`.** A small key/value table in the encrypted database. On web it holds the
   **BYOK key** (still bound to its host) and the **AI settings/consents**, replacing "memory only,
   re-enter after every lock". They are read after the passphrase unlock — the provider scope is
   restarted on every unlock as well as every lock — and are deleted with the store. They are never in
   `localStorage` (the legacy purge stays). Native keeps secure storage for them; it uses the table
   only for the export date. The migration is idempotent like v4.
4. **Self-hosted barcode decoder.** `mobile_scanner` already falls back from `BarcodeDetector` to
   `zxing-wasm`, but loads it (and its `.wasm`) from jsDelivr. `scripts/fetch_web_zxing.sh` fetches the
   exact npm tarball `mobile_scanner 7.4.x` expects (zxing-wasm 3.1.1), verifies SHA-256, rewrites the
   one CDN wasm URL in the reader to `zxing/<version>/…` (and verifies the result against a second
   pin), and the app points `mobile_scanner` at that script. The CDN literals stay in the compiled
   code as dead strings; `tools/check_no_external_hosts.sh` tolerates them only while the redirect is
   verified present and the decoder is in the bundle. Safari/iOS and Firefox now scan; "scanning isn't
   available" remains only as a failure fallback.
5. **Install help.** Settings → "Install on your phone" (web only): steps for the detected platform,
   what installing changes, the backup line; on Chromium an "Install" button using the captured
   `beforeinstallprompt`, only on that screen, only on tap.
6. **Deployment behind Traefik.** The container stays local-only. `infra/docker-compose.traefik.yml`
   (standalone — compose cannot remove an inherited published port without `!reset`) publishes **no
   port** and joins the external Traefik network; labels route `Host(...)` over the HTTPS entrypoint
   and add an **HSTS-only** headers middleware (it sets nothing else, so the app's CSP/COOP/... pass
   through). Optional overlays add a cert resolver and an `ipAllowList`. A file-provider example covers
   Traefik running on the host. `bin/openplate up --traefik` validates every value with strict
   patterns. Basic auth is not recommended: the web manifest is fetched without credentials, so
   installability checks can fail behind it (untested); a VPN or allow-list is preferred.
7. **Proof beyond the Dart VM.** `scripts/webkit_smoke.sh` runs the production image under Playwright
   (image pinned by digest) in WebKit and Chromium: create → log → reload → unlock → offline reload →
   update banner → reload once → no foreign requests.

## Consequences
- Updating a deployment is "deploy a new image"; installed apps notice on their next visit/foreground
  and offer the reload. Old versions are removed on activation.
- Schema safety: a database written by a newer schema than the running build is **refused** (typed
  `SchemaTooNewException`; on web the lock screen says "opened by a newer version — reload to update").
- The service worker is a new place where a bug can strand users on an old build. Mitigations: `sw.js`
  and the manifests are `no-cache`; the worker never caches at run time; a checksum or build-id mismatch
  fails the install (old version stays); `docs/pwa.md` documents unregistering.
- The BYOK key is now persisted on web, encrypted by the passphrase-derived key. A passphrase that is
  guessed (offline, against a copied IndexedDB) now also yields the key; this is the same exposure as the
  rest of the data and is stated in `docs/ai-tiers.md`. A malicious script on the origin could read the
  key while the store is unlocked — as it could before, from memory; the strict CSP is the control.
- iOS keeps an installed web app's data **separate** from Safari's: users must install before logging,
  and exports are the only bridge. Safari may evict a *tab's* site data after a period without use;
  home-screen apps are exempt. Both are in the user docs.
- Cross-origin isolation is not enabled, so the multi-threaded Flutter engines (skwasm) are not used and
  not precached; CanvasKit is.

## Not done (and why)
- No push notifications, background sync or periodic sync: none is needed and each would be a nag.
- No Workbox or other dependency: the worker is ~100 lines with no imports; a dependency would be a
  new supply-chain surface for no gain.
- Native launcher icons are still the Flutter placeholders (the PWA icons are new).
- Cross-device sync remains out of scope: devices are independent stores.
