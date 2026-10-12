#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# OpenPlate — run the app locally in Chrome (web target).
#
# The repo has no Flutter SDK, Android SDK, or Xcode on the host; all Flutter
# toolchain work happens inside the pinned Docker image
# `ghcr.io/cirruslabs/flutter:stable`. This script:
#
#   1. builds the web bundle in that container,
#   2. starts the static web-server via `flutter run -d web-server`
#      (port 8080 by default),
#   3. opens Chrome at `http://localhost:8080`.
#
# The bundle is compiled with `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`
# so the capture → log → Day Board loop actually works in the browser
# (production web keeps the honest `WebEncryptedStoreStub`). Data lives and
# dies with the browser tab — see create_encrypted_store_web.dart.
#
# Usage:
#   scripts/run_local_web.sh [--port 8080] [--no-open] [--tunnel]
#
#   --tunnel   also expose the app to your phone via an ephemeral ngrok
#              https URL (printed with a scannable QR when `qrencode` is
#              installed). HTTPS is required for camera features (barcode,
#              plate photo). Disabled by default.
# ───────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${PORT:-8080}"
OPEN_CHROME=1
TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-open) OPEN_CHROME=0; shift ;;
    --tunnel) TUNNEL=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="ghcr.io/cirruslabs/flutter:stable"
# Persistent pub-cache volume so repeated runs don't re-download packages.
PUB_VOLUME="openplate_pubcache"

# Load the developer's local runtime configuration (gitignored). Any
# `OPENPLATE_*` value present in .env is forwarded as a `--dart-define`
# flag into the web build. Values are optional — omit any you don't
# need and the build simply skips it.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

BYOK_DEFINES=""
if [[ -n "${OPENPLATE_BYOK_ENDPOINT_URL:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=OPENPLATE_BYOK_ENDPOINT_URL=$OPENPLATE_BYOK_ENDPOINT_URL"
fi
if [[ -n "${OPENPLATE_BYOK_MODEL:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=OPENPLATE_BYOK_MODEL=$OPENPLATE_BYOK_MODEL"
fi
if [[ -n "${OPENPLATE_BYOK_API_KEY:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=OPENPLATE_BYOK_API_KEY=$OPENPLATE_BYOK_API_KEY"
fi
if [[ -n "${OPENPLATE_DEV_IN_MEMORY_STORE:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=$OPENPLATE_DEV_IN_MEMORY_STORE"
fi

echo "▶ Building web bundle — HTML renderer (BYOK defines: ${OPENPLATE_BYOK_MODEL:-<none>})…"
docker run --rm \
  -v "$ROOT":/work -w /work \
  -v "$PUB_VOLUME":/root/.pub-cache \
  "$IMAGE" \
  sh -c "cd apps/client && flutter build web --release $BYOK_DEFINES" \
  >/tmp/openplate_web_build.log 2>&1 || {
    echo "✗ web build failed — tail of log:" >&2
    tail -30 /tmp/openplate_web_build.log >&2
    exit 1
  }

# Force HTML renderer (Flutter 3.44 still defaults to canvaskit).
# The post-build fixup replaces the first build entry's renderer
# from canvaskit to html so mobile browsers render correctly.
if [[ -f "$ROOT/apps/client/build/web/flutter_bootstrap.js" ]]; then
  sed -i '' 's/"renderer":"canvaskit"/"renderer":"html"/' \
    "$ROOT/apps/client/build/web/flutter_bootstrap.js"
  echo "  ✓ flutter_bootstrap.js patched to html renderer"
fi

echo "▶ Serving build/web on http://localhost:$PORT …"
docker run --rm \
  -v "$ROOT":/work -w /work \
  -p "$PORT":8080 \
  "$IMAGE" \
  sh -c "cd apps/client/build/web && python3 -m http.server 8080" &
SERVER_PID=$!
NGROK_PID=""

cleanup() {
  if [[ -n "$NGROK_PID" ]]; then
    kill "$NGROK_PID" 2>/dev/null || true
    NGROK_PID=""
  fi
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Wait for the server to come up.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then
    break
  fi
  sleep 1
done

if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "✗ server did not come up in time." >&2
  exit 1
fi

echo "✓ App is live at http://localhost:$PORT"
echo "  (Ctrl-C to stop; container PID $SERVER_PID)"
if [[ "$OPEN_CHROME" -eq 1 ]]; then
  open -a "Google Chrome" "http://localhost:$PORT"
fi

if [[ "$TUNNEL" -eq 1 ]]; then
  echo "▶ Opening ngrok tunnel to http://localhost:$PORT …"
  ngrok http "$PORT" --log stdout >/tmp/openplate_ngrok.log 2>&1 &
  NGROK_PID=$!

  TUNNEL_URL=""
  for _ in $(seq 1 20); do
    TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((t['public_url'] for t in d.get('tunnels',[]) if t.get('public_url','').startswith('https://')), ''))" 2>/dev/null || true)
    if [[ -n "$TUNNEL_URL" ]]; then
      break
    fi
    sleep 0.5
  done

  if [[ -z "$TUNNEL_URL" ]]; then
    echo "✗ ngrok tunnel did not come up in time — tail of /tmp/openplate_ngrok.log:" >&2
    tail -15 /tmp/openplate_ngrok.log >&2
    exit 1
  fi

  echo ""
  echo "✓ Phone URL (open in your phone browser):"
  echo "  $TUNNEL_URL"
  if command -v qrencode >/dev/null 2>&1; then
    echo ""
    echo "  Scan this QR with your phone camera:"
    qrencode -t ANSIUTF8 "$TUNNEL_URL" 2>/dev/null || true
    echo ""
  fi
  echo "  (free ngrok: URL is ephemeral — it changes on every run)"
fi

wait "$SERVER_PID"