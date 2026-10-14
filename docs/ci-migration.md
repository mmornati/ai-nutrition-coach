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

| Gate                                                 | GitHub workflow                     | CircleCI job     |
| ---------------------------------------------------- | ----------------------------------- | ---------------- |
| format, analyze, test, DST, web build + scans        | `ci.yml` verify                     | `flutter-verify` |
| release posture, telemetry, named reviewer           | `release-gate.yml`, `ndp-review.yml`| `flutter-verify` |
| debug APK + secrets scan                             | `ci.yml` apk                        | `flutter-apk`    |
| React PWA verify + e2e + scans                       | `web.yml`                           | `web`            |
| image build, trivy, self-host smoke, browser smoke   | `ci.yml` docker, `self-host-smoke.yml`, `browser-smoke.yml` | `image` |
| full-history secret scan (push + weekly)             | `gitleaks.yml`                      | `gitleaks`, `weekly-gitleaks` |
| release image SBOM (v\* tags)                        | `release-gate.yml` sbom             | `sbom`           |

CircleCI runs fewer, larger jobs than GitHub did. The three Flutter workflows
each bootstrapped melos and re-ran analyze + test; on CircleCI they share one
bootstrap. The three Docker workflows each rebuilt the image; on CircleCI they
share one VM and its layer cache. That cuts a full run from roughly 80 to
roughly 45 billed minutes.

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
   `.circleci/config.yml`, then connect the project in CircleCI (GitHub App
   integration). Builds start on push.
2. **Prove parity.** Get a green CircleCI pipeline on this branch, then merge.
   The open `migration/phase-*` branches get CircleCI once they rebase onto
   `main`. Phase 8 changes `web.yml`, `browser-smoke.yml` and
   `self-host-smoke.yml`; port those changes to `scripts/ci/` when it lands.
3. **Make GitHub the fallback.** Change the GitHub workflows' triggers to
   `workflow_dispatch` only, and make their steps call `scripts/ci/*.sh`. They
   then stop spending minutes, or showing red crosses, on every push, and stay
   ready for a manual run. Doing this after the stacked migration branches merge
   avoids merge conflicts on the workflow files.
4. **Schedule.** Add a CircleCI scheduled trigger named `weekly-gitleaks`
   (Mondays 04:17 UTC, branch `main`). Then drop the `schedule:` block from
   `gitleaks.yml`.
5. **Clean up after the Flutter removal.** When the React migration deletes
   `apps/client`, delete `flutter-verify` and `flutter-apk` with it. The
   `release-gate` and `ndp-review` checks then move into the web job.

## Switching providers

- **CircleCI down or out of credits:** run the GitHub workflows from the
  Actions tab (or `gh workflow run <name> --ref <branch>`).
- **Back to GitHub as primary:** restore the `push` / `pull_request` triggers in
  `.github/workflows/`, and in CircleCI either stop building the project
  (Project Settings → Stop Building) or turn on "Only build pull requests".

## CircleCI budget

The CircleCI Free plan includes a monthly credit allowance. Medium Docker and
machine executors cost about 10 credits per minute, and a large Docker executor
costs about 20. The Flutter jobs use `large`: the web build needs the memory. A
full `gates` run costs roughly 600–700 credits, so check the allowance on the
plan page before you open many PRs in one month. Ways to stretch it:

- Turn on "Auto-cancel redundant workflows" (Project Settings → Advanced).
- Turn on "Only build pull requests", so branch pushes without a PR, apart from
  `main`, do not build.
