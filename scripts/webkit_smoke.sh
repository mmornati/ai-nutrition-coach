#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Browser smoke of the release web bundle in WebKit (Safari's engine) and
# Chromium, through Playwright (docs/pwa.md "Browser smoke").
#
#   scripts/webkit_smoke.sh                 build the image if needed, run both
#   scripts/webkit_smoke.sh --no-build      use an existing image
#   BROWSERS=webkit scripts/webkit_smoke.sh only WebKit
#   OPENPLATE_SMOKE_IMAGE=openplate:ci ...  smoke a specific image
#
# Opt-in: it is not part of scripts/verify.sh (it needs ~10 minutes the first
# time: the Playwright image is ~2 GB and `npm ci` needs the network). It runs
# as its own CI job (.github/workflows/browser-smoke.yml).
#
# What runs
#   * the production image (infra/Dockerfile) as the server -- its files are
#     copied out to a temp directory and served read-only by a container of
#     that same image, so the real nginx config + CSP are in the loop;
#   * the official Playwright image, PINNED BY DIGEST, sharing the server
#     container's network namespace so the page is http://localhost:8080 -- a
#     secure context, exactly like a phone browsing to the app over HTTPS;
#   * tools/webkit_smoke/smoke.mjs (see its header for the steps).
# The Playwright npm version is pinned by tools/webkit_smoke/package-lock.json
# and must equal the image's tag. Everything is removed on exit.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Keep the tag, the digest and tools/webkit_smoke/package.json's `playwright`
# version in step when bumping.
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.60.0-noble@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948"
IMAGE="${OPENPLATE_SMOKE_IMAGE:-openplate:browser-smoke}"
BROWSERS="${BROWSERS:-webkit,chromium}"
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "usage: $0 [--no-build]" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 10; }

SERVER="openplate-browser-smoke"
SITE="$(mktemp -d "${TMPDIR:-/tmp}/openplate-site.XXXXXX")"
# Where the container renders sw.js + the precache manifest at start
# (30-render-sw.sh); mounted so the smoke can play "a new build was deployed".
PWA="$(mktemp -d "${TMPDIR:-/tmp}/openplate-pwa.XXXXXX")"
EXTRACT=""
cleanup() {
  docker rm -f "$SERVER" ${EXTRACT:+"$EXTRACT"} >/dev/null 2>&1 || true
  rm -rf "$SITE" "$PWA"
}
trap cleanup EXIT
docker rm -f "$SERVER" >/dev/null 2>&1 || true

if [[ "$BUILD" -eq 1 ]]; then
  echo "▶ building $IMAGE"
  docker build -f infra/Dockerfile -t "$IMAGE" . >/dev/null
fi

echo "▶ extracting the served bundle from $IMAGE"
EXTRACT="$(docker create "$IMAGE")"
docker cp "$EXTRACT:/usr/share/nginx/html/." "$SITE/"
docker rm -f "$EXTRACT" >/dev/null
EXTRACT=""
chmod -R a+rwX "$SITE"
chmod 0777 "$PWA"
[[ -f "$SITE/sw.js" && -f "$SITE/precache-manifest.json" ]] || { echo "✗ the image has no sw.js / precache manifest" >&2; exit 1; }

echo "▶ starting the server (the image's nginx, serving the extracted copy read-only)"
docker run -d --name "$SERVER" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$SITE":/usr/share/nginx/html:ro -v "$PWA":/tmp/openplate-pwa "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$SERVER" wget -q --spider http://127.0.0.1:8080/ 2>/dev/null && break
  sleep 0.5
done

echo "▶ running the smoke in: $BROWSERS"
docker run --rm --network "container:$SERVER" \
  --ipc=host \
  -v "$ROOT/tools/webkit_smoke":/w -v "$SITE":/site -v "$PWA":/pwa -w /w \
  -e BROWSERS="$BROWSERS" -e SITE_DIR=/site -e PWA_DIR=/pwa -e BASE_URL=http://localhost:8080 \
  "$PLAYWRIGHT_IMAGE" \
  sh -c 'npm ci --silent --no-audit --no-fund && node smoke.mjs'
