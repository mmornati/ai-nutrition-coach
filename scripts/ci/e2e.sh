#!/usr/bin/env bash
# Playwright end-to-end tests against the built preview, in Chromium and WebKit
# (offline reload and the update flow).
#
# Toolchain: Node 24 with corepack. Playwright installs the browsers and their
# OS dependencies (needs sudo or root on Debian/Ubuntu).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# shellcheck source=scripts/ci/pnpm.sh
source scripts/ci/pnpm.sh

pnpm install --frozen-lockfile
pnpm --filter @anc/web exec playwright install --with-deps chromium webkit
PW_WEBKIT=1 pnpm e2e

echo 'e2e: PASS'
