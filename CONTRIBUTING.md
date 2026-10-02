# Contributing to AI Nutrition Coach

AI Nutrition Coach is a quiet, offline-first plate-logging app: log what you
ate via photo, barcode, or voice/typing, and it lands on your Day
Board as one honest row per meal. No streaks, no scores, no
false-exact calories. The project is open-source (MIT — see
[`LICENSE`](./LICENSE)) and the no-pressure UX promise is
enforceable through a named-reviewer QA gate (FR-15 / AD-7 — see
[`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md)).

This page is the contributor path. It documents the build, the
test, and the smoke commands, plus the contribution expectations
the release pipeline enforces.

## Build

```sh
melos bootstrap
```

Resolves `apps/client`, `packages/domain_core`, and
`packages/integrations` under Dart pub workspaces and links the
path-dependencies between them. Requires:

| Tool         | Version       |
| ------------ | ------------- |
| Flutter      | 3.44.0 stable (image `ghcr.io/cirruslabs/flutter:3.44.0`, digest-pinned) |
| Dart SDK     | ^3.12.0 (bundled with Flutter 3.44.0) |
| melos        | 8.2.2         |
| Docker       | 24+ (self-host) |

No Flutter SDK on your machine? Run any command inside the pinned toolchain
image with the helper (it mounts the repo and keeps a persistent pub-cache):

```sh
scripts/flutter_docker.sh melos bootstrap
scripts/flutter_docker.sh melos run analyze
scripts/flutter_docker.sh bash -lc 'melos run test'
```

The toolchain version/digest is pinned in one logical place and mirrored in
`scripts/flutter_docker.sh`, `infra/Dockerfile`, `.github/workflows/*`, and
this page — bump them together. Melos 8 reads its scripts from the `melos:`
block of the root `pubspec.yaml` (there is no `melos.yaml`).

## Verify (the one gate)

```sh
scripts/verify.sh            # format:check + analyze (infos fatal) + test + DST + release-posture + web build
scripts/verify.sh --with-apk # also the debug APK
```

Optional pre-commit guard: `ln -sf ../../scripts/git-hooks/pre-commit .git/hooks/pre-commit`

## Test

```sh
melos run test
```

The standard suite walks every package under `apps/*` and
`packages/*`, using the right runner for each: `dart test` for the pure-Dart
`domain_core`, `flutter test` for `integrations` (a Flutter package — it links
`flutter_secure_storage` / `path_provider`) and `apps/client`. The `packages/domain_core` AD-1 grep test pins the
pure-Dart invariant — `packages/domain_core/lib/**.dart` is free
of `package:flutter*`, `package:drift*`, `package:dio`,
`package:mobile_scanner*`, and `package:flutter_secure_storage*`.

## Static analysis

```sh
melos run analyze
```

Runs `flutter analyze` on Flutter packages and `dart analyze` on
the pure-Dart packages. CI runs the same.

## Self-host smoke

```sh
melos run smoke:self-host
```

End-to-end test of the `bin/ai-nutrition-coach up` flow — builds the
multi-stage `infra/Dockerfile`, starts the container, curls the
app shell, asserts the base images are digest-pinned, the
security headers/CSP on html/js/wasm, a non-root read-only container,
that it serves on a network with no egress, and that the bundle has
no third-party hosts. Budget is `<5 min` on a standard CI runner (NFR9 / FR-11).

## Release posture gates

Three gates run on every PR and every tag:

| Gate                          | What it asserts                                          |
| ----------------------------- | -------------------------------------------------------- |
| `melos run analyze`           | No analyzer regressions.                                 |
| `melos run test`              | All unit tests + the AD-1 purity test + the no-telemetry test. |
| `melos run test:dst`          | The calendar-day / Day Board tests re-run under `TZ=Europe/Paris`, where the DST assertions do not skip. |
| `melos run smoke:self-host`   | The self-host build serves the lock screen in <5 min.    |
| `melos run check:telemetry`   | Import-based: only allow-listed adapters import a network transport; no telemetry SDKs; doc claims are anchored. |
| `melos run check:hosts`       | The built web bundle references no third-party host.     |
| `melos run check:release-posture` | `LICENSE` + `CONTRIBUTING.md` + `docs/no-dark-patterns-standard.md` are at HEAD; every row of the README trust table names a proof test that exists and contains a test; the adults-only gates hold; every screen has an a11y guideline test (`check:a11y`); no user-facing string literal bypasses the ARB files (`check:i18n`). |
| CI: `self-host-smoke`         | Same as `melos run smoke:self-host` on every PR.         |
| CI: `release-gate`            | Same posture checks at tag time.                         |

A regression on any gate fails the build.

## Making and proving a trust claim

The README "Trust posture" table is the project's list of promises. Each row has
a `Proof` column naming the test file(s) that fail if the promise breaks.
**If you add or reword a promise (in the README, `docs/`, or in-app copy), add or
point it at a test**; `check:release-posture` rejects a row with no proof, a
missing file, or a file with no `test(` in it. A promise you cannot test belongs
in the review document's "remaining items", not in the table.

## Accessibility and translations

- **Accessibility.** Every file under `apps/client/lib/screens/` must be pumped
  by a test in `apps/client/test/a11y/` that calls `expectMeetsAllGuidelines`
  (Flutter's Android + iOS tap-target, labelled-tap-target and text-contrast
  guidelines, light and dark). `melos run check:a11y` fails on a screen without one.
- **Strings.** User-facing copy lives in `apps/client/lib/l10n/app_en.arb`
  (gen-l10n; run `flutter gen-l10n` in `apps/client` after editing it and commit
  the generated files). Read it with `context.l10n`; format dates and times with
  `context.weekdayName(...)` / `context.clockTime(...)`. `melos run check:i18n`
  fails on a string literal handed straight to `Text(`, `tooltip:`, `label:`,
  `semanticLabel:`, ... Coach copy stays keyed in `coach_strings.dart`.

## Contribution expectations

- **One PR per change.** Bundled changes are hard to review and
  hard to revert. A small PR with one intent is the canonical
  shape.
- **No AI-generated copy without a named reviewer sign-off.**
  Every user-facing coach string lives in
  `packages/integrations/lib/src/l10n/coach_strings.dart`; the
  No-Dark-Patterns Standard ([`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md))
  lists the banned-everywhere patterns a reviewer ticks off.
- **No new external dependency without a corresponding
  `domain_core` purity test update.** If the new dep is in
  `domain_core`, the AD-1 grep test will fail; if it's in
  `integrations` or `apps/client`, the dep must be declared in
  the relevant `pubspec.yaml` and pinned to a stable version.
- **No telemetry, no analytics, no crash reporting.** The
  privacy posture is enforced by
  [`docs/telemetry-posture.md`](./docs/telemetry-posture.md). A
  PR that introduces a third-party SDK will fail
  `melos run check:telemetry`.
- **No dark patterns.** The banned-everywhere list in
  [`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md)
  is non-negotiable. The named reviewer signs off every PR that
  touches user-facing copy.

## Where things live

```
apps/client/             one Flutter responsive codebase (iOS + Android + web)
packages/domain_core/    pure-Dart domain (no Flutter/SQLite/HTTP imports)
packages/integrations/   adapters (drift store, OFF/USDA, AI rungs, sync, export)
infra/                   Docker + nginx self-host definition
docs/                    user-facing docs (your-data, self-host, ai-tiers,
                         telemetry-posture, no-dark-patterns-standard)
_bmad-output/            planning / implementation artifacts, NOT product docs
                         (see _bmad-output/README.md)
tools/                   repo-level gates (check_telemetry_claims,
                         check_release_posture, check_accessibility_floor,
                         check_i18n_literals, ...)
pubspec.yaml             workspace + the `melos:` scripts block (single source)
scripts/                 flutter_docker.sh (pinned toolchain), smoke, local web
```

## Android release signing

Debug and CI builds need no signing material. A release build
(`flutter build apk --release` / `appbundle --release`, run in
`apps/client`) requires `apps/client/android/key.properties`, which is
gitignored and must never be committed:

```
storeFile=/absolute/path/to/upload-keystore.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Without it the release build fails with an explanatory message instead of
signing with the debug key. See `docs/release-checklist.md` (Gate F).

## Reporting vulnerabilities

Please do not open public issues for security problems; follow
[`SECURITY.md`](SECURITY.md).

## Community

AI Nutrition Coach is yours to run and yours to shape. The release pipeline
is intentionally lightweight — one PR per change, one named
reviewer sign-off, three CI gates — so a single contributor can
ship a meaningful change in a single sitting.

The project is also intentionally **not** forking or hosting a
proprietary backend. The trust mechanic is architecture, not
policy; if you find a way to ship the same UX with a smaller
dependency surface, that's the right PR.
