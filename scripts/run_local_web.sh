#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach — run the app locally in Chrome (web target).
#
# The repo has no Flutter SDK, Android SDK, or Xcode on the host; all Flutter
# toolchain work happens inside the pinned Docker image (Flutter 3.44.0, by
# digest — see scripts/flutter_docker.sh, the single pin). This script:
#
#   1. builds the web bundle in that container,
#   2. serves the bundle with a static web server bound to 127.0.0.1 only
#      (port 8080 by default) — it is never exposed on the LAN,
#   3. opens Chrome at `http://localhost:8080`.
#
# The bundle is compiled with `--dart-define=AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=true`
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
#              plate photo). Disabled by default. REFUSED when
#              OPENPLATE_BYOK_API_KEY is set: that key is compiled into the
#              JavaScript bundle, and a tunnel would publish it to the
#              internet.
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
# The pinned toolchain image (version + digest) lives in one place.
IMAGE="$("$ROOT/scripts/flutter_docker.sh" --print-image)"

# Load the developer's local runtime configuration (gitignored). Any
# `AI_NUTRITION_COACH_*` value present in .env is forwarded as a `--dart-define`
# flag into the web build. Values are optional — omit any you don't
# need and the build simply skips it.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# A build-time BYOK key is baked into the served JS bundle. Never publish that
# bundle through a tunnel (full removal of the build-time key: Phase 3).
if [[ "$TUNNEL" -eq 1 && -n "${OPENPLATE_BYOK_API_KEY:-}" ]]; then
  echo "✗ refusing --tunnel: OPENPLATE_BYOK_API_KEY is set, and it would be" >&2
  echo "  compiled into the JavaScript bundle served to the public internet." >&2
  echo "  Unset it (or remove it from .env) and re-run; enter the key in" >&2
  echo "  Settings → Your AI at run time instead." >&2
  exit 3
fi

BYOK_DEFINES=""
if [[ -n "${AI_NUTRITION_COACH_BYOK_ENDPOINT_URL:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=AI_NUTRITION_COACH_BYOK_ENDPOINT_URL=$AI_NUTRITION_COACH_BYOK_ENDPOINT_URL"
fi
if [[ -n "${AI_NUTRITION_COACH_BYOK_MODEL:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=AI_NUTRITION_COACH_BYOK_MODEL=$AI_NUTRITION_COACH_BYOK_MODEL"
fi
if [[ -n "${AI_NUTRITION_COACH_BYOK_API_KEY:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=AI_NUTRITION_COACH_BYOK_API_KEY=$AI_NUTRITION_COACH_BYOK_API_KEY"
fi
if [[ -n "${AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE:-}" ]]; then
  BYOK_DEFINES="$BYOK_DEFINES --dart-define=AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=$AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE"
fi

echo "▶ Building web bundle (BYOK defines: ${OPENPLATE_BYOK_MODEL:-<none>})…"
"$ROOT/scripts/flutter_docker.sh" \
  sh -c "cd apps/client && flutter build web --release $BYOK_DEFINES" \
  >/tmp/ai_nutrition_coach_web_build.log 2>&1 || {
    echo "✗ web build failed — tail of log:" >&2
    tail -30 /tmp/ai_nutrition_coach_web_build.log >&2
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
  -p "127.0.0.1:$PORT:8080" \
  "$IMAGE" \
  sh -c "cd apps/client/build/web && python3 -m http.server 8080 --bind 0.0.0.0" &
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
  ngrok http "$PORT" --log stdout >/tmp/ai_nutrition_coach_ngrok.log 2>&1 &
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
    echo "✗ ngrok tunnel did not come up in time — tail of /tmp/ai_nutrition_coach_ngrok.log:" >&2
    tail -15 /tmp/ai_nutrition_coach_ngrok.log >&2
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