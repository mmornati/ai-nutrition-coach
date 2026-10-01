# AI Nutrition Coach — self-host (Story 4.4 / FR-11 / AD-2 / NFR9)

AI Nutrition Coach is yours to run. The self-host build is the same `apps/client`
Flutter web build the mobile apps ship — one responsive codebase for
all three targets (AD-2). The default install is one command on any
Docker host.

## The one command

```sh
bin/ai-nutrition-coach up
```

That's it. The script:

1. Builds the image (`ai-nutrition-coach:dev`) from the multi-stage
   `infra/Dockerfile`.
2. Starts the container on `http://localhost/`.
3. Prints a single calm line: `ai-nutrition-coach is up at http://localhost/`.

Open the URL. The lock screen is the first paint on web
([`docs/your-data.md`](./your-data.md) explains the protection
posture). Enter a passphrase to unlock your store.

## The persistent-data path

The default `bin/ai-nutrition-coach up` runs the container with no
persistent volume — the sqlite3mc database lives and dies with the
container. If you want your history to survive container restarts:

```sh
bin/ai-nutrition-coach up --with-persist
```

The script writes the bind mount for you. The database lives at
`/data/ai_nutrition_coach_v1.sqlite` inside the container; on the host the
volume is named `ai-nutrition-coach-data` and is managed by docker's
standard volume path.

## Verifying the build

The CI smoke test (`bin/ai-nutrition-coach` is exercised end-to-end on every
PR) asserts:

- The image builds in under 5 minutes on a standard CI runner
  (NFR9 / FR-11 acceptance).
- `curl http://localhost/` returns `200` and the lock-screen HTML.
- The `nginx:alpine` base is digest-pinned (`sha256:4a73073bd…`),
  so the build is byte-stable across rebuilds (NFR9).
- The container's network namespace is quiet — no outbound calls
  from the running image (FR-12 / NFR4).

Run the smoke test locally:

```sh
bash scripts/smoke_self_host.sh
```

## Where things live

```
infra/Dockerfile          multi-stage: cirruslabs/flutter:3.44.0 (digest-pinned) → nginx:alpine
infra/nginx.conf          SPA-friendly config (try_files + security headers)
infra/docker-compose.yml  opt-in persistent-data stack (Story 4.4)
bin/ai-nutrition-coach             the one-command affordance
scripts/smoke_self_host.sh CI / local smoke test
docs/self-host.md         this file
.github/workflows/        self-host-smoke.yml + release-gate.yml (Stories 4.4 / 4.6)
```

## What's NOT in v1

- **TLS termination.** The container serves plain HTTP on port 80.
  Put nginx / caddy / traefik in front of the container. A v1.1
  follow-up adds a self-signed TLS option (`bin/ai-nutrition-coach up
  --with-tls`) so the self-host install is one step closer to
  zero-config.
- **The web store's WASM binding.** Story 4.1 ships the
  `WasmEncryptedStore` + the `WebSessionKey` PBKDF2 plumbing. The
  actual `sqlite3.wasm` binary + the drift `WebSqlCipher` binding
  land in v1.1 alongside TLS.
- **A relay transport.** Story 4.3 ships the durable outbox +
  the no-op `LocalOnlySyncAdapter`. A real self-host relay (OQ-1)
  drops in behind the same `SyncAdapter` port in v1.1.

## Telemetry

The self-host image ships with no telemetry by default (FR-12): the
served bundle makes no analytics or tracking calls, and the only
network paths are the ones the user enables (catalog lookups, an AI
rung they configure). `melos run check:telemetry` pins this claim;
see [`docs/telemetry-posture.md`](./telemetry-posture.md).

## Cross-references

- [`docs/your-data.md`](./your-data.md) — the protection posture on
  web vs mobile (Story 4.1 / AD-8).
- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface; same
  privacy posture (Epic 3).
- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 / FR-15).
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture on the network surface (Story 4.5 / FR-12).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  (Story 4.6 / FR-12).
