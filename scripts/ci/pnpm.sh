# shellcheck shell=bash
# Sourced by the Node CI scripts: put the pnpm pinned in package.json
# "packageManager" first on PATH through corepack, so a preinstalled pnpm never
# shadows it.
mkdir -p "$HOME/.local/bin"
corepack enable --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm --version
