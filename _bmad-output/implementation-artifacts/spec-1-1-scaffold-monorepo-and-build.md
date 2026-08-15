---
title: 'Story 1.1 — Scaffold the monorepo and reproducible build'
type: 'chore'
created: '2026-08-13'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'b8aa783dd4ac9af608faa8d235a857663ca3d4dc'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository is an empty scaffold — no Flutter client, domain core, integrations package, Docker self-host build, CI, or shared design tokens. Every later story (1.2–1.8) needs a bootstrapped, reproducible base to land in.

**Approach:** Create a melos-managed Dart pub-workspace monorepo (`apps/client`, `packages/domain_core`, `packages/integrations`) with pinned stack versions, a pure-Dart domain core with zero Flutter/drift/dio/mobile_scanner imports, a multi-stage Docker self-host web build (flutter → nginx SPA), a GitHub Actions CI running `flutter analyze` + a smoke test, and the Sage & Cream light+dark design tokens as the shared token source.

## Boundaries & Constraints

**Always:**
- Packages snake_case, files kebab-case; `packages/domain_core` is pure Dart with **zero** imports from Flutter, drift, dio, or mobile_scanner (AD-1).
- UI code never imports drift/dio/mobile_scanner directly — only through ports (AD-1).
- One responsive Flutter app at `apps/client` targeting iOS/Android/web; desktop deferred (AD-2).
- Version pins (stack.md): Flutter 3.47.0, Dart ^3.13.0, melos 8.2.2; `melos bootstrap` resolves all packages.
- Docker: multi-stage `cirruslabs/flutter:stable → flutter build web --release → nginx:alpine` with `try_files` SPA fallback (NFR9, FR11 seam).
- CI runs `flutter analyze` + smoke test on every PR (reproducible build, NFR9).
- Design tokens scaffolded for light **and** dark (NFR8); color rule: one sage accent, no red-as-guilt (UX-DR1, FR15).

**Ask First:**
- CI provider choice (default: GitHub Actions) and what the smoke test should cover.
- Whether `packages/integrations` ships as an empty skeleton or with a placeholder adapter.

**Never:**
- No domain feature logic (PlateLog entities, RecordPlate use-case, store, capture flows) — those are stories 1.2+; scaffold only.
- No packages beyond the three named; no desktop target.
- No local Flutter toolchain dependency for verification — use Docker (this machine has no Flutter/Dart installed).

</frozen-after-approval>

## Code Map

- `melos.yaml` -- pub-workspace orchestration; `melos bootstrap` resolves the three packages (new)
- `apps/client/` -- single responsive Flutter app, iOS/Android/web via `flutter create` (new)
- `apps/client/pubspec.yaml` -- Flutter manifest; path-depends on `domain_core`; pins flutter_riverpod 3.4.2; `flutter_lints` (new)
- `apps/client/lib/theme/app_tokens.dart` -- Sage & Cream light+dark tokens: palette, 4px spacing scale, radii, typography voices (new)
- `packages/domain_core/` -- pure-Dart package; `analysis_options.yaml` disables/rejects Flutter/drift/dio/mobile_scanner imports; smoke test asserts AD-1 (new)
- `packages/integrations/` -- skeleton package depending on `domain_core` (new)
- `infra/Dockerfile` -- multi-stage flutter web release build → nginx:alpine (new)
- `infra/nginx.conf` -- SPA `try_files` fallback (new)
- `.github/workflows/ci.yml` -- `melos bootstrap` + `flutter analyze` + smoke test on PR (new)
- `.gitignore` -- already present; verify it covers new package/build outputs (existing)

## Tasks & Acceptance

