// Story 4.5 — the user-facing privacy posture.
//
// AI Nutrition Coach ships with zero telemetry by default. The privacy
// posture is architecture, not policy: the only paths that open a
// socket are user-enabled (the catalog, the AI rung transport, the
// optional sync transport). The `melos run check:telemetry` gate
// pins this invariant end-to-end.
//
// This page is the honest answer to *"what does AI Nutrition Coach know
// about me?"* — the same answer a self-hoster can verify on their
// own hardware.

## What is on by default

**Nothing.** No telemetry, no analytics, no error reporting, no
crash dumps, no usage beacons. The production `main.dart` does not
invoke a network code path at startup. The gate
(`tools/check_telemetry_claims.dart`, also run by the `no_telemetry` unit
test) is **import-based**: a Dart file cannot reach the network without
importing a transport (`package:dio`, `package:http`, `dart:io` sockets,
`package:web` `fetch`/XHR/WebSocket, ...), so only an explicit allow-list of
adapter files may, and no analytics / crash-reporting SDK may be declared or
imported anywhere.

## What is user-enabled

Three paths open a connection — each one only after the user explicitly
enables the feature. In the browser build the Content-Security-Policy enforces
this list (`connect-src 'self' https://world.openfoodfacts.org` plus the AI
endpoint you add via `OPENPLATE_CONNECT_SRC_EXTRA`; see
[`docs/self-host.md`](./self-host.md)):

- **The food catalog** (Open Food Facts barcode lookup,
  `world.openfoodfacts.org`; Stories 1.5 / 1.7). A user-initiated lookup on a
  scanned barcode. The catalog
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
- The **bundle loads nothing from a third party**: CanvasKit and fonts are
  served from your own origin (`--no-web-resources-cdn`, bundled Roboto, local
  glyph-fallback path), and the web barcode scanner is pinned to the browser's
  native detector instead of a CDN-hosted fallback (browsers without that API
  — Firefox, desktop Windows/Linux, Safari by default — use manual entry).
  `tools/check_no_external_hosts.sh` scans the built bundle and fails on any
  host outside a short, justified allow-list (`melos run check:hosts`): inert doc links by host, and
  the four known engine/scanner default CDN URLs only as exact strings with exact counts.
- Your data never reaches the server: it is encrypted in your browser.
- Put TLS in front for other devices (`bin/openplate up --tls`); OpenPlate
  itself does not phone home.

## How to verify

```sh
melos run check:telemetry   # import-based source gate
melos run check:hosts       # built-bundle third-party host scan (after build:web)
bash scripts/smoke_self_host.sh   # container: headers, CSP, non-root, no egress
```

`check:telemetry` parses the source tree with the analyzer (conditional
imports, re-exports, `part` files and `Image.network` included), asserts only the allow-listed adapters
import a network transport, rejects telemetry SDKs by name prefix (imports and pubspecs) and
checks that the user-facing docs are anchored to the gate. It runs in the unit
tests and in CI, so a regression fails the build.

## Cross-references

- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface; same
  privacy posture.
- [`docs/self-host.md`](./self-host.md) — the one-command self-host
  install.
- [`docs/your-data.md`](./your-data.md) — the protection posture
  on web vs mobile.
- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 / FR-15).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  (Story 4.6 / FR-12).
