# CI entry points

One script per CI job. GitHub Actions (`.github/workflows/`) and CircleCI
(`.circleci/config.yml`) call the same scripts, so switching CI providers never
changes what a gate checks. Each script runs from any directory and assumes
only the toolchain its job provides (named in the script header).

| Script                | Toolchain                         | Replaces (GitHub workflow)                   |
| --------------------- | --------------------------------- | -------------------------------------------- |
| `flutter_verify.sh`   | pinned Flutter image              | `ci.yml` verify, `release-gate.yml`, `ndp-review.yml` |
| `flutter_apk.sh`      | Flutter + Android SDK             | `ci.yml` apk                                 |
| `ndp_owners.sh`       | bash, grep, sed                   | `ndp-review.yml` (REVIEWERS / CODEOWNERS)    |
| `web_verify.sh`       | Node 24 + corepack (pnpm)         | `web.yml`                                    |
| `image.sh`            | Docker daemon                     | `ci.yml` docker, `self-host-smoke.yml`, `browser-smoke.yml` |
| `sbom.sh`             | Docker daemon                     | `release-gate.yml` sbom                      |
| `gitleaks.sh`         | Docker daemon, full clone         | `gitleaks.yml`                               |

See `docs/ci-migration.md` for why there are two providers.
