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

| Gate                                                                    | GitHub workflow                                             | CircleCI job                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `pnpm verify` (format, lint, types, tests, DST, gates, build, scans)    | `ci.yml` verify                                             | `verify`                      |
| release posture, telemetry, named reviewer, project URL on tags         | `release-gate.yml`, `ndp-review.yml`                        | `verify`                      |
| Playwright e2e, Chromium + WebKit                                       | `ci.yml` e2e                                                | `e2e`                         |
| image build, trivy, self-host smoke, browser smoke                      | `ci.yml` docker, `self-host-smoke.yml`, `browser-smoke.yml` | `image`                       |
| full-history secret scan (on push, and weekly)                          | `gitleaks.yml`                                              | `gitleaks`, `weekly-gitleaks` |
| release image SBOM (v\* tags)                                           | `release-gate.yml` sbom                                     | `sbom`                        |

CircleCI runs fewer jobs than GitHub. `release-gate.yml` and `ndp-review.yml`
each install the workspace again and re-run gates that `pnpm verify` already
covers; on CircleCI one install covers all three. The three Docker workflows
each rebuild the image; on CircleCI they share one VM and its layer cache.

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

1. **Add CircleCI next to GitHub (this change).** Add `scripts/ci/*.sh` and
   `.circleci/config.yml`. The CircleCI project is connected (GitHub OAuth app,
   deploy key), and every push builds.
2. **Prove parity.** Get a green `gates` run, then merge.
3. **Make GitHub the fallback.** Change the GitHub workflows' triggers to
   `workflow_dispatch` only, and make their steps call `scripts/ci/*.sh`. They
   then stop spending minutes, or showing red crosses, on every push, and stay
   ready for a manual run.
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
All jobs run on `medium` except `e2e`, which needs `large`: WebKit's
encrypted-store tests time out on 2 vCPUs.
Check the real per-run cost on the project's Insights page after a few runs,
and compare it with the allowance on the plan page. Two settings stretch the
allowance:

- "Auto-cancel redundant workflows" (Project Settings → Advanced) is on.
- "Only build pull requests" stops branch pushes that have no PR from building;
  `main` and tags always build.
