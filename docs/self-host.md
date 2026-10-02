# AI Nutrition Coach — self-host (Story 4.4 / FR-11 / AD-2 / NFR9)

OpenPlate is yours to run. The self-host build is the same `apps/client`
Flutter web build the mobile apps ship. The container is a **static web
server**: it serves the app and nothing else. It stores no data, makes no
outbound calls and runs as a non-root user on a read-only filesystem.

## Quick start (this machine)

```sh
bin/openplate up        # builds the image, serves http://localhost:8080/
bin/openplate down      # stops and removes it
```

`bin/openplate` works from any directory. Open <http://localhost:8080/>; the
first screen is "Protect your history" (choose a passphrase), then the Day
Board. Change the port with `OPENPLATE_PORT=9000 bin/openplate up`.

By default the port is published on **127.0.0.1 only**, so only this machine
can reach it.

## Reaching it from other devices: HTTPS is required

> **Plain HTTP over a network is unsupported.** OpenPlate's encrypted web
> store needs the browser's WebCrypto API, which browsers only expose on a
> *secure context*: `https://…` or `http://localhost`. Opened over
> `http://192.168.x.y:8080/` the app reports the store as unavailable instead
> of running unprotected (and the camera is blocked too). Plain HTTP would
> also let anyone on the network rewrite the JavaScript and read your
> passphrase. Do not expose the plain-HTTP port with `OPENPLATE_BIND=0.0.0.0`
> unless something in front of it terminates TLS.

The supported way is the bundled, opt-in Caddy profile. It obtains and renews a
Let's Encrypt certificate automatically, redirects HTTP to HTTPS and adds
`Strict-Transport-Security`:

```sh
OPENPLATE_DOMAIN=plate.example.com bin/openplate up --tls
```

Requirements: a DNS name pointing at the host, and ports 80 and 443 reachable
from the internet for the certificate challenge. `OPENPLATE_DOMAIN=localhost`
gives a local, self-signed trial. The equivalent compose command is

```sh
OPENPLATE_DOMAIN=plate.example.com \
  docker compose -f infra/docker-compose.yml --profile tls up -d
```

### Behind your own Traefik

Already run Traefik for HTTPS? Keep the app container local-only and let Traefik route to it:

```sh
OPENPLATE_DOMAIN=plate.example.com OPENPLATE_TRAEFIK_CERTRESOLVER=letsencrypt bin/openplate up --traefik
```

`infra/docker-compose.traefik.yml` publishes **no port**, joins the Docker network Traefik is on
(`OPENPLATE_TRAEFIK_NETWORK`, default `traefik`), and adds the router, service and an HSTS-only middleware
as labels; optional overlays add a cert resolver and an `ipAllowList`. Traefik on the host instead? Use
`infra/traefik/openplate-dynamic.yml` with the loopback-published container. Everything — variables,
step-by-step, DNS/certificates, family-only access (and why not basic auth), the CSP knob for the BYOK
endpoint — is in [`docs/pwa.md`](./pwa.md#deploy-behind-traefik).

Another reverse proxy (nginx, a tunnel)? Point it at the app, terminate TLS there and add HSTS yourself. If
that proxy runs **in a container**, `127.0.0.1:8080` is its own loopback, not the app: put both on a shared
docker network and proxy to `http://openplate:8080` (the compose service name).

## Where your data lives

**In your browser, not on the server.** Your history is stored encrypted
(ChaCha20 via SQLite3MultipleCiphers) in the browser's IndexedDB for the
site's origin, keyed from your passphrase (see
[`docs/your-data.md`](./your-data.md), ADR-0002). Consequences:

- There is no volume to mount and nothing on the server to back up.
  (`--with-persist` and the old `/data` volume never stored anything and were
  removed.) Redeploying or deleting the container does not touch your data.
- Data is per browser **and per origin**: `http://localhost:8080` and
  `https://plate.example.com` are separate stores. Changing the domain starts
  an empty store.
- Clearing site data or switching browsers loses it. **The backup path is the
  in-app export** (CSV/JSON); keep exports somewhere safe.
