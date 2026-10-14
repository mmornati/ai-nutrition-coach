#!/usr/bin/env bash
# Which CI provider runs the gates on push and pull request (docs/ci-migration.md).
#
#   scripts/ci/provider.sh              show the current provider (same as `status`)
#   scripts/ci/provider.sh circleci     CircleCI primary: every GitHub job is skipped
#   scripts/ci/provider.sh github       GitHub primary: GitHub jobs run again
#   scripts/ci/provider.sh status       show the current provider
#
# The switch is the repository variable CI_PROVIDER, read by the `if:` guard on every job in
# .github/workflows/. CircleCI builds every push either way; to stop it, use Project Settings →
# Advanced in CircleCI. A manual GitHub run (`gh workflow run ci --ref <branch>`) ignores the switch.
#
# Toolchain: the GitHub CLI (`gh`), signed in with access to the repository's Actions variables.
#   GH_REPO   owner/name to act on (default: the repository of the current checkout)
set -euo pipefail

usage() {
  sed -n '4,7s/^#   //p' "$0" >&2
  exit 2
}

command -v gh > /dev/null || { echo 'provider: the GitHub CLI (gh) is required' >&2; exit 1; }
repo="${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"

current() {
  local value
  value=$(gh variable get CI_PROVIDER --repo "$repo" 2> /dev/null || true)
  if [[ "$value" == circleci ]]; then echo circleci; else echo github; fi
}

case "${1:-status}" in
  circleci)
    gh variable set CI_PROVIDER --body circleci --repo "$repo"
    echo "provider: CircleCI is primary for $repo — GitHub jobs are now skipped."
    ;;
  github)
    gh variable delete CI_PROVIDER --repo "$repo" 2> /dev/null || true
    echo "provider: GitHub is primary for $repo — GitHub jobs run on the next push."
    echo "          CircleCI keeps building too; stop it in CircleCI Project Settings → Advanced if needed."
    ;;
  status)
    echo "provider: $(current) is primary for $repo"
    ;;
  -h | --help) usage ;;
  *) usage ;;
esac
