#!/usr/bin/env bash
# React PWA gate (apps/web + packages/core): format, lint, typecheck, unit tests,
# build, Playwright e2e against the built preview, then the third-party host
# and secrets scans of the bundle.
#
# Toolchain: Node 24 with corepack (pnpm comes from package.json
# "packageManager"). Playwright installs Chromium and its OS deps (needs sudo
# or root on Debian/Ubuntu).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Corepack shims first on PATH, so a preinstalled pnpm never shadows the pinned one.
mkdir -p "$HOME/.local/bin"
corepack enable --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0

pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @anc/web exec playwright install --with-deps chromium
pnpm --filter @anc/web e2e
bash tools/check_no_external_hosts.sh apps/web/dist
bash tools/check_no_secrets_in_build.sh apps/web/dist

echo 'web: PASS'