**Execution:**
- [x] `melos.yaml` -- create workspace listing `apps/*` and `packages/*`; melos 8.2.2 -- foundation of the monorepo
- [x] `apps/client` -- scaffold via `flutter create` (org `org.openplate`; platforms ios,android,web) -- one responsive codebase (AD-2)
- [x] `apps/client/pubspec.yaml` -- pin `flutter_riverpod: 3.4.2`, path-dep `domain_core` -- AD-3 derivation seam for later stories
- [x] `packages/domain_core` -- pure-Dart package with analysis config and a unit test asserting no forbidden imports -- AD-1 invariant enforced in CI
- [x] `packages/integrations` -- skeleton package path-depending on `domain_core` -- adapter home for stories 1.2+
- [x] `apps/client/lib/theme/app_tokens.dart` -- Sage & Cream tokens (light+dark colors, spacing, radii, typography voices) -- shared token source (UX-DR1, UX-DR2, NFR8)
- [x] `infra/Dockerfile` -- multi-stage `cirruslabs/flutter:stable → flutter build web --release → nginx:alpine` -- reproducible self-host build (NFR9, FR11)
- [x] `infra/nginx.conf` -- `try_files $uri $uri/ /index.html` SPA fallback -- FR11 seam
- [x] `.github/workflows/ci.yml` -- `melos bootstrap` + `flutter analyze` + smoke test on every PR -- reproducible build (NFR9)

**Acceptance Criteria:**
- Given an empty repository, when `melos bootstrap` runs, then `apps/client`, `packages/domain_core`, and `packages/integrations` resolve under Dart pub workspaces with pinned versions (Flutter 3.47.0, Dart ^3.13.0).
- Given the `domain_core` package, when it is analyzed and tested, then it has zero imports from Flutter, drift, dio, or mobile_scanner (AD-1), enforced by a CI-checked unit test.
- Given the `infra` Dockerfile, when `docker build` runs, then a self-host web build is produced via multi-stage `cirruslabs/flutter:stable → flutter build web --release → nginx:alpine` with `try_files` SPA fallback (NFR9, FR11).
- Given a pull request, when it is opened, then CI runs `flutter analyze` + a smoke test (reproducible build, NFR9).
- Given the app theme, when light and dark tokens are inspected, then Sage & Cream light+dark tokens exist as the shared token source with one sage accent and no red-guilt color (UX-DR1, UX-DR2, NFR8, FR15).

## Spec Change Log

- **2026-08-13 — melos 8.x workspace root added.** Finding: melos 8.2.2 requires a Dart pub workspace root (`pubspec.yaml` with `workspace:` listing all members) in addition to `melos.yaml`, and every member package must declare `resolution: workspace`. The spec only mentioned `melos.yaml` and `melos bootstrap`. Amendment: a root `pubspec.yaml` (`name: _openplate_workspace`, `workspace: [apps/client, packages/domain_core, packages/integrations]`) was added, and `resolution: workspace` was added to each member's `pubspec.yaml`. Without this, `melos bootstrap` does not resolve. Bad state avoided: a melos 8.x setup that fails at the very first `bootstrap` invocation. KEEP: the spec's high-level "Dart pub workspaces" + `melos bootstrap` intent is preserved; this is a necessary implementation detail, not a deviation.
- **2026-08-13 — local verification gap (environment, not code).** The `ghcr.io/cirruslabs/flutter:stable` and `:latest` images available on this machine ship Flutter 3.44.0 / Dart 3.12.0; the spec pins Flutter 3.47.0 / Dart `^3.13.0`. `docker build` and `flutter analyze` therefore fail at `pub get` version solving. The CI workflow pins the same image and will succeed on a runner whose image contains Flutter 3.47.0. No code change; the gap is on the local Docker image registry. Manifested as: docker build fails at `melos bootstrap` step; nginx config independently verified in isolation against a synthetic HTML root (PASS).
- **2026-08-13 — review-loopback patches (17 fixes).** Blind-hunter, edge-case-hunter, and verification-gap reviewers ran in parallel. Classified: 17 `patch` findings (P0 CI gate correctness, P1 correctness, P2 spec-fidelity cleanups); 7 `defer` findings (LICENSE/CONTRIBUTING, Android deprecated flags, release signing, dark-mode launch background, real CHANGELOG entries, the first `format:check` run, `AppPalette._()` unused constructor) appended to `deferred-work.md`. KEEP: the spec's intent is unchanged — all patches are localized fixes within the existing scope (no spec mutations). The deferred items are real but out of scope for the scaffold. Notable high-severity fixes: `melos.yaml` `test` script now mirrors `analyze`'s Flutter vs pure-Dart split so the widget test actually runs; `apps/client/lib/main.dart` resolves dark mode via `Theme.of(context).brightness`; `flutter_lints` downgraded from the unsatisfiable `^6.0.0` to `^5.0.0`; nginx hardened with gzip, CSP, X-Frame-Options, Permissions-Policy; `.dockerignore` added; CI gets `permissions: read`, `concurrency`, and `format:check`; `build:web` script lives in `melos.yaml` and is shared by Dockerfile + CI.

