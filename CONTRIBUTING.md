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
| Flutter      | 3.47.0 stable |
| Dart SDK     | ^3.13.0       |
| melos        | 8.2.2         |
| Docker       | 24+ (self-host) |

## Test

```sh
melos run test
```

The standard suite walks every package under `apps/*` and
`packages/*`. The `packages/domain_core` AD-1 grep test pins the
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
lock-screen HTML, asserts the `nginx:alpine` digest pin is in
place, and asserts no outbound network calls from the running
image. Budget is `<5 min` on a standard CI runner (NFR9 / FR-11).

## Release posture gates

Three gates run on every PR and every tag:

| Gate                          | What it asserts                                          |
| ----------------------------- | -------------------------------------------------------- |
| `melos run analyze`           | No analyzer regressions.                                 |
| `melos run test`              | All unit tests + the AD-1 purity test + the no-telemetry test. |
| `melos run smoke:self-host`   | The self-host build serves the lock screen in <5 min.    |
| `melos run check:telemetry`   | No unsanctioned socket users; doc claims are anchored.   |
| `melos run check:release-posture` | `LICENSE` + `CONTRIBUTING.md` + `docs/no-dark-patterns-standard.md` are at HEAD. |
| CI: `self-host-smoke`         | Same as `melos run smoke:self-host` on every PR.         |
| CI: `release-gate`            | Same posture checks at tag time.                         |

A regression on any gate fails the build.

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
_bmad-output/            implementation artifacts (specs, sprint-status, loop-status)
tools/                   repo-level scripts (check_telemetry_claims,
                         check_release_posture)
melos.yaml               workspace orchestration + the four scripts
```

## Community

AI Nutrition Coach is yours to run and yours to shape. The release pipeline
is intentionally lightweight — one PR per change, one named
reviewer sign-off, three CI gates — so a single contributor can
ship a meaningful change in a single sitting.

The project is also intentionally **not** forking or hosting a
proprietary backend. The trust mechanic is architecture, not
policy; if you find a way to ship the same UX with a smaller
dependency surface, that's the right PR.
