#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Real-browser smoke of the PRODUCTION IMAGE in WebKit (Safari's engine) and Chromium, through
# Playwright (docs/pwa.md "Browser smoke").
#
#   scripts/webkit_smoke.sh                 build the image, run both browsers
#   scripts/webkit_smoke.sh --no-build      use an existing image
#   BROWSERS=webkit scripts/webkit_smoke.sh only WebKit
#   AI_NUTRITION_COACH_SMOKE_IMAGE=ai-nutrition-coach:ci ...  smoke a specific image
#
# Opt-in: it is not part of `pnpm verify` (the Playwright image is ~3 GB and `npm ci` needs the
# network). In CI it runs in the `image` job of .github/workflows/ci.yml.
#
# What runs
#   * the production image (infra/Dockerfile) as the server, with the same hardening flags the
#     compose file uses (read-only root, tmpfs /tmp, no capabilities), so the real nginx config,
#     CSP and headers are in the loop. The directory it renders sw.js + the precache manifest
#     into is mounted so the smoke can play "a new build was deployed";
#   * the official Playwright image, PINNED BY DIGEST, sharing the server container's network
#     namespace so the page is http://localhost:8080 -- a secure context, exactly like a phone
#     browsing to the app over HTTPS;
#   * tools/webkit_smoke/smoke.spec.mjs (see its header for the steps).
# The @playwright/test version is pinned by tools/webkit_smoke/package-lock.json and must equal
# the Playwright image's tag (checked below). Everything is removed on exit.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Keep the tag, the digest, tools/webkit_smoke/package.json's @playwright/test version and
# apps/web's @playwright/test version in step when bumping.
PLAYWRIGHT_VERSION="1.64.1"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea"
IMAGE="${AI_NUTRITION_COACH_SMOKE_IMAGE:-ai-nutrition-coach:browser-smoke}"
BROWSERS="${BROWSERS:-webkit,chromium}"
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "usage: $0 [--no-build]" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 10; }
grep -q "\"@playwright/test\": \"${PLAYWRIGHT_VERSION}\"" tools/webkit_smoke/package.json \
  || { echo "tools/webkit_smoke/package.json does not pin @playwright/test ${PLAYWRIGHT_VERSION}" >&2; exit 2; }

SERVER="ai-nutrition-coach-browser-smoke"
# Where the container renders sw.js + the precache manifest at start (30-render-sw.sh); mounted so
# the smoke can play "a new build was deployed".
PWA="$(mktemp -d "${TMPDIR:-/tmp}/ai-nutrition-coach-pwa.XXXXXX")"
cleanup() {
  docker rm -f "$SERVER" >/dev/null 2>&1 || true
  rm -rf "$PWA"
}
trap cleanup EXIT
docker rm -f "$SERVER" >/dev/null 2>&1 || true

if [[ "$BUILD" -eq 1 ]]; then
  echo "▶ building $IMAGE"
  docker build -f infra/Dockerfile -t "$IMAGE" . >/dev/null
fi

chmod 0777 "$PWA"
echo "▶ starting the server (the production image, hardened like the compose file)"
docker run -d --name "$SERVER" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$PWA":/tmp/ai-nutrition-coach-pwa "$IMAGE" >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$SERVER" wget -q --spider http://127.0.0.1:8080/ 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done
[[ "$ready" -eq 1 ]] || { docker logs "$SERVER" 2>&1 | tail -20 >&2; echo "✗ the server did not become ready" >&2; exit 1; }
[[ -f "$PWA/sw.js" && -f "$PWA/precache-manifest.json" ]] \
  || { echo "✗ the image rendered no sw.js / precache manifest" >&2; exit 1; }

# The instance AI proxy is off by default (docs/self-host.md): the offer says so and the proxy path
# is a plain 404, so the app the browsers load is in its no-AI-key-on-the-server state.
[[ "$(docker exec "$SERVER" wget -q -O - http://127.0.0.1:8080/ai/config.json)" == '{"enabled":false}' ]] \
  || { echo "✗ /ai/config.json is not {\"enabled\":false} by default" >&2; exit 1; }
# wget exits non-zero on any 4xx, which `pipefail` would treat as a failed check: read its
# output first, then look for the status line.
proxy_reply="$(docker exec "$SERVER" wget -S -O /dev/null --post-data '{}' \
  http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 || true)"
grep -q 'HTTP/1.1 404' <<<"$proxy_reply" \
  || { echo "✗ the disabled AI proxy path is not a 404" >&2; exit 1; }

# Voice transcription is part of the same off-by-default offer: a 404 as well.
voice_reply="$(docker exec "$SERVER" wget -S -O /dev/null --post-data '{}' \
  http://127.0.0.1:8080/ai/v1/audio/transcriptions 2>&1 || true)"
grep -q 'HTTP/1.1 404' <<<"$voice_reply" \
  || { echo "✗ the disabled voice transcription path is not a 404" >&2; exit 1; }

echo "▶ running the smoke in: $BROWSERS"
docker run --rm --network "container:$SERVER" --ipc=host \
  -v "$ROOT/tools/webkit_smoke":/src:ro -v "$PWA":/pwa \
  -e BROWSERS="$BROWSERS" -e PWA_DIR=/pwa -e BASE_URL=http://localhost:8080 -e CI=1 \
  "$PLAYWRIGHT_IMAGE" \
  sh -c 'mkdir -p /work && cp -R /src/. /work/ && cd /work && npm ci --silent --no-audit --no-fund && npx playwright test'
