# CI entry points

There is one script per CI job. GitHub Actions (`.github/workflows/`) and
CircleCI (`.circleci/config.yml`) call the same scripts, so switching CI
providers never changes what a gate checks. Each script runs from any
directory and assumes only the toolchain named in its header.

| Script          | Toolchain                    | GitHub workflow it mirrors                                  |
| --------------- | ---------------------------- | ----------------------------------------------------------- |
| `verify.sh`     | Node 24 + corepack (pnpm)    | `ci.yml` verify, `release-gate.yml`, `ndp-review.yml`       |
| `e2e.sh`        | Node 24 + corepack, sudo     | `ci.yml` e2e                                                |
| `ndp_owners.sh` | bash, grep, sed              | `ndp-review.yml` (REVIEWERS / CODEOWNERS)                   |
| `image.sh`      | Docker daemon (a VM)         | `ci.yml` docker, `self-host-smoke.yml`, `browser-smoke.yml` |
| `sbom.sh`       | Docker daemon                | `release-gate.yml` sbom                                     |
| `gitleaks.sh`   | Docker daemon, full clone    | `gitleaks.yml`                                              |
| `pnpm.sh`       | (sourced) pins pnpm on PATH  | —                                                           |

`docs/ci-migration.md` explains why there are two providers.
