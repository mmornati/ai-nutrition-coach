// Story 4.5 — the user-facing privacy posture.
//
// OpenPlate ships with zero telemetry by default. The privacy
// posture is architecture, not policy: the only paths that open a
// socket are user-enabled (the catalog, the AI rung transport, the
// optional sync transport). The `melos run check:telemetry` gate
// pins this invariant end-to-end.
//
// This page is the honest answer to *"what does OpenPlate know
// about me?"* — the same answer a self-hoster can verify on their
// own hardware.

## What is on by default

**Nothing.** No telemetry, no analytics, no error reporting, no
crash dumps, no usage beacons. The production `main.dart` does not
invoke a network code path at startup. The `dart test`/`flutter
test` suite includes a static + behavioural test (`tools/check_telemetry_claims.dart`)
that fails the build if any non-sanctioned path opens a socket.

## What is user-enabled

Three paths open a socket — each one only after the user explicitly
enables the feature:

- **The food catalog** (OFF / USDA HTTP, Stories 1.5 / 1.7). A
  user-initiated lookup on a barcode or a typed query. The catalog
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

The self-host build ([`docs/self-host.md`](./self-host.md)) is the
strongest version of the posture. The container's network namespace
is quiet by default — the smoke test
(`scripts/smoke_self_host.sh`) inspects the running image and
asserts no outbound network calls are opened. Put nginx / caddy /
traefik in front of the container for TLS; OpenPlate itself does
not phone home.

## How to verify

```sh
melos run check:telemetry
```

The script (`tools/check_telemetry_claims.dart`) walks the source
tree, asserts the only socket-opening paths are the sanctioned
list, and asserts the user-facing docs match the actual code. The
check is part of `melos run test` so a regression fails the build.

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
