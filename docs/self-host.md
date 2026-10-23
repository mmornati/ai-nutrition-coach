# AI Nutrition Coach — self-host (Story 4.4 / FR-11 / AD-2 / NFR9)

AI Nutrition Coach is yours to run. The self-host build is the `apps/web` React
PWA (a Vite build). The container is a **static web
server**: it serves the app and nothing else. It stores no data, makes no
outbound calls and runs as a non-root user on a read-only filesystem.

## Quick start (this machine)

```sh
bin/ai-nutrition-coach up        # builds the image, serves http://localhost:8080/
bin/ai-nutrition-coach down      # stops and removes it
```

`bin/ai-nutrition-coach` works from any directory. Open <http://localhost:8080/>; the
first screen is "Protect your history" (choose a passphrase), then the Day
Board. Change the port with `AI_NUTRITION_COACH_PORT=9000 bin/ai-nutrition-coach up`.

By default the port is published on **127.0.0.1 only**, so only this machine
can reach it.

## Reaching it from other devices: HTTPS is required

> **Plain HTTP over a network is unsupported.** AI Nutrition Coach's encrypted web
> store needs the browser's WebCrypto API (`crypto.subtle`), which browsers only expose on a
> _secure context_: `https://…` or `http://localhost`. Opened over
> `http://192.168.x.y:8080/` the app reports the store as unavailable instead
> of running unprotected; the camera (barcode, photo) is blocked too, and the service worker
> (offline use, the update line) cannot register. Plain HTTP would
> also let anyone on the network rewrite the JavaScript and read your
> passphrase. Do not expose the plain-HTTP port with `AI_NUTRITION_COACH_BIND=0.0.0.0`
> unless something in front of it terminates TLS.

The supported way is the bundled, opt-in Caddy profile. It obtains and renews a
Let's Encrypt certificate automatically, redirects HTTP to HTTPS and adds
`Strict-Transport-Security`:

```sh
AI_NUTRITION_COACH_DOMAIN=plate.example.com bin/ai-nutrition-coach up --tls
```

Requirements: a DNS name pointing at the host, and ports 80 and 443 reachable
from the internet for the certificate challenge. `AI_NUTRITION_COACH_DOMAIN=localhost`
gives a local, self-signed trial. The equivalent compose command is

```sh
AI_NUTRITION_COACH_DOMAIN=plate.example.com \
  docker compose -f infra/docker-compose.yml --profile tls up -d
```

### Behind your own Traefik

Already run Traefik for HTTPS? Keep the app container local-only and let Traefik route to it:

```sh
AI_NUTRITION_COACH_DOMAIN=plate.example.com AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER=letsencrypt bin/ai-nutrition-coach up --traefik
```

`infra/docker-compose.traefik.yml` publishes **no port**, joins the Docker network Traefik is on
(`AI_NUTRITION_COACH_TRAEFIK_NETWORK`, default `traefik`), and adds the router, service and an HSTS-only middleware
as labels; optional overlays add a cert resolver and an `ipAllowList`. Traefik on the host instead? Use
`infra/traefik/ai-nutrition-coach-dynamic.yml` with the loopback-published container. Everything — variables,
step-by-step, DNS/certificates, family-only access (and why not basic auth), the CSP knob for the BYOK
endpoint — is in [`docs/pwa.md`](./pwa.md#deploy-behind-traefik).

### Behind Authentik (Traefik forward auth, Cloudflare Tunnel)

The same Traefik stack, with a sign-in in front: the setup of a home server where Cloudflare serves HTTPS,
a tunnel (`cloudflared`) hands the traffic to Traefik over plain HTTP, and Traefik asks Authentik before
anything reaches the app. `infra/server.env.example` is a complete example:

```sh
git clone https://github.com/mmornati/ai-nutrition-coach.git && cd ai-nutrition-coach/infra
cp server.env.example .env       # git-ignored; set the domain, network, entrypoint, middleware names
docker compose up -d --build     # builds infra/Dockerfile from this checkout
docker compose ps                # "healthy" within a few seconds
```

`.env` names the three compose files (`COMPOSE_FILE`) and the project (`COMPOSE_PROJECT_NAME`):

- `docker-compose.traefik.yml` — the app, no published port. `AI_NUTRITION_COACH_TRAEFIK_TLS=false` because
  HTTPS ends at Cloudflare and the tunnel reaches Traefik's HTTP entrypoint
  (`AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT`, e.g. `insecure`). The browser still sees HTTPS, which the
  encrypted store needs.
- `docker-compose.traefik-auth.yml` — HSTS + your forward-auth middleware
  (`AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE=authentik@file`). It has no default: compose refuses to start
  without it.
- `docker-compose.traefik-authentik.yml` — a second router for `/outpost.goauthentik.io/` on the same host,
  without the middleware, to Authentik's outpost (`AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE`, a Traefik
  service pointing at `http://authentik:9000/outpost.goauthentik.io`). Authentik finishes the sign-in there.

