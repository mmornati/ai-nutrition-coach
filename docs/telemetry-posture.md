// Story 4.5 — the user-facing privacy posture.
//
// AI Nutrition Coach ships with zero telemetry by default. The privacy
// posture is architecture, not policy: the only paths that open a
// socket are user-enabled (the catalog, the AI rung transport, the
// optional sync transport). The `pnpm check:telemetry` gate
// pins this invariant end-to-end.
//
// This page is the honest answer to *"what does AI Nutrition Coach know
// about me?"* — the same answer a self-hoster can verify on their
// own hardware.

## What is on by default

**Nothing.** No telemetry, no analytics, no error reporting, no
crash dumps, no usage beacons. The production `main.tsx` does not
invoke a network code path at startup. The gate
(`tools/check_telemetry_claims.mjs`, self-tested by
`tools/gates/telemetry.test.mjs`) is **import-based**: it parses every shipped file of
`apps/web/src` and `packages/core/src` with the TypeScript compiler API. A file cannot reach the
network without a transport (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`navigator.sendBeacon` — the word itself is a finding as an identifier, property name or string, however
it is reached through `Reflect`, an alias of `globalThis`, or `eval` —, a `<script>` injected at run time,
`import()` of a computed URL, a worker whose URL is not a same-origin literal, an image / iframe / link /
form element whose URL is not a same-origin literal, `window.open`, a network package, the capped-fetch
helper), so only an
explicit allow-list of adapter files may, and no analytics / crash-reporting SDK may be declared
in any `package.json` or imported anywhere.

## What is user-enabled

Four paths open a connection — each one only after the user explicitly
enables the feature. In the browser build the Content-Security-Policy enforces
this list (`connect-src 'self' https://world.openfoodfacts.org` plus the AI
endpoint you add via `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA`; the instance AI below is
same-origin, so it needs no CSP change; see
[`docs/self-host.md`](./self-host.md)):

- **The food catalog** (Open Food Facts barcode lookup,
  `world.openfoodfacts.org`; Stories 1.5 / 1.7). A user-initiated lookup on a
  scanned barcode, **disclosed in the app** before the first one (a one-time
  notice: *"Barcodes you scan are looked up on Open Food Facts (public, no
  account). Only the barcode is sent."*, with *OK* / *Don't look up online*; the
  answer is stored and changeable in Settings → Privacy, and nothing is sent until it
  is "OK"). The request is exactly `GET /api/v2/product/<barcode>?fields=…` with
  `Accept`; no `Referer`, no `Cookie`, no
  identifier (pinned by `apps/web/src/catalog/off-barcode-source.test.ts`; the browser smoke asserts
  it on the wire). Open Food Facts also sees the usual internet details any website
  sees (address, time, and on the web the page's origin). The catalog
  is offline-first; the local cache answers most calls without a
  round-trip. The remote call is a typed `CatalogResult` (never a
  raw exception crossing the port).

  The same catalog also reads the CIQUAL food table (`apps/web/src/catalog/ciqual-index.ts`, on the
  `check:telemetry` allow-list). That is not a third-party call: it is a plain `GET` of
  `catalog/ciqual-2025.json` from **your own origin**, served from the service worker's precache
  when offline. It carries no query, no identifier and no body, and no new host is involved. It
  happens on the first search; a failed load is retried with a growing delay (30 s, 60 s, ... up
  to 10 minutes), and a file that arrives unreadable is not downloaded again after the second try
  in a session.

- **The AI rung transport** (Epic 3). Only when the user has
  selected a non-noOp rung in Settings → Your AI. The default
  rung is `noOp`; the catalog's "no AI" path is complete and
  undegraded.

- **The instance-wide AI** (optional; Phase 4). Only when the person who runs the server set
  `AI_PROXY_*` in `infra/server.env`, and only for someone who chose "Provided by this
  server" in Settings → Your AI (the default for a NEW install while the server offers it, and
  still no photo moves without the consent dialog, which names this server and the provider
  behind it). Two **same-origin** requests, no third-party host from the browser:
  `GET /ai/config.json` (read when you unlock and when you open Your AI: whether the AI is
  on, the model name and a provider label; no key, no identifier, no body) and, per photo you
  agree to send, `POST /ai/v1/chat/completions` (the shrunk, metadata-free photo and the same
  fixed instruction as the other rungs). The browser sends **no Authorization header**: the
  container's nginx (it logs upstream failures at `crit` only, through a location-level `error_log`, so no client address
  is written) adds the operator's key, strips your cookies and headers, forces the
  configured model and passes the request to the provider. The key never reaches the browser,
  the bundle, the image or the logs (see `SECURITY.md`). `apps/web/src/ai/instance-config.ts`
  (the config read) is on the `check:telemetry` allow-list; the POST goes through the same
  provider as BYOK. Both are pinned by `apps/web/src/ai/instance-config.test.ts` and
  `apps/web/src/ai/instance-ai-rung.test.ts`. Unlike the next point, the server **does**
  see this traffic: it relays it, so who runs it decides what the provider is, and it keeps
  nothing but the usual access log (off by default, never a body or query).