- A forgotten passphrase cannot be recovered by anyone.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENPLATE_BIND` | `127.0.0.1` | Host interface for the app port. |
| `OPENPLATE_PORT` | `8080` | Host port (`OPENPLATE_HOST_PORT` is a deprecated alias). |
| `OPENPLATE_DOMAIN` | – | DNS name for `--tls` and `--traefik` (required there). |
| `OPENPLATE_TRAEFIK_NETWORK` | `traefik` | `--traefik`: existing Docker network shared with Traefik. |
| `OPENPLATE_TRAEFIK_ENTRYPOINT` | `websecure` | `--traefik`: Traefik's HTTPS entrypoint. |
| `OPENPLATE_TRAEFIK_CERTRESOLVER` | – | `--traefik`: ACME resolver name (optional overlay). |
| `OPENPLATE_TRAEFIK_ALLOWLIST` | – | `--traefik`: comma-separated CIDRs allowed to connect (optional overlay). |
| `OPENPLATE_TRAEFIK_HSTS_SUBDOMAINS` | `false` | `--traefik`: add `includeSubdomains` to HSTS. |
| `OPENPLATE_CONNECT_SRC_EXTRA` | empty | Extra CSP `connect-src` origins (see below). |
| `OPENPLATE_SW_KILL` | – | `1` serves the service-worker kill switch (escape hatch; [`docs/pwa.md`](./pwa.md#if-an-update-goes-wrong-the-escape-hatches)). |
| `OPENPLATE_IMAGE_TAG` | `openplate:dev` | Image tag to build/run. |
| `OPENPLATE_CONTAINER_NAME` | `openplate` | Container name for plain `up`. |

`bin/openplate up --compose` runs the same container through
`infra/docker-compose.yml`. If the container name is taken, `up` stops with a
clear message and exit code 31 (`bin/openplate down` first).

### Content-Security-Policy and your AI endpoint

The app ships a strict CSP: `script-src 'self' 'wasm-unsafe-eval'` (no inline
script, no CDN; the WebAssembly flag is for CanvasKit and the encrypted store),
`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
`form-action 'none'`, and

```
connect-src 'self' https://world.openfoodfacts.org <OPENPLATE_CONNECT_SRC_EXTRA>
```

Browser requests the app itself makes are limited to this list: barcode lookups
at Open Food Facts, and whatever AI endpoint **you** configure. This variable is
**the place to allow your BYOK endpoint** (it works the same behind Caddy, Traefik or
plain `up`). **If you use
"bring your own key" AI (Settings → Your AI), add that endpoint's origin**,
otherwise the browser blocks the call:

```sh
OPENPLATE_CONNECT_SRC_EXTRA="https://api.openai.com" bin/openplate up
# several origins are space-separated; a local model works too:
OPENPLATE_CONNECT_SRC_EXTRA="https://openrouter.ai http://localhost:11434"
```

Trade-off, chosen deliberately: the BYOK endpoint is user-chosen, so the CSP
could simply allow `https:` — but then any script injected into the page could
send your data to any https server. An explicit, operator-configured allow-list
keeps that exfiltration channel closed; the cost is one environment variable.
The value is validated, in `bin/openplate` and again when the container starts:
only space-separated `https://host[:port]` origins (plus `http://localhost[:port]`)
are accepted. Quotes, `;`, `*`, bare `https:`, paths and newlines make the
container refuse to start, because the value is written into the CSP header and
must not be able to rewrite the policy.

### Caddy

The `caddy` service runs as root inside its container (binding 80/443 and
writing the certificate volume), with every capability dropped except
`NET_BIND_SERVICE`, a read-only root filesystem and `no-new-privileges`. It
serves HTTP/1.1 and HTTP/2 only (HTTP/3 would need `443/udp`), and hides
`Server` / `Via`.

### Container hardening

