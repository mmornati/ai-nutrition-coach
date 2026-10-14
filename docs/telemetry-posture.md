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
`navigator.sendBeacon`, a `<script>` injected at run time, `import()` of a computed URL, a worker
whose URL is not a same-origin literal, a network package, the capped-fetch helper), so only an
explicit allow-list of adapter files may, and no analytics / crash-reporting SDK may be declared
in any `package.json` or imported anywhere.

## What is user-enabled

Three paths open a connection — each one only after the user explicitly
enables the feature. In the browser build the Content-Security-Policy enforces
this list (`connect-src 'self' https://world.openfoodfacts.org` plus the AI
endpoint you add via `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA`; see
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

- **The AI rung transport** (Epic 3). Only when the user has
  selected a non-noOp rung in Settings → Your AI. The default
  rung is `noOp`; the catalog's "no AI" path is complete and
  undegraded.

- **The optional sync transport** (Story 4.3). Only when the user
  has configured a self-host relay. v1 ships the no-op
  `LocalOnlySyncAdapter` — it opens zero sockets; a real relay
  drops in behind the same `SyncAdapter` port in v1.1.

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
  server is self-contained; it is not a packet capture.)
- The **bundle loads nothing from a third party**: fonts (Barlow) and the wasm assets
  (the SQLite3 Multiple Ciphers engine and the zxing-wasm decoder) are served from your own
  origin, and the barcode fallback decoder is served from the same origin instead of a CDN.
  `tools/check_no_external_hosts.sh` scans the built bundle and fails on any host outside a
  short, justified allow-list: Open Food Facts as the one network host, and inert
  documentation or namespace strings that are never fetched.
- Your data never reaches the server: it is encrypted in your browser.
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
