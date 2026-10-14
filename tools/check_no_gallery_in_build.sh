#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fail if the dev component gallery leaked into a RELEASE build of the web app.
#
# The gallery (apps/web/src/components/gallery, route `#/gallery`) is a dev tool: App.tsx only
# imports it when `import.meta.env.DEV` or `VITE_GALLERY=1`, so Rollup drops the chunk and the
# route string from a plain `pnpm build`. The e2e server builds WITH the gallery into a separate
# directory (apps/web/dist-e2e); this guard keeps the shipped dist/ clean.
#
#   tools/check_no_gallery_in_build.sh          scan apps/web/dist
#   tools/check_no_gallery_in_build.sh <dir>    scan <dir> instead (used to prove the guard)
#
# Fails when, anywhere under the directory:
#   - a file name contains "gallery" (the lazy chunk is named after its module), or
#   - any file contains the route string "#/gallery" or gallery-only copy.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:-$ROOT/apps/web/dist}"

if [ ! -d "$DIR" ]; then
  echo "check_no_gallery_in_build: $DIR does not exist; build first (pnpm build)." >&2
  exit 2
fi

fail=0

names="$(find "$DIR" -type f -iname '*gallery*' -print)"
if [ -n "$names" ]; then
  echo "check_no_gallery_in_build: gallery file(s) in the build:" >&2
  echo "$names" >&2
  fail=1
fi

# "Resolve the plate" is gallery-only copy that no shipped screen uses.
hits="$(grep -rlE '#/gallery|Resolve the plate' "$DIR" || true)"
if [ -n "$hits" ]; then
  echo "check_no_gallery_in_build: gallery code or route string in the build:" >&2
  echo "$hits" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "The dev gallery must not ship. Check the guard around the lazy import in apps/web/src/App.tsx." >&2
  exit 1
fi
echo "check_no_gallery_in_build: OK ($DIR has no gallery chunk or route)."
