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

Every promise below names the test that proves it (`Proof`).
`melos run check:release-posture` fails if a row has no proof, if the named
file does not exist, or if it contains no test.

| Promise | Where it lives | Proof |
| ------- | -------------- | ----- |
| Local encrypted store (ChaCha20-Poly1305, mobile): the file is not plaintext SQLite and a wrong key cannot open it | AD-8 — [`docs/your-data.md`](./docs/your-data.md) | `packages/integrations/test/encrypted_store_integration_test.dart` |
| Web encrypted store: the create / unlock / lock / erase logic is tested in the Dart VM over real sqlite3mc encryption (wrong passphrase cannot open it, key zeroed on lock). The browser adapters (IndexedDB backend, WebCrypto KDF, `localStorage`) are verified **manually only**, per ADR-0002; Safari / Firefox are untested | AD-8, ADR-0002 — [`docs/your-data.md`](./docs/your-data.md) | `packages/integrations/test/web_store_controller_test.dart` |
| Exporter: CSV/JSON offline, no account | AD-9 | `packages/integrations/test/csv_exporter_test.dart`, `packages/integrations/test/json_exporter_test.dart` |
| Sync is a seam only: in-memory outbox, no transport yet; the UI says "on this device", never "synced" | AD-6 | `packages/integrations/test/in_memory_sync_queue_test.dart`, `apps/client/test/widgets/status_chip_test.dart` |
| Photos sent to your AI endpoint are metadata-stripped, consent is per host, the key is bound to its host | N1 — [`docs/ai-tiers.md`](./docs/ai-tiers.md) | `packages/integrations/test/photo_sanitizer_test.dart`, `packages/integrations/test/byok_ai_rung_test.dart` |
| One-command self-host: hardened static container, strict CSP, no outbound need | FR-11 — [`docs/self-host.md`](./docs/self-host.md) | `packages/integrations/test/self_host_config_test.dart` |
| Installable, offline-capable web app: our own service worker precaches a checksummed manifest, never intercepts cross-origin or non-GET requests, never caches at run time, and waits for you to tap *Reload* before a new version takes over. Not proven in an automated gate on every change: the real-browser behaviour (WebKit + Chromium) is the opt-in `scripts/webkit_smoke.sh` | ADR-0003 — [`docs/pwa.md`](./docs/pwa.md) | `packages/integrations/test/precache_manifest_test.dart`, `apps/client/test/widgets/update_banner_test.dart` |
| The AI key and settings on web live inside the encrypted store (schema v5), never in `localStorage`; the last-export date and the quiet export suggestion are encrypted too | ADR-0003 — [`docs/ai-tiers.md`](./docs/ai-tiers.md), [`docs/your-data.md`](./docs/your-data.md) | `packages/integrations/test/key_value_store_test.dart`, `apps/client/test/screens/your_data_pwa_test.dart` |
| Zero telemetry by default; only user-enabled network paths | FR-12 — [`docs/telemetry-posture.md`](./docs/telemetry-posture.md) | `packages/integrations/test/no_telemetry_test.dart` |
| No-Dark-Patterns Standard (no streaks, badges, countdowns, spinners, red) | FR-15 — [`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md) | `packages/integrations/test/no_dark_patterns_test.dart` |
| Every screen meets tap-target, label and contrast guidelines | NFR-7 — [`docs/accessibility.md`](./docs/accessibility.md) | `apps/client/test/a11y/screen_guidelines_test.dart` |

What is *not* proven yet (the browser adapters are verified by the opt-in browser smoke, not on every
change; CI has never run without a remote; iOS has not been built; Firefox is untested) is listed in
`_bmad-output/review/security-and-quality-review-2026-10-01.md`.

## Quickstart

OpenPlate's primary way to run is as an **installable, offline-capable web app**
(a PWA): deploy one container, open its HTTPS address on each phone, add it to the
home screen. Everything about building, deploying (including behind Traefik),
installing and updating is in [`docs/pwa.md`](./docs/pwa.md).

### Self-host

```sh
bin/openplate up            # builds + serves http://localhost:8080 (loopback only)
bin/openplate up --tls      # + automatic HTTPS for $OPENPLATE_DOMAIN (Caddy), for other devices
OPENPLATE_DOMAIN=plate.example.com bin/openplate up --traefik   # behind YOUR Traefik: no published port
bin/openplate down
```

Open `http://localhost:8080/`; choose a passphrase to create your store. The
container is a static server and holds no data: your history is encrypted in
*your browser*, and the in-app export is the backup path. Plain HTTP over a
network is unsupported (the web store needs https or localhost). See
[`docs/self-host.md`](./docs/self-host.md) and [`docs/pwa.md`](./docs/pwa.md).

### Build from source

```sh
melos bootstrap   # or: scripts/flutter_docker.sh melos bootstrap (pinned Flutter 3.44.0)
bash scripts/fetch_web_sqlite.sh   # the web store's sqlite3mc-3.5.1.wasm, SHA-256 verified (not committed)
bash scripts/fetch_web_zxing.sh    # the self-hosted barcode decoder (Safari/iOS), SHA-256 verified (not committed)
cd apps/client
flutter build web --release --pwa-strategy=none --no-web-resources-cdn --dart-define=OPENPLATE_BUILD=selfhost
cd ../.. && dart run tools/generate_precache_manifest.dart apps/client/build/web   # sw.js + precache manifest
```

(`melos run build:web` does all of it, and the secrets / third-party-host scans.)

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
infra/                   Docker + nginx (+ Caddy TLS profile, Traefik compose) self-host definition
docs/                    user-facing docs (pwa, your-data, self-host, ai-tiers,
                         telemetry-posture, no-dark-patterns-standard)
_bmad-output/            planning / implementation artifacts, NOT product docs
                         (see _bmad-output/README.md)
tools/                   repo-level gates (check_telemetry_claims,
                         check_release_posture, check_accessibility_floor,
                         check_i18n_literals, ...)
pubspec.yaml             workspace + the `melos:` scripts block (single source)
scripts/                 flutter_docker.sh (pinned toolchain), smoke, local web
```

## License

MIT — see [`LICENSE`](./LICENSE).
