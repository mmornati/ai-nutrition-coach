# OpenPlate — apps/client

OpenPlate is a quiet, offline-first plate-logging app: log what you ate via
photo, barcode, or voice/typing, and it lands on your Day Board as one
honest row per meal. No streaks, no scores, no false-exact calories. See
the full intent in
`_bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md`
and `epic-1-context.md`.

This directory is the responsive Flutter client (iOS / Android / web, AD-2).
The pure-Dart domain core lives in `packages/domain_core/`; the adapter
implementations (drift, dio, mobile_scanner) live in `packages/integrations/`.
The monorepo is a Dart pub workspace orchestrated by `melos`.

## Bootstrap

From the repo root, after cloning:

```
melos bootstrap
```

That resolves `apps/client`, `packages/domain_core`, and
`packages/integrations` under Dart pub workspaces and links the
path-dependencies between them.

## Continuous integration

CI runs on every PR and push to `main` (`.github/workflows/ci.yml`) and
exercises:

* `melos run analyze` — `flutter analyze` for `apps/client`,
  `dart analyze` for the pure-Dart packages.
* `melos run format:check` — keeps formatting consistent.
* `melos run test` — the AD-1 purity test for `domain_core` plus the
  client widget smoke test.
* `melos run smoke:self-host` — the Story 4.4 / FR-11 self-host
  smoke test (builds the `bin/openplate` image end-to-end and
  curls the lock-screen HTML). See
  [`docs/self-host.md`](../../docs/self-host.md).

Local mirror:

```
melos run analyze
melos run test
melos run smoke:self-host
```
