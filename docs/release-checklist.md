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
