#!/usr/bin/env bash
# Secret scan of the FULL git history (S1 / B6). Needs a full clone (not
# shallow): a new gitleaks ruleset can flag old commits. Findings are redacted.
#
# Toolchain: a Docker daemon, or run inside the gitleaks image itself
# (GITLEAKS_NATIVE=1 calls the `gitleaks` binary directly).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
  echo 'gitleaks: shallow clone — fetching the full history'
  git fetch --unshallow --quiet
fi

args=(detect --redact --no-banner --verbose)
if [[ "${GITLEAKS_NATIVE:-0}" == 1 ]]; then
  gitleaks "${args[@]}" --config .gitleaks.toml --source .
else
  docker run --rm -v "$PWD:/repo" \
    ghcr.io/gitleaks/gitleaks:v8.30.0@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9 \
    "${args[@]}" --config /repo/.gitleaks.toml --source /repo
fi
