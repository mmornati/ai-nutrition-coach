# CI entry points

There is one script per CI job. GitHub Actions (`.github/workflows/`) and
CircleCI (`.circleci/config.yml`) call the same scripts, so switching CI
providers never changes what a gate checks. Each script runs from any
directory and assumes only the toolchain named in its header.

| Script          | Toolchain                                  | Job                                   |
| --------------- | ------------------------------------------ | ------------------------------------- |
| `verify.sh`     | Node 24 + corepack (pnpm)                  | `verify`                              |
| `e2e.sh`        | the pinned Playwright image (or Node 24 + sudo) | `e2e`                            |
| `ndp_owners.sh` | bash, grep, sed                            | part of `verify` (REVIEWERS / CODEOWNERS) |
| `image.sh`      | Docker daemon (a VM)                       | `image`                               |
| `sbom.sh`       | Docker daemon                              | `sbom` (v\* tags)                     |
| `gitleaks.sh`   | Docker daemon, full clone                  | `gitleaks`                            |
| `provider.sh`   | GitHub CLI                                 | switches the primary provider (`pnpm ci:provider`) |
| `pnpm.sh`       | sourced: puts the pinned pnpm on PATH      | —                                     |

A proof script named in the README trust table counts as run by CI when a
workflow, the CircleCI config, or one of these entry points (called by either)
invokes it (`pnpm check:release-posture`). `docs/ci-migration.md` explains why
there are two providers.