`bin/openplate` and `infra/docker-compose.yml` run the image (nginx-unprivileged,
uid 101, port 8080) with `--read-only`, a small `tmpfs` on `/tmp` (the only place
nginx writes), `--cap-drop ALL` and `no-new-privileges`. Every response carries
`nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, a
`Permissions-Policy` that allows only the camera for the app's own origin,
COOP/CORP `same-origin` and the CSP; the server version is hidden. Caching:
`index.html`, the loader, `main.dart.js`, CanvasKit and the manifest are
revalidated (`no-cache`) so upgrades take effect immediately — that includes
`sw.js` and `precache-manifest.json`, the installed app's way of learning that a new
version exists ([`docs/pwa.md`](./pwa.md)); only the versioned `sqlite3mc-<ver>.wasm`
and `zxing/<ver>/` decoder are `immutable`.

### Camera and barcode scanning

Scanning is decoded entirely on the device. The browser's native `BarcodeDetector` is
used where it exists (Chrome on Android, macOS and ChromeOS; Edge/Opera on macOS). Everywhere
else — **Safari/iOS, Firefox, Chrome/Edge on Windows and Linux** — the app uses a
**zxing-wasm decoder served from your own origin** (`zxing/<version>/`, fetched at build time by
`scripts/fetch_web_zxing.sh`, SHA-256 verified): nothing is downloaded from a third party and
the camera never leaves the device. Only if the decoder cannot start does the scanner say
"Scanning isn't available in this browser" and offer manual entry. The Android and iOS apps use the
platform scanners and are not affected.

### Fonts

Roboto is bundled and the engine's fallback-font path points at your own origin
(one Noto Sans Symbols file ships there). Glyphs outside those (emoji, CJK and
other scripts) render as missing-glyph boxes instead of being fetched from a
CDN; add the corresponding woff2 files under `apps/client/web/fallback-fonts/`
if you need them. Font licences (Apache-2.0 / SIL OFL) are listed under
Settings → About → Open-source licences.

## Verifying a build

```sh
bash scripts/smoke_self_host.sh      # builds via bin/openplate and asserts:
```

- digest-pinned base images (`nginxinc/nginx-unprivileged`, `caddy`);
- readiness (polling, no fixed sleep), HTTP 200, SPA deep links, 404 for missing
  assets, 405 for `POST`;
- `sqlite3mc-<ver>.wasm` served as `application/wasm`, `immutable`;
- CSP and the other headers on html, js and wasm responses; no version in
  `Server`; no `'unsafe-inline'` script, no blanket `https:`;
- container is non-root, read-only, capabilities dropped, no-new-privileges;
- the container boots and serves on a docker `--internal` network with no
  outbound route (and a deliberate outbound request there fails), i.e. the
  server **needs** no outbound network, and its rendered nginx config contains
  no `proxy_pass` / `resolver` (this is a self-containedness check, not a
  packet capture);
- hostile `OPENPLATE_CONNECT_SRC_EXTRA` / `OPENPLATE_DOMAIN` values are rejected;
- the Traefik compose renders with **no published port**, the expected labels (HSTS-only middleware),
  optional overlays and refusals of hostile Traefik settings; `sw.js`, `precache-manifest.json` and
  `manifest.json` are `no-cache` and agree on the build id; the zxing decoder is served and `immutable`;
- a name collision is reported clearly; compose binds loopback by default;
- the shipped bundle references no third-party host
  (`tools/check_no_external_hosts.sh`: no `gstatic.com`, `googleapis.com`,
  CDNs; CanvasKit and fonts are served from your origin).

## Where things live

```
infra/Dockerfile               multi-stage: Flutter 3.44.0 (digest) → nginx-unprivileged (digest)
infra/nginx/nginx.conf         main config (everything writable lives in /tmp)
infra/nginx/templates/         vhost + shared security-header include (envsubst at start)
infra/docker-compose.yml       hardened app service + opt-in `tls` profile (Caddy)
infra/docker-compose.traefik*.yml  behind your Traefik: no published port (+ cert-resolver / allow-list overlays)
infra/traefik/                 file-provider example for a Traefik running on the host
infra/Caddyfile                automatic HTTPS + HSTS for $OPENPLATE_DOMAIN
bin/openplate                  the one-command affordance
scripts/smoke_self_host.sh     CI / local smoke test
tools/check_no_external_hosts.sh  built-bundle third-party host scan
```

## What's NOT in v1

- **A relay / sync server.** The sync seam ships an in-memory outbox and a
  local-only adapter that sends nothing (so the app says "on this device" and
  never "synced"); a self-host relay and a durable outbox are future work.
- **Server-side accounts or storage** — by design.

## Telemetry

The self-host image ships with no telemetry (FR-12): the served bundle makes no
analytics or tracking calls, the server needs no outbound network, and the only
browser network paths are the ones you enable (barcode lookups, an AI endpoint
you configure). `melos run check:telemetry` pins this claim; see
[`docs/telemetry-posture.md`](./telemetry-posture.md).

## Cross-references

- [`docs/pwa.md`](./pwa.md) — the installable web app: build, run, Traefik, install, update, troubleshooting.
- [`docs/your-data.md`](./your-data.md) — the protection posture on web vs mobile.
- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface.
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the network surface.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path.
