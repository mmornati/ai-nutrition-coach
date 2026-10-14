#!/usr/bin/env bash
# Playwright end-to-end tests against the built preview, in Chromium and WebKit
# (offline reload and the update flow).
#
# Toolchain: preferably the official Playwright image pinned in the CI config
# (mcr.microsoft.com/playwright, same version as @playwright/test): Node 24 and
# both browsers with their OS dependencies are preinstalled, so nothing is
# downloaded here. Elsewhere (Node 24 + corepack, sudo or root on
# Debian/Ubuntu) the browsers and their dependencies are installed first.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# shellcheck source=scripts/ci/pnpm.sh
source scripts/ci/pnpm.sh

# scripts/fetch_web_sqlite3mc.sh unpacks a zip; the Playwright image has no unzip.
if ! command -v unzip > /dev/null; then
  sudo=$([[ $EUID -eq 0 ]] || echo sudo)
  $sudo apt-get update -qq && $sudo apt-get install -y -qq --no-install-recommends unzip > /dev/null
fi

pnpm install --frozen-lockfile
if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
  pnpm --filter @anc/web exec playwright install --with-deps chromium webkit
fi
PW_WEBKIT=1 pnpm e2e

echo 'e2e: PASS'