- **The optional sync transport** (Story 4.3). Only when the user
  has configured a self-host relay. v1 ships the no-op
  `LocalOnlySyncAdapter` — it opens zero sockets; a real relay
  drops in behind the same `SyncAdapter` port in v1.1.

## Coaching

Three optional features send meal data to the AI you chose, only after the separate "AI coaching" yes in *Settings,
Your AI* (off by default, per destination): an AI-written coach note after a plate is logged, "Ask the coach" (a text
chat about the last seven days), and an optional weekly paragraph. They send food names, weights, nutrient totals, the
day or week so far, the optional profile and what you typed; never photos, never your passphrase, never your key to
this server. No analytics are added: the requests go to the same destination as photo recognition (your endpoint, or
this server's same-origin AI proxy) and nowhere else, and the conversation is kept in memory only. Exactly what is sent
per feature is in [`docs/ai-tiers.md`](./ai-tiers.md), "Coaching".

## Barcode scanning

Scanning is decoded entirely on your device: the browser's native `BarcodeDetector` where it
exists, otherwise the self-hosted zxing-wasm decoder served from your own origin. No camera
frame is ever sent anywhere, and no third-party scanning library or SDK is bundled. Only the
decoded barcode digits go to Open Food Facts, and only after you said yes to the one-time
notice.

## Logs

- **The app** writes nothing to any log that could carry what you logged:
  `tools/check_log_hygiene.mjs` (run by `pnpm verify`)
  fails on any `console.*` tear-off and on any `console.*` call that
  interpolates or forwards a value, unless the line is marked
  `// log-hygiene: content-free` and interpolates only allow-listed identifiers
  (row / plate / note ids, steps, counts, fixed reasons).
- **The self-host container** logs no request by default
  (`AI_NUTRITION_COACH_ACCESS_LOG=off`). `on` writes time, method and resolved file (app-shell requests log as `/index.html`) only, with the
  client address truncated and **no User-Agent, Referer or query string**; `full`
  adds the whole address. See [`docs/self-host.md`](./self-host.md#logs). A reverse
  proxy in front (Traefik, Caddy) has its own log: see [`docs/pwa.md`](./pwa.md#logs-behind-traefik).

## What is not in v1

- Crash reporting, error monitoring, or any third-party SDK.
- Push notifications or re-engagement hooks (FR-15 ban list).
- A "send usage data" opt-in affordance — there is no opt-in
  because there is no telemetry to opt into.

## Self-host

The self-host build ([`docs/self-host.md`](./self-host.md)) is the strongest
version of the posture:

- The **server needs no outbound network**: `scripts/smoke_self_host.sh` runs
  the container on a docker `--internal` network (no route out) and asserts it
  still boots and serves, that an outbound request from it fails, and that its
  rendered nginx config contains no `proxy_pass` / `resolver`. (That shows the
  server is self-contained; it is not a packet capture.) The one exception is the optional
  instance-wide AI proxy above: with it switched on (`AI_PROXY_ENABLED=1` and a key) the server
  does need outbound HTTPS to the provider, and the smoke test checks both states.
- The **bundle loads nothing from a third party**: fonts (Barlow) and the wasm assets
  (the SQLite3 Multiple Ciphers engine and the zxing-wasm decoder) are served from your own
  origin, and the barcode fallback decoder is served from the same origin instead of a CDN.
  `tools/check_no_external_hosts.sh` scans the built bundle and fails on any host outside a
  short, justified allow-list: Open Food Facts as the one network host, and inert
  documentation or namespace strings that are never fetched.
- Your data never reaches the server: it is encrypted in your browser. (The one thing that passes
  through it is a photo you choose to send with the optional instance-wide AI, relayed and not stored.)
- Put TLS in front for other devices (`bin/ai-nutrition-coach up --tls`); AI Nutrition Coach
  itself does not phone home.

## How to verify

```sh
pnpm check:telemetry        # import-based source gate
pnpm verify                 # everything, incl. the built-bundle host scan
bash scripts/smoke_self_host.sh   # container: headers, CSP, non-root, no egress
```

`check:telemetry` parses the source tree with the TypeScript compiler API, asserts only the
allow-listed files use a network transport (and that each allow-list entry still exists and still
needs what it holds), rejects telemetry SDKs by name prefix (`package.json` files and the resolved
`pnpm-lock.yaml`) and checks that the user-facing docs are anchored to the gate. Its self-test
(`tools/gates/telemetry.test.mjs`) proves it fails on violating fixtures. It runs in `pnpm verify`
and in CI, so a regression fails the build.

## Cross-references

- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface; same
  privacy posture.
- [`docs/self-host.md`](./self-host.md) — the one-command self-host
  install.
- [`docs/your-data.md`](./your-data.md) — the protection posture
  in the browser.
- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 / FR-15).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  (Story 4.6 / FR-12).
