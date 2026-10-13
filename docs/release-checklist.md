# Release checklist — AI Nutrition Coach v1

The release pipeline is intentionally lightweight. Every tagged
release runs this checklist end-to-end; a tag cannot ship until
the durable sign-offs are recorded. The CI workflow
`.github/workflows/release-gate.yml` automates the gating; the
named reviewer records the human sign-off.

## Gate A — Build

- [ ] `melos bootstrap` resolves every package under
  `apps/*` + `packages/*` without warnings.
- [ ] `melos run analyze` is green across the workspace.
- [ ] `melos run format:check` is clean.
- [ ] `melos run test` is green across the workspace. The
  `packages/domain_core` AD-1 purity test passes; the no-telemetry
  test (`packages/integrations/test/no_telemetry_test.dart`) passes.

## Gate B — Self-host

- [ ] `melos run smoke:self-host` is green (FR-11 / NFR9).
  - Image builds in under 5 minutes on a standard CI runner.
  - The app shell is served on `http://localhost:<port>/` (loopback by
    default); `sqlite3mc-<ver>.wasm` is `application/wasm`.
  - `nginxinc/nginx-unprivileged` and `caddy` are digest-pinned.
  - CSP + security headers are present on html, js and wasm responses; no
    server version is disclosed.
  - The container is non-root, read-only, `cap_drop: ALL`,
    `no-new-privileges`.
  - It boots and serves on a docker `--internal` network (no egress).
- [ ] `melos run check:hosts` is green: the built web bundle references no
  third-party host (CanvasKit + fonts are self-hosted).
- [ ] `docs/self-host.md` still states that plain HTTP over a network is
  unsupported and that data lives in the browser (export = backup).

## Gate B2 — PWA (ADR-0003, [`docs/pwa.md`](./pwa.md))

- [ ] `melos run build:web` (inside `scripts/verify.sh`) generated `sw.js` and
  `precache-manifest.json`; the bundle contains the self-hosted zxing decoder
  and the host scan still passes.
- [ ] **Service-worker update test.** Against the release image: install, then change the build id
  (`AI_NUTRITION_COACH_BUILD_ID=...` + `melos run pwa:manifest`, or a rebuild); the old version keeps running,
  the calm "A new version is ready" line appears, *Reload* reloads exactly once, old caches are gone,
  the data is still there after unlocking. `scripts/webkit_smoke.sh` automates this in Chromium and WebKit.
- [ ] **WebKit smoke.** `scripts/webkit_smoke.sh` is green (WebKit and Chromium): create → log → reload →
  unlock → offline reload → update. Record any browser-specific finding in `docs/pwa.md`.
- [ ] **Traefik config.** `docker compose -f infra/docker-compose.traefik.yml config` (with `AI_NUTRITION_COACH_DOMAIN`
  set) renders with **no published port** and the expected labels; the overlays render;
  `bin/ai-nutrition-coach up --traefik` refuses hostile values (exit 42). `melos run smoke:self-host` asserts all of it.
- [ ] `sw.js`, `precache-manifest.json` and `manifest.json` are `Cache-Control: no-cache`
  (asserted by the self-host smoke).
- [ ] **Real iPhone with VoiceOver ON (blocker if it fails).** Create a passphrase, then log a plate through
  *Type or talk* and type in the food search. Automated WebKit shows that text typed while Flutter's accessibility
  semantics are on never reaches the app; whether VoiceOver on iOS Safari is affected is unverified. A failure is an
  **accessibility release blocker**: file it upstream (flutter/flutter) with the repro and do not ship the web app to
  screen-reader users until fixed.
- [ ] **Kill switch rehearsal.** Start the container with `AI_NUTRITION_COACH_SW_KILL=1` and confirm an installed app reloads
  once and then loads from the network (docs/pwa.md "If an update goes wrong").
- [ ] On a real iPhone and a real Android phone: install from HTTPS, open offline, log a plate, export.
  (Not automated; the maintainer records the result.)

## Gate C — Release posture (Story 4.6 / FR-12)

- [ ] `melos run check:release-posture` is green. It also asserts that every
  row of the README trust table names a proof test that exists and contains a
  test, that every screen has an accessibility guideline test
  (`check:a11y`), and that no user-facing string literal bypasses the ARB
  files (`check:i18n`).
- [ ] `LICENSE` (MIT) is at HEAD.
- [ ] `CONTRIBUTING.md` is at HEAD and documents the build / test /
  smoke commands.
- [ ] `docs/no-dark-patterns-standard.md` is at HEAD and enumerates
  the banned-everywhere list.
- [ ] The named-reviewer sign-off for the No-Dark-Patterns gate
  is recorded in the PR thread + the release artefact.

## Gate P — Privacy (privacy audit 2026-10-12, [`docs/telemetry-posture.md`](./telemetry-posture.md))

- [ ] `melos run check:release-posture` is green, including `tools/check_log_hygiene.dart`
  (no `print(`; every interpolating `debugPrint` / `log` call reviewed as content-free).
- [ ] **Project URL.** `AI_NUTRITION_COACH_BUILD=release [AI_NUTRITION_COACH_PROJECT_URL=<override>] dart run tools/check_release_posture.dart --project-url-only`
  is green (the default is the project repository, so this only fails for an empty or `.invalid` override; set the URL for a fork). Build mobile
  releases with the same `--dart-define=AI_NUTRITION_COACH_PROJECT_URL=…`; the container with
  `--build-arg AI_NUTRITION_COACH_PROJECT_URL=… --build-arg AI_NUTRITION_COACH_RELEASE=1` (the build then enforces the rule itself;
  `.github/workflows/release-gate.yml` does this from the repository variable `AI_NUTRITION_COACH_PROJECT_URL`).
