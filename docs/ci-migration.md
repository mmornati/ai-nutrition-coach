# CI: GitHub Actions + CircleCI

The repository is private, so GitHub Actions runs bill against the account's
monthly included minutes, which are shared with every other private repository
on the account. When they run out, every workflow fails in ~5 seconds before
any step runs (seen on every migration PR in October 2026). A failed workflow
cannot fall back by itself, because it never starts.

This repository therefore runs its gates on **CircleCI first** and keeps the
GitHub workflows as a **fallback**. Both call the same entry points in
[`scripts/ci/`](../scripts/ci/README.md), so a gate means the same thing on
either provider and switching needs no code change.

## What runs where

Both providers run the same four jobs on every push, pull request and `v*` tag,
each one a single `scripts/ci/` entry point:

| Job        | Entry point            | What it checks                                                                                                                     | GitHub                  | CircleCI                              |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------- |
| `verify`   | `verify.sh`            | named reviewer, `pnpm verify` (format, lint, types, tests, DST, posture gates, build, bundle scans, guards), project URL on tags     | `ci.yml`                | `cimg/node`, `large`                  |
| `e2e`      | `e2e.sh`               | Playwright, Chromium + WebKit                                                                                                      | `ci.yml` (container)    | Playwright image, `large`             |
| `image`    | `image.sh`             | Dockerfile build (once), trivy, self-host smoke, browser smoke                                                                     | `ci.yml`                | `machine`, `medium`                   |
| `gitleaks` | `gitleaks.sh`          | full-history secret scan (also weekly)                                                                                             | `gitleaks.yml`          | `gates` + `weekly-gitleaks`           |
| `sbom`     | `sbom.sh`              | release image SBOM (`v*` tags only)                                                                                                | `release-gate.yml`      | `gates` (tags only)                   |

Before this change, GitHub ran 7 workflows and 9 jobs on each push.
`release-gate.yml` re-ran the whole of `pnpm verify`, `ndp-review.yml` did a
second install to re-run `pnpm gates` (already part of `pnpm verify`), and
three jobs each built the self-host image. e2e downloaded both browsers and
their OS packages on every run. Now each push runs 4 jobs, the image is built
once, and e2e starts from the pinned Playwright image.

## Why not an automatic quota-based switch

An external scheduler would have to read the remaining Actions minutes and then
dispatch either provider. We decided against it:

- The legacy endpoint `GET /users/{user}/settings/billing/actions` now returns
  `410 Gone`. Its replacement, `/settings/billing/usage`, reports usage
  line items, not a "minutes remaining" figure. The scheduler would have to
  apply the plan's included minutes and the per-OS multipliers itself, across
  every repository on the account.
- These gates run on push and pull request, not on a schedule. A scheduler
  would add latency to every PR and would be one more service to keep running.
- On a private Free-plan repository GitHub does not enforce required status
  checks, so the provider that reports a status makes no difference to merging.

The only scheduled job is the weekly gitleaks scan. It moves to a CircleCI
scheduled trigger, which is also more punctual than GitHub cron.

## Migration phases

1. **Add CircleCI next to GitHub, with shared entry points (this change).**
   Add `scripts/ci/*.sh` and `.circleci/config.yml`, and rewrite the GitHub
   workflows to call the same scripts. The CircleCI project is connected
   (GitHub OAuth app, deploy key), and every push builds.
2. **Prove parity.** Get a green `gates` run, then merge.
3. **Make GitHub the fallback.** Change the GitHub workflows' triggers to
   `workflow_dispatch` only. They then stop spending minutes, or showing red
   crosses, on every push, and stay ready for a manual run.
4. **Schedule.** Add a CircleCI scheduled trigger for `weekly-gitleaks`
   (Mondays 04:17 UTC, branch `main`). Then drop the `schedule:` block from
   `gitleaks.yml`.

## Switching providers

- **CircleCI down or out of credits:** run the GitHub workflows from the
  Actions tab (or `gh workflow run <name> --ref <branch>`).
- **Back to GitHub as primary:** restore the `push` / `pull_request` triggers in
  `.github/workflows/`, and in CircleCI either stop building the project
  (Project Settings → Stop Building) or turn on "Only build pull requests".

## CircleCI budget

The CircleCI Free plan includes a monthly credit allowance. Medium Docker and
machine executors cost about 10 credits per minute, and `large` costs about 20.
`verify` and `e2e` run on `large`. Vitest is CPU-bound, so 4 vCPUs finish in
about half the time for about the same credits. WebKit's encrypted-store tests
time out on 2 vCPUs. `image` and `gitleaks` run on `medium`. Check the real
per-run cost on the project's Insights page after a few runs, and compare it
with the allowance on the plan page. Two settings stretch the allowance:

- "Auto-cancel redundant workflows" (Project Settings → Advanced) is on.
- "Only build pull requests" stops branch pushes that have no PR from building;
  `main` and tags always build.

## Pins that move together

- **Playwright:** `@playwright/test` in `apps/web/package.json`, the e2e
  container image in `ci.yml` and `.circleci/config.yml`, and
  `PLAYWRIGHT_IMAGE` in `scripts/webkit_smoke.sh`.
- **trivy and syft:** pinned by digest in `scripts/ci/image.sh` and
  `scripts/ci/sbom.sh`. Dependabot does not see these pins, so bump them by hand.
