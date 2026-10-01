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