- [ ] **Android ML Kit capture (one time, unverified until done).** Build the APK, run it on a device or
  emulator behind a capturing proxy (or `tcpdump` on the host), scan one barcode, and record whether anything
  other than the Open Food Facts lookup leaves the device (in particular Google / Firebase hosts such as
  `firebaselogging-pa.googleapis.com`). Put the result in `docs/telemetry-posture.md` ("Android barcode
  scanning"); if metrics leave, either disclose it on the privacy page or switch to the unbundled model with the
  datatransport opt-out / a pure-Dart decoder before shipping to Android users.
- [ ] **Consent copy.** Open Your AI with a key set, take a photo: the dialog says what is sent, what the host also
  sees, that it may keep requests, what is not sent, and links to the in-app privacy page. **Ask before every photo
  upload** is on for a fresh install.
- [ ] **First-run notices.** A fresh install shows *About this app* once (web: before the passphrase screen) and the
  Open Food Facts notice at the first scan; neither returns after being answered; *Settings → Privacy* opens the page
  and its barcode switch works.
- [ ] **Delete a plate.** Press and hold a plate, confirm: the plate and its coach note are gone from the Day Board;
  with a screen reader the "Remove this plate" action is offered.
- [ ] **No leftover photos (mobile).** After a photo recognition, the app's cache directory holds no `image_picker*` /
  `scaled_*` file; *Erase all local data* leaves none.
- [ ] **Self-host logs.** `bash scripts/smoke_self_host.sh` is green (it asserts `AI_NUTRITION_COACH_ACCESS_LOG` off by default
  and, with `on`, no User-Agent / Referer / query string and a truncated address). If you run Traefik, its access log is
  off or anonymised and has a retention ([`docs/pwa.md`](./pwa.md#logs-behind-traefik)).
- [ ] **Browser smoke.** `scripts/webkit_smoke.sh` is green: the Open Food Facts request (Chromium) and the export
  (both browsers) leave nothing else off-origin.
- [ ] Known and accepted for v1, stated on the privacy page: shared devices see one history (PV6); exports cover
  plates only and there is no import (PV10).

## Gate D — Telemetry (Story 4.5 / FR-12)

- [ ] `melos run check:telemetry` is green (import-based).
- [ ] Only the allow-listed adapters import a network transport; no
  telemetry SDK is declared or imported.
- [ ] The production `main.dart` imports no network transport.
- [ ] Every "no telemetry" claim in `docs/` is anchored to the
  gate.

## Gate F — Mobile signing and store metadata

- [ ] **Android signing.** Release builds are signed only with a key from
  `apps/client/android/key.properties` (gitignored, as are `*.jks` and
  `*.keystore`). Create it with `storeFile` (absolute path), `storePassword`,
  `keyAlias`, `keyPassword`. Without it `flutter build apk --release` /
  `appbundle --release` fails with a clear message; it never falls back to the
  debug key. Keep the keystore and passwords in the maintainer's password
  manager, never in the repo or CI logs.
- [ ] The release APK/AAB passes `bash tools/check_no_secrets_in_build.sh`.
- [ ] **iOS usage strings and permission_handler.** `ios/Runner/Info.plist`
  declares `NSCameraUsageDescription` (barcode scan + photo capture). The photo
  library and microphone are not used, so they are deliberately not declared.
  With Flutter 3.44's default Swift Package Manager integration, the Info.plist
  key is the real switch: `permission_handler_apple`'s `Package.swift` enables
  the camera code when it finds that key. The `PERMISSION_CAMERA=1` macro in
  `ios/Podfile` only applies under CocoaPods and is kept as a fallback.
  `Package.swift` cannot locate the Info.plist when archiving from Xcode.app,
  so build release archives with `flutter build ipa`, or, if archiving from
  Xcode, set `PERMISSION_HANDLER_INFO_PLIST` to the absolute path of
  `ios/Runner/Info.plist` (for example via `launchctl setenv`) and clear
  DerivedData. Set `PERMISSION_HANDLER_VERBOSE=1` to see what it enabled.
  Verify on a device that the camera prompt appears in the archived build.
- [ ] **Export compliance (not decided here).** `Info.plist` deliberately does
  NOT set `ITSAppUsesNonExemptEncryption`; App Store Connect will ask at
  upload and the maintainer answers. Facts for that answer: the iOS app
  bundles its own standard cryptography (SQLite3MultipleCiphers,
  ChaCha20-Poly1305, with PBKDF2 key derivation on the web build) for
  data at rest, in addition to the operating system's HTTPS. The likely
  answer to Apple's questionnaire is therefore "yes, standard algorithms", and
  the likely US classification is mass-market 5D992.c. France may require a
  declaration to ANSSI, uploaded in App Store Connect. Whether a Note 4
  exemption can be argued is a legal call. This is not legal advice: the
  maintainer must confirm the answers before the first App Store submission.
- [ ] `ios/Podfile` still matches Flutter's template for the pinned version
  (regenerate with `flutter create` into a scratch dir and diff when the Flutter
  pin changes). iOS cannot be built in the project's Docker toolchain; build
  and run on a Mac before shipping.

## Gate E — Tag

- [ ] The version tag (`vX.Y.Z`) is created from `main`.
- [ ] The release notes enumerate the closed stories (Epic 1-5).
- [ ] The CI workflow `.github/workflows/release-gate.yml` is
  green on the tag commit.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Gate C).
- [`docs/self-host.md`](./self-host.md) — the self-host affordance
  (Gate B).
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture (Gate D).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  + the gate frequency.
- [`LICENSE`](../LICENSE) — the MIT license text (Gate C).