`bin/ai-nutrition-coach up --traefik` does the same from environment variables: it adds the two overlays when
the middleware and outpost variables are set.

**Updating:** `git -C .. pull --ff-only && docker compose up -d --build`. Installed apps pick the new build up
through their update prompt.

**Authentik:** with a _domain-level_ forward-auth provider the new host is covered already. With
_single application_ mode, create a _Proxy_ provider (forward auth, single application, external host
`https://ai-nutrition-coach.example.org`), an _Application_ using it, and add it to the embedded outpost.
Bind the application to the people who should use the app (a group of the household's adults).

**Cloudflare:** Zero Trust → Networks → Tunnels → your tunnel → _Public Hostname_: the new name, type
`HTTP`, URL the same Traefik target as your other names.

What the sign-in does and does not do, for this app specifically:

- It controls who may **download** the app and its updates. There is nothing else on the server: the data is
  encrypted in each browser and the passphrase protects it, signed in or not.
- Once installed, the app opens from its offline cache without asking the proxy, so an expired SSO session is
  not noticed until an update is fetched: that fetch fails quietly and is retried after the next sign-in
  (open the address in the browser). The service worker never answers `/outpost.goauthentik.io/` from its
  cache, so the sign-in callback always reaches Authentik.
- The web manifest is requested _with_ the session cookie (`crossorigin="use-credentials"`), so
  installation works behind the sign-in. (Plain basic auth is still discouraged — see
  [`docs/pwa.md`](./pwa.md#family-only-access).)
- Forward auth and the IP allow-list overlay both set the router's middlewares: use one of them.

Another reverse proxy (nginx, a tunnel)? Point it at the app, terminate TLS there and add HSTS yourself. If
that proxy runs **in a container**, `127.0.0.1:8080` is its own loopback, not the app: put both on a shared
docker network and proxy to `http://ai-nutrition-coach:8080` (the compose service name).

## Run the published image instead of building

Every commit on `main` whose image passed its checks is published to the GitHub Container Registry
(`.github/workflows/publish.yml`): the image is built, scanned (trivy: no fixable HIGH/CRITICAL) and driven in
WebKit and Chromium (`scripts/webkit_smoke.sh`) **before** it is pushed. Nothing in it is specific to a host:
every setting on this page is read by the container at start, so the published image serves your instance as
well as one you build.

| Tag                                           | What it is                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `ghcr.io/mmornati/ai-nutrition-coach:edge`    | the head of `main` (never `:latest`)                                    |
| `ghcr.io/mmornati/ai-nutrition-coach:X.Y.Z`   | a release (`vX.Y.Z` tag); also `:X.Y`, and `:latest` for the highest one |
| `ghcr.io/mmornati/ai-nutrition-coach:sha-<7>` | one exact commit, to pin or roll back                                   |

Set the image in `infra/.env` (or the environment) and pull instead of building:

```sh
AI_NUTRITION_COACH_IMAGE_TAG=ghcr.io/mmornati/ai-nutrition-coach:edge
```

```sh
docker compose pull && docker compose up -d   # no --build: the compose `build:` section is then unused
```

With a published image the compose `build:` section (and its `AI_NUTRITION_COACH_PROJECT_URL` /
`AI_NUTRITION_COACH_RELEASE` build arguments) is not used. Do **not** add `--build`: it would build this
checkout and tag the result with the registry's name. **Updating** is the same `pull` + `up -d` (a scheduler
such as Coolify's or a nightly cron can run it). Each image carries `org.opencontainers.image.revision` (the
commit it was built from), a provenance attestation and an SBOM.

## Where your data lives

**In your browser, not on the server.** Your history is stored encrypted
(ChaCha20-Poly1305 via SQLite3 Multiple Ciphers) in the browser's origin-private file
storage (OPFS) for the site's origin, keyed from your passphrase (see
[`docs/your-data.md`](./your-data.md), [ADR-0005](./adr/0005-web-encrypted-store.md)). Consequences:

- There is no volume to mount and nothing on the server to back up.
  (`--with-persist` and the old `/data` volume never stored anything and were
  removed.) Redeploying or deleting the container does not touch your data.
- Data is per browser **and per origin**: `http://localhost:8080` and
  `https://plate.example.com` are separate stores. Changing the domain starts
  an empty store.
- Clearing site data or switching browsers loses it. **The backup path is the
  in-app export** (CSV/JSON); keep exports somewhere safe.
- A forgotten passphrase cannot be recovered by anyone.
- The one thing that passes through the server is a photo someone chooses to send with the
  [instance-wide AI](#offer-ai-to-everyone-on-your-instance), if you turned it on: it is relayed, not stored.

## Configuration

| Variable                                               | Default                  | Meaning                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_NUTRITION_COACH_BIND`                              | `127.0.0.1`              | Host interface for the app port.                                                                                                                                                                                        |
| `AI_NUTRITION_COACH_PORT`                              | `8080`                   | Host port (`AI_NUTRITION_COACH_HOST_PORT` is a deprecated alias).                                                                                                                                                       |
| `AI_NUTRITION_COACH_DOMAIN`                            | –                        | DNS name for `--tls` and `--traefik` (required there).                                                                                                                                                                  |
| `AI_NUTRITION_COACH_TRAEFIK_NETWORK`                   | `traefik`                | `--traefik`: existing Docker network shared with Traefik.                                                                                                                                                               |
| `AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT`                | `websecure`              | `--traefik`: Traefik's HTTPS entrypoint.                                                                                                                                                                                |
| `AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER`              | –                        | `--traefik`: ACME resolver name (optional overlay).                                                                                                                                                                     |
| `AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST`                 | –                        | `--traefik`: comma-separated CIDRs allowed to connect (optional overlay).                                                                                                                                               |
| `AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS`           | `false`                  | `--traefik`: add `includeSubdomains` to HSTS.                                                                                                                                                                           |
| `AI_NUTRITION_COACH_TRAEFIK_TLS`                       | `true`                   | `--traefik`: the router serves HTTPS. `false` only when HTTPS ends before Traefik (a tunnel).                                                                                                                           |
| `AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE`           | –                        | `--traefik`: forward-auth middleware in front of the app, e.g. `authentik@file` (optional overlay).                                                                                                                     |
| `AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE`         | –                        | `--traefik`: Traefik service of Authentik's outpost, e.g. `sso@file`; needs the middleware.                                                                                                                             |
| `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA`                 | empty                    | Extra CSP `connect-src` origins (see below).                                                                                                                                                                            |
| `AI_NUTRITION_COACH_ACCESS_LOG`                        | `off`                    | nginx access log: `off` (nothing logged), `on` (time, method, path; address truncated; no User-Agent / Referer / query), `full` (whole address). Anything else refuses to start. See [Logs](#logs).                     |
| `AI_PROXY_ENABLED`                                     | `0`                      | `1` offers ONE AI key to everyone on this instance (needs the four below). Off otherwise; see [Offer AI to everyone on your instance](#offer-ai-to-everyone-on-your-instance).                                          |
| `AI_PROXY_UPSTREAM`                                    | –                        | The provider's OpenAI-compatible base, `https://` only, e.g. `https://openrouter.ai/api/v1`.                                                                                                                            |
| `AI_PROXY_KEY`                                         | –                        | The provider key. A **secret**: never in the image or the bundle; rendered at start into a private file.                                                                                                                |
| `AI_PROXY_MODEL`                                       | –                        | The model every request uses (forced server-side).                                                                                                                                                                      |
| `AI_PROXY_LABEL`                                       | the upstream host        | What people are told their photos go to after this server.                                                                                                                                                              |
| `AI_PROXY_RATE` / `AI_PROXY_RATE_ALL`                  | `10r/m` / `30r/m`        | Request rate per client address, and for the whole instance. Both apply.                                                                                                                                                |
| `AI_PROXY_BURST` / `AI_PROXY_CONN`                     | `5` / `2`                | Burst allowance, and concurrent requests per client address.                                                                                                                                                            |
| `AI_PROXY_MAX_TOKENS` / `AI_PROXY_TOKEN_PARAM`         | `2000` / `max_tokens`    | Cap on a reply, and the parameter that carries it (`max_completion_tokens` for reasoning models).                                                                                                                       |
| `AI_PROXY_TRANSCRIPTION`                               | `0`                      | `1` also offers voice to text for _Describe a meal_ (`POST /ai/v1/audio/transcriptions`, see [Voice to text](#voice-to-text-describe-a-meal-by-voice)). Needs the proxy on and a provider with `/audio/transcriptions`. |
| `AI_PROXY_TRANSCRIPTION_MODEL`                         | `whisper-1`              | The one model a recording may name (the app reads it from `/ai/config.json`; any other is refused).                                                                                                                     |
| `AI_PROXY_TRANSCRIPTION_RATE` / `_RATE_ALL` / `_BURST` | `6r/m` / `20r/m` / `2`   | The voice route's own limits: per client address, for the whole instance, and the burst. Both rates apply.                                                                                                              |
| `AI_NUTRITION_COACH_SW_KILL`                           | –                        | `1` serves the service-worker kill switch (escape hatch; [`docs/pwa.md`](./pwa.md#if-an-update-goes-wrong-the-escape-hatches)).                                                                                         |
| `AI_NUTRITION_COACH_IMAGE_TAG`                         | `ai-nutrition-coach:dev` | Image tag to build/run; `ghcr.io/mmornati/ai-nutrition-coach:edge` runs the published image (see above).                                                                                                                                                                                               |
| `AI_NUTRITION_COACH_CONTAINER_NAME`                    | `ai-nutrition-coach`     | Container name for plain `up`.                                                                                                                                                                                          |

`bin/ai-nutrition-coach up --compose` runs the same container through
`infra/docker-compose.yml`. If the container name is taken, `up` stops with a
clear message and exit code 31 (`bin/ai-nutrition-coach down` first).

### Logs

The container logs **nothing per request by default** (`AI_NUTRITION_COACH_ACCESS_LOG=off`): the
server holds no user data, and its access log would only record page addresses and
times. Set `AI_NUTRITION_COACH_ACCESS_LOG=on` to debug: each line is
`<address, last octet zeroed> [time] "GET /resolved-file" status bytes` (the resolved file: app-shell and deep-link requests log as `/index.html`). The query string, the
User-Agent and the Referer are never logged, the container's own healthcheck is skipped,
and IPv6 addresses keep at most their first two groups (a /32; anything unrecognised logs as `::`). nginx has no built-in
anonymiser, so this is a `map` of the address rendered at start by
`infra/nginx/docker-entrypoint.d/10-render-access-log.sh`. `full` keeps the whole client
address (for a firewall or allow-list problem; turn it off again). The logs go to the
container's stdout, rotated by Docker (`json-file`, 10 MB × 3). `scripts/smoke_self_host.sh`
asserts all of this on a real container, and `tools/pwa/infra.test.mjs` (part of `pnpm verify`) pins it in the
config. Behind Traefik the client address nginx sees is Traefik's; Traefik's own access log
is the one to look at: see [`docs/pwa.md`](./pwa.md#logs-behind-traefik).

### The project URL

The project URL identifies this deployment to Open Food Facts (browsers forbid setting a `User-Agent`, so the web
bundle never sends it; it is reserved for the app identity string). It is a **build-time** setting: for the
container build, `docker build --build-arg AI_NUTRITION_COACH_PROJECT_URL=https://… -f infra/Dockerfile .`. The
default is the project repository, `https://github.com/mmornati/ai-nutrition-coach`; set the variable only to point
at a fork. `AI_NUTRITION_COACH_BUILD=release AI_NUTRITION_COACH_PROJECT_URL=… node tools/check_project_url.mjs`
fails only if the URL is empty or `.invalid` for a `selfhost` / `release` build. It is **enforced** for release
images: `docker build --build-arg AI_NUTRITION_COACH_RELEASE=1 --build-arg AI_NUTRITION_COACH_PROJECT_URL=…` runs
it before the web build, and `.github/workflows/release-gate.yml` does so for tags, taking the URL from the
repository **variable** `AI_NUTRITION_COACH_PROJECT_URL` (optional override, under Settings → Secrets and variables
→ Actions → Variables; left unset, the default above is used). A URL that is set must be a plain `https://` URL
(no spaces or quotes); `bin/ai-nutrition-coach` and the image build refuse anything else.

### Content-Security-Policy and your AI endpoint

The app ships a strict CSP, set by nginx on every response: `script-src 'self' 'wasm-unsafe-eval'` (no inline
script, no CDN; the WebAssembly flag is for the encrypted store's SQLite and the barcode decoder),
`style-src 'self'` (no inline style either: the build ships its CSS as a file and React applies its
`style` props through the CSSOM), `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors 'none'`, `form-action 'none'`, and

```
connect-src 'self' https://world.openfoodfacts.org <AI_NUTRITION_COACH_CONNECT_SRC_EXTRA>
```

This header is the **only** place `connect-src` is set (the `<meta>` CSP in `index.html` deliberately has none, so
this variable can widen it). Browser requests the app itself makes are limited to this list: barcode lookups
at Open Food Facts, and whatever AI endpoint **you** configure. This variable is
**the place to allow your BYOK endpoint** (it works the same behind Caddy, Traefik or
plain `up`). **If you use
"bring your own key" AI (Settings → Your AI), add that endpoint's origin**,
otherwise the browser blocks the call:

```sh
AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="https://api.openai.com" bin/ai-nutrition-coach up
# several origins are space-separated; a local model works too:
AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="https://openrouter.ai http://localhost:11434"
```

Trade-off, chosen deliberately: the BYOK endpoint is user-chosen, so the CSP
could simply allow `https:` — but then any script injected into the page could
send your data to any https server. An explicit, operator-configured allow-list
keeps that exfiltration channel closed; the cost is one environment variable.
The value is validated, in `bin/ai-nutrition-coach` and again when the container starts:
only space-separated `https://host[:port]` origins (plus `http://localhost[:port]`)
are accepted. Quotes, `;`, `*`, bare `https:`, paths and newlines make the
container refuse to start, because the value is written into the CSP header and
must not be able to rewrite the policy.

### Offer AI to everyone on your instance

By default each person brings their own AI key (Settings → Your AI). If you run the instance for a household or a
small group, you can instead keep **one** OpenAI-compatible endpoint, key and model on the server, so photo
recognition (and, later, coaching) just works for everyone without a key of their own. Off by default.

```sh
# infra/server.env  (copy infra/server.env.example to .env; chmod 600 .env)
AI_PROXY_ENABLED=1
AI_PROXY_UPSTREAM=https://openrouter.ai/api/v1
AI_PROXY_KEY=...                       # a secret: never commit it
AI_PROXY_MODEL=google/gemini-2.0-flash-001
AI_PROXY_LABEL=OpenRouter              # optional: what people are told their photos go to
```

With plain `bin/ai-nutrition-coach up` export the same variables first (the key is passed to Docker by name, so it is not
in the command line or the output); with compose they come from `.env`.

**What people see.** Settings → Your AI gains a choice, _Provided by this server_; it is the starting choice on a
**new** install (someone who already chose No AI or their own key keeps their choice). The consent dialog before each
photo says plainly that the photo goes to _this server_ and from there to the provider you named in `AI_PROXY_LABEL`.
Nothing about it is pressured; No AI stays one tap away. The app learns the offer from `GET /ai/config.json`, which
says only `{ "enabled": true, "model": "…", "label": "…", "transcription": false }` (plus `"transcriptionModel"` when voice to text is on; no key, no upstream address) and is never cached or
precached. With the proxy off it says `{ "enabled": false }`.

**How it works.** nginx, in the same container, answers `POST /ai/v1/chat/completions` on **your own origin** (so the
CSP needs no change: `connect-src 'self'`). It forwards the request to `${AI_PROXY_UPSTREAM}/chat/completions` with
`Authorization: Bearer <key>` added, and it forwards nothing the browser sent: no `Authorization`, `Cookie`, `Origin`,
`Referer`, `X-Forwarded-For` or `User-Agent` (a whitelist of headers, not a blacklist). Per request it also:

- accepts only requests **from this site**: `Content-Type` must be `application/json` (else `415`; a cross-site page
  cannot send that without a preflight, and `OPTIONS` is refused), a `Sec-Fetch-Site` header other than `same-origin`
  is a `403`, and so is an `Origin` whose host[:port] differs from the `Host` header (Traefik and Caddy keep `Host`, so
  `X-Forwarded-Host` is not consulted; a proxy that rewrites `Host` would need the header kept). The provider's own
  CORS headers are removed, so another site cannot read a reply either. Refused requests cost nothing;
- rewrites the body with njs (the one nginx module the image's base ships with): the model is **forced** to
  `AI_PROXY_MODEL`, the reply cap is clamped to 1..`AI_PROXY_MAX_TOKENS` (sent as `max_tokens`, or as
  `max_completion_tokens` with `AI_PROXY_TOKEN_PARAM` for reasoning models, which reject the former), and only `messages`,
  `temperature`, `top_p` and `response_format` are kept (no `stream`, `n`, `tools`, ...). The **input** is bounded to what
  the app sends: at most 8 messages, roles system/user/assistant, content as text or parts of type `text` /
  `image_url`, at most 24 KB of text in all, at most **one** image and only as an inline `data:image/jpeg|png|webp;base64,`
  URI (a remote URL is never forwarded). Anything else becomes `{}`, which the provider refuses with a 400 (njs cannot
  change the status). Someone calling the endpoint directly cannot pick a dearer model, send a long prompt or have the
  provider fetch a URL;
- accepts at most 2 MiB (one downscaled photo is a fraction of that), POST only, and answers `429` beyond the rate
  limits: **per client address** (default 10 requests a minute, burst 5, 2 concurrent) **and for the whole instance**
  (default 30 a minute, 16 concurrent). Behind Traefik or Caddy the client address is the proxy's, so the per-address
  limit (requests and concurrency) is effectively instance-wide too, unless you configure nginx's `real_ip` for your
  proxy (not done here: trusting a forwarded address is a decision for you to make);
- talks TLS to the provider and **verifies** its certificate against the system CA bundle; resolves its name at
  request time (cached 30 s), so a long-running container follows the provider's DNS; times out just after the app's
  own 45 s;
- shows no provider text: every provider error is replaced by a generic JSON body (`400` stays 400, `429` stays 429 with
  its `Retry-After`, everything else, a refused or empty-balance key included, becomes a bare `502`), and the provider's
  account, project, request-id and rate-limit headers (`openai-*`, `x-request-id`, the known `x-ratelimit-*` names,
  `Location`, cookies) are dropped;
- logs no header, body or query string, and upstream failures are logged at `crit` only (no client address). The access log is off by default and, when on, never has a query string
  (see [Logs](#logs)); a rate-limit rejection is logged below the container's log level, so no client address is written.

**How the key is protected.** `AI_PROXY_KEY` is read **only when the container starts**. It is never an image layer, a
build argument, a default or part of the bundle (the image build's secret scan still runs on the bundle; a test pins
that the Dockerfile has no key). At start `infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh` validates every value
against a strict pattern (a bad one refuses to start and is never printed), renders the proxy config into a file under
`/tmp` (a tmpfs, as for the rest of the rendered config) with mode `0600`, then **verifies** that the file is `0600` and
that the key appears in no other rendered file (the access-log format, the headers, the main config). The stock
`envsubst` step only touches `AI_NUTRITION_COACH_*` variables, so it never sees the key, and the script passes it to
its renderer through the environment, not a command line. nginx drops the environment from its worker processes. The
key is still in the container's environment, so anyone who can run `docker inspect` / `docker exec` on the host can read
it: that is the same trust as reading `.env`.

**Cost and abuse: read this.** Anyone who can reach the instance can use this key, within the rate limit. The limit is
per client address _as nginx sees it_: behind Traefik or Caddy that address is the proxy's, so in effect it caps the
whole instance (10 requests a minute by default, which is a ceiling on spend, not a fairness rule between people).
Therefore:

1. **Put the instance behind a sign-in or an allow-list** if it is reachable from the internet: the Traefik overlays
   `docker-compose.traefik-auth.yml` / `-authentik.yml` (forward auth) or `-allowlist.yml` (CIDRs) already in this
   repository ([Behind Authentik](#behind-authentik-traefik-forward-auth-cloudflare-tunnel), [Behind your own
   Traefik](#behind-your-own-traefik)). Forward auth covers `/ai/` too, because it is the same host.
2. **Set a spend limit at the provider** (a monthly cap or a prepaid balance), and use a key created for this instance.
3. Know the limits of the model lock: njs forces the model, caps the reply and bounds the input (messages, text, one
   inline image), but it cannot tell a photo question from any other question, so a visitor can still ask the model
   anything within those bounds, at the rate limits above. The nameserver nginx uses is the first plain address in
   `/etc/resolv.conf` (or `AI_PROXY_RESOLVER`); it ignores `/etc/hosts` and Docker's `--add-host`, so the provider's
   name must resolve through DNS.
4. The provider sees the photo and the instruction coming from **your server**, not from the person's device; the
   person's internet address stays with your server. Whoever runs the server chooses the provider and answers for it:
   the consent dialog says so.

Turn it off by unsetting `AI_PROXY_ENABLED` (or the key) and restarting. A missing key with `AI_PROXY_ENABLED=1` leaves
the AI off and says so in the container log. Rotating the key is a restart with the new value; nothing in a browser
needs to change.

### Voice to text (Describe a meal, by voice)

_Describe a meal_ lets a person say what they ate. With **their own key** the recording goes to their endpoint's
`/audio/transcriptions` (Whisper-compatible; the model is set in Your AI, default `whisper-1`). On **this server's AI**
it goes through the proxy, **only if you turn this on**:

```sh
AI_PROXY_TRANSCRIPTION=1              # default 0: the route does not exist (404)
AI_PROXY_TRANSCRIPTION_MODEL=whisper-1
#AI_PROXY_TRANSCRIPTION_RATE=6r/m  AI_PROXY_TRANSCRIPTION_RATE_ALL=20r/m  AI_PROXY_TRANSCRIPTION_BURST=2
```

It needs a provider that offers `/audio/transcriptions` under `AI_PROXY_UPSTREAM` (OpenAI does; many OpenAI-compatible
gateways do not). If yours has none, leave it off: the app then offers no microphone button on this server (it reads
`"transcription": false` from `/ai/config.json`; with it on the file also names `transcriptionModel`). Typing, and the
keyboard's own dictation, always work.

`POST /ai/v1/audio/transcriptions` is handled like the chat route, with its own tighter limits: POST only; same origin
only (`Sec-Fetch-Site` and `Origin` checked, `403` otherwise); `Content-Type` must be `multipart/form-data` (`415`); the
body at most **1 MiB** (`413`; a 30 s recording is about 120 KB); `429` beyond **6 requests a minute per client address
and 20 a minute for the whole instance** (burst 2, both configurable, validated at start); the key is added server-side
and the browser's headers are not forwarded (only the multipart `Content-Type`, which carries the boundary); the
provider's headers are removed and its errors become generic JSON bodies; upstream failures are logged at `crit` only.

**The model is forced by validation, not by rewriting.** A multipart body holds binary audio, which njs cannot rewrite
safely (it has no byte-preserving string type and a round trip through text corrupts audio). So the njs script
(`ai-proxy.js`, `txGate`) _parses_ the body as bytes and lets it through, unchanged, **only if** it holds exactly one
`file` part (an audio or video blob with a plain file name), exactly one `model` part equal to
`AI_PROXY_TRANSCRIPTION_MODEL`, and optionally a short `language` and `response_format=json`. Any other model, any
other part (`prompt`, `temperature`, timestamp options, a repeated part), a malformed or truncated body or a header
smuggled into a field gets the generic `400` and **never reaches the provider**. The cost of a call is therefore bounded
by the single configured model, 1 MiB of audio and the rate limits above. As for chat, the voice limits are per address
_as nginx sees it_: behind a reverse proxy that is the proxy's address, so they are effectively instance-wide.

What the provider receives: the recording (not stored by this app or by this server's software), the model name and the
app's language code. What this server logs: nothing of it. Who can spend the key is the same story as for chat: put the
instance behind a sign-in or an allow-list.

`scripts/smoke_self_host.sh` runs the real container twice for this: with the proxy off (`/ai/config.json` says
`{"enabled":false}`, `/ai/v1/chat/completions` is a 404, no `proxy_pass` exists in the rendered config) and with it on
against a throw-away local HTTPS upstream that reports whether the browser's `Authorization` header or cookie reached it
and what the injected key looked like. `tools/pwa/infra.test.mjs` pins the rendered config and the script.

### Caddy

The `caddy` service runs as root inside its container (binding 80/443 and
writing the certificate volume), with every capability dropped except
`NET_BIND_SERVICE`, a read-only root filesystem and `no-new-privileges`. It
serves HTTP/1.1 and HTTP/2 only (HTTP/3 would need `443/udp`), and hides
`Server` / `Via`.

### Container hardening

`bin/ai-nutrition-coach` and `infra/docker-compose.yml` run the image (nginx-unprivileged,
uid 101, port 8080) with `--read-only`, a small `tmpfs` on `/tmp` (the only place
nginx writes), `--cap-drop ALL` and `no-new-privileges`. Every response, including worker and wasm
responses and nginx's own error pages, carries `nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, a `Permissions-Policy` that allows only the camera for the app's own origin,
COOP/CORP `same-origin` and the CSP; the server version is hidden. Caching follows Vite's output:
`index.html`, `boot-guard.js`, `manifest.webmanifest`, `sw.js` and `precache-manifest.json` are revalidated
(`no-cache`) so upgrades take effect immediately (`sw.js` and the precache manifest are the installed app's way of
learning that a new version exists, [`docs/pwa.md`](./pwa.md)); Vite's content-hashed `assets/*` and the
versioned `sqlite3mc/<ver>/` engine, `zxing/<ver>/` decoder and `argon2/<ver>/` key-derivation build are `immutable`; fonts, icons and licence texts
(unhashed names) are cached five minutes and revalidated. A missing file is a real 404, never the app shell;
only a path without a file extension (a route) falls back to `index.html`.

### Updating, and the kill switch

Deploy a new image and restart; installed apps show a calm "A new version is ready" line
([`docs/pwa.md`](./pwa.md#updating)). **Changing `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` and restarting is also
a new version** (the service-worker build id covers the rendered headers). If a bad build gets stuck on
phones, start the container with `AI_NUTRITION_COACH_SW_KILL=1`: it serves a worker that deletes every cache
and reloads each open window once, without touching your data
([`docs/pwa.md`](./pwa.md#if-an-update-goes-wrong-the-escape-hatches)). The container refuses to start
if the bundle has no `sw.js` / precache manifest.

### Camera and barcode scanning

Scanning is decoded entirely on the device. The browser's native `BarcodeDetector` is
used where it exists (Chrome on Android, macOS and ChromeOS; Edge/Opera on macOS). Everywhere
else — **Safari/iOS, Firefox, Chrome/Edge on Windows and Linux** — the app uses a
**zxing-wasm decoder served from your own origin** (`zxing/<version>/`, fetched at build time by
`scripts/fetch_web_zxing_pwa.sh`, SHA-256 verified): nothing is downloaded from a third party and
the camera never leaves the device. Only if the decoder cannot start does the scanner say
"Scanning isn't available in this browser" and offer manual entry. The camera needs HTTPS (see above).

### Fonts

Barlow is bundled (`fonts/`, SIL OFL) and served from your own origin. A glyph it lacks (emoji, CJK and
other scripts) falls back to the system font; nothing is fetched from a CDN. Font and library licences are
listed under Settings → About.

## Verifying a build

```sh
bash scripts/smoke_self_host.sh      # builds via bin/ai-nutrition-coach and asserts:
```

- digest-pinned base images (the `node` build stage, `nginxinc/nginx-unprivileged`, `caddy`), strict-lockfile
  install;
- readiness (polling, no fixed sleep), HTTP 200, SPA deep links, 404 for missing
  assets, 405 for `POST`;
- `sqlite3mc/<ver>/sqlite3.wasm` served as `application/wasm`, `immutable`; `.mjs` as `text/javascript`; Vite's
  hashed `assets/*` `immutable`; a missing file is a 404;
- CSP and the other headers on html, js, css, worker, wasm, manifest and icon responses; no version in
  `Server`; no `'unsafe-inline'` (script or style), no blanket `https:`;
- every file of `precache-manifest.json` is served with exactly the SHA-256 it lists, and the boot-critical
  files (document, boot guard, store worker, sqlite3mc, zxing, argon2) are listed;
- container is non-root, read-only, capabilities dropped, no-new-privileges;
- the container boots and serves on a docker `--internal` network with no
  outbound route (and a deliberate outbound request there fails), i.e. the
  server **needs** no outbound network, and its rendered nginx config contains
  no `proxy_pass` / `resolver` (this is a self-containedness check, not a
  packet capture);
- the access log is off by default (the requests above left no line), and with `AI_NUTRITION_COACH_ACCESS_LOG=on` a request
  with a distinctive User-Agent, Referer and query string is logged as the resolved file only, with a truncated address; an
  invalid value refuses to start;
- hostile `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` / `AI_NUTRITION_COACH_DOMAIN` values are rejected;
- the Traefik compose renders with **no published port**, the expected labels (HSTS-only middleware),
  optional overlays and refusals of hostile Traefik settings; `sw.js`, `precache-manifest.json` and
  `manifest.webmanifest` are `no-cache` and agree on the build id; the zxing decoder is served and `immutable`;
  the kill switch serves the kill worker;
- a name collision is reported clearly; compose binds loopback by default;
- the shipped bundle references no third-party host
  (`tools/check_no_external_hosts.sh`: no CDN; the engine, decoder and fonts are served from your origin).

`bash scripts/webkit_smoke.sh` then drives the same image in WebKit and Chromium
([`docs/pwa.md`](./pwa.md#browser-smoke-webkit-and-chromium)).

## Where things live

```
infra/Dockerfile               multi-stage: node 24 LTS alpine (digest) + pnpm → nginx-unprivileged (digest)
infra/nginx/nginx.conf         main config (everything writable lives in /tmp)
infra/nginx/templates/         vhost + shared security-header include (envsubst at start)
infra/docker-compose.yml       hardened app service + opt-in `tls` profile (Caddy)
infra/docker-compose.traefik*.yml  behind your Traefik: no published port (+ cert-resolver / allow-list /
                               forward-auth / Authentik-outpost overlays)
infra/server.env.example       `.env` for Traefik + Authentik behind a Cloudflare Tunnel
infra/traefik/                 file-provider example for a Traefik running on the host
infra/Caddyfile                automatic HTTPS + HSTS for $AI_NUTRITION_COACH_DOMAIN
bin/ai-nutrition-coach                  the one-command affordance
scripts/smoke_self_host.sh     CI / local smoke test of the image
scripts/webkit_smoke.sh        real-browser smoke of the image (WebKit + Chromium)
tools/generate_precache_manifest.mjs  sw.js + precache-manifest.json for the Vite bundle
tools/check_no_external_hosts.sh  built-bundle third-party host scan
```

## What's NOT in v1

- **A relay / sync server.** The sync seam ships an in-memory outbox and a
  local-only adapter that sends nothing (so the app says "on this device" and
  never "synced"); a self-host relay and a durable outbox are future work.
- **Server-side accounts or storage** — by design.

## Telemetry

The self-host image ships with no telemetry (FR-12): the served bundle makes no
analytics or tracking calls, the server needs no outbound network (unless you turn on the optional
[instance-wide AI](#offer-ai-to-everyone-on-your-instance), which needs outbound HTTPS to your provider), and the only
browser network paths are the ones you enable (barcode lookups, an AI endpoint
you configure, the AI your server offers). The import-based telemetry gate (`tools/check_telemetry_claims.mjs`) pins this claim; see
[`docs/telemetry-posture.md`](./telemetry-posture.md).

## Cross-references

- [`docs/pwa.md`](./pwa.md) — the installable web app: build, run, Traefik, install, update, troubleshooting.
- [`docs/your-data.md`](./your-data.md) — the protection posture of the encrypted browser store.
- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface.
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the network surface.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path.
