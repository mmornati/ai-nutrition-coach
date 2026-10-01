# AI Nutrition Coach

AI Nutrition Coach is a quiet, offline-first plate-logging app: log what you
ate via photo, barcode, or voice/typing, and it lands on your Day
Board as one honest row per meal. No streaks, no scores, no
false-exact calories.

The project is open-source (MIT — see [`LICENSE`](./LICENSE)) and
self-hostable with one command. The trust mechanic is architecture,
not policy: a local encrypted store, an optional exporter, an
optional sync to your own infrastructure, zero telemetry by default.

## Trust posture

| Promise                                    | Where it lives                                            |
| ------------------------------------------ | --------------------------------------------------------- |
| Local encrypted store (ChaCha20-Poly1305, mobile) | Story 1.2 / AD-8                                          |
| Web session-sealed store (PBKDF2 + WASM)   | Story 4.1 / AD-8 — [`docs/your-data.md`](./docs/your-data.md) |
| Exporter: CSV/JSON offline, no account     | Story 4.2 / AD-9                                          |
| Durable outbox sync to user-controlled infra | Story 4.3 / AD-6 (in-memory v1; drift-table is 4.3.1)   |
| One-command self-host install              | Story 4.4 / FR-11 — [`docs/self-host.md`](./docs/self-host.md) |
| Zero telemetry by default                  | Story 4.5 / FR-12 — [`docs/telemetry-posture.md`](./docs/telemetry-posture.md) |
| No-Dark-Patterns Standard                  | Story 4.6 / FR-15 — [`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md) |

## Quickstart

### Self-host

```sh
bin/ai-nutrition-coach up                 # zero-config; data lives and dies with the container
bin/ai-nutrition-coach up --with-persist  # docker compose with a bind-mounted volume
```

Open `http://localhost/`. The lock screen is the first paint; enter a
passphrase to unlock your store. See [`docs/self-host.md`](./docs/self-host.md).

### Build from source

```sh
melos bootstrap   # or: scripts/flutter_docker.sh melos bootstrap (pinned Flutter 3.44.0)
cd apps/client
flutter build web --release --pwa-strategy=none --dart-define=AI_NUTRITION_COACH_BUILD=selfhost
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the build / test /
smoke commands, the gate frequency, and the contribution
expectations. The release posture is enforced by
[`docs/release-checklist.md`](./docs/release-checklist.md).

## Where things live

```
apps/client/             one Flutter responsive codebase (iOS + Android + web)
packages/domain_core/    pure-Dart domain (no Flutter/SQLite/HTTP imports)
packages/integrations/   adapters (drift store, OFF/USDA, AI rungs, sync, export)
infra/                   Docker + nginx self-host definition
docs/                    user-facing docs (your-data, self-host, ai-tiers,
                         telemetry-posture, no-dark-patterns-standard)
_bmad-output/            implementation artifacts (specs, sprint-status, loop-status)
tools/                   repo-level scripts (check_telemetry_claims,
                         check_release_posture)
pubspec.yaml             workspace + the `melos:` scripts block (single source)
scripts/                 flutter_docker.sh (pinned toolchain), smoke, local web
```

## License

MIT — see [`LICENSE`](./LICENSE).