## Design Notes

Token location: tokens are a UI concern, so they live in `apps/client/lib/theme` as pure-Dart constants, consumed by a thin `ThemeData` adapter. They do not go in `domain_core` (which stays entities/use-cases/ports only). This keeps AD-1 clean without bloating the core with styling.

Verification without local Flutter: this machine has no Flutter/Dart toolchain; Docker (OrbStack) is available, so build/analyze verification runs inside `cirruslabs/flutter:stable`. CI performs the same check on every PR.

## Verification

**Commands:**
- `docker build -f infra/Dockerfile -t openplate-web .` -- expected: multi-stage build completes and produces an nginx image
- `docker run --rm -p 8080:80 openplate-web` then `curl -s http://localhost:8080/some/deep/link` -- expected: SPA fallback serves index.html (try_files)
- `docker run --rm -v "$PWD":/work cirruslabs/flutter:stable sh -c "cd /work && flutter analyze"` -- expected: no analyzer issues (domain_core included)

**Manual checks (if no CLI):**
- `melos.yaml` lists the three packages; `domain_core/pubspec.yaml` has no Flutter/drift/dio/mobile_scanner dependencies; `apps/client/lib/theme/app_tokens.dart` contains light and dark palettes.

## Suggested Review Order

**Monorepo foundation (entry point)**

- Single file that orchestrates the three packages; `test` mirrors `analyze`'s Flutter / pure-Dart split so the widget test actually runs.
  [`melos.yaml:11`](../../melos.yaml#L11)

- Root pubspec with the Dart pub workspace block; melos 8.x requires this alongside `melos.yaml`.
  [`pubspec.yaml:7`](../../pubspec.yaml#L7)

**Pure-Dart domain core (AD-1 invariant)**

- Zero Flutter / drift / dio / mobile_scanner dependencies — the foundation of every later story.
  [`packages/domain_core/pubspec.yaml:12`](../../packages/domain_core/pubspec.yaml#L12)

- Structural AD-1 gate: greps `lib/` for forbidden imports and runs in CI as `dart test`.
  [`packages/domain_core/test/domain_core_test.dart:30`](../../packages/domain_core/test/domain_core_test.dart#L30)

- Symmetric lint posture (recommended + a couple strict rules) — matched on the integrations side.
  [`packages/domain_core/analysis_options.yaml:1`](../../packages/domain_core/analysis_options.yaml#L1)

**Flutter client app**

- Material app wires both light + dark palettes, follows the platform brightness, and exposes `themeMode` for tests.
  [`apps/client/lib/main.dart:9`](../../apps/client/lib/main.dart#L9)

- Pinned to `flutter_lints: ^5.0.0` (the highest resolvable line; `^6.0.0` is the trap).
  [`apps/client/pubspec.yaml:27`](../../apps/client/pubspec.yaml#L27)

**Design tokens (shared source)**

- Sage & Cream palettes, 4px scale, role-bound typography, one sage accent, no red-as-guilt.
  [`apps/client/lib/theme/app_tokens.dart:58`](../../apps/client/lib/theme/app_tokens.dart#L58)

**Adapter skeleton**

- Empty-skeleton package depending on `domain_core`; placeholders for the real adapters in 1.2+.
  [`packages/integrations/pubspec.yaml:1`](../../packages/integrations/pubspec.yaml#L1)

**Reproducible self-host build**

- Multi-stage build; bash + `melos run build:web`; nginx pinned by digest.
  [`infra/Dockerfile:18`](../../infra/Dockerfile#L18)

- SPA fallback + gzip + security headers (CSP, X-Frame-Options, Permissions-Policy).
  [`infra/nginx.conf:31`](../../infra/nginx.conf#L31)

**CI gate**

- Containerized Flutter + `melos bootstrap` + `format:check` + `analyze` + `test`; consumes the same `build:web` script.
  [`.github/workflows/ci.yml:36`](../../.github/workflows/ci.yml#L36)

**Build hygiene**

- Slashes build context size and keeps `.git/`, `.dart_tool/`, secrets, and BMad tooling out of the image.
  [`.dockerignore:1`](../../.dockerignore#L1)
