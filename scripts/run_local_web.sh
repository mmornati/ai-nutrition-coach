#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach — run the app locally in Chrome (web target).
#
# The repo has no Flutter SDK, Android SDK, or Xcode on the host; all Flutter
# toolchain work happens inside the pinned Docker image (Flutter 3.44.0, by
# digest — see scripts/flutter_docker.sh, the single pin). This script:
#
#   1. builds the web bundle in that container,
#   2. scans the bundle for secret-shaped strings (tools/check_no_secrets_in_build.sh),
#   3. serves it with a static web server bound to 127.0.0.1 only
#      (port 8080 by default) — it is never exposed on the LAN,
#   4. opens Chrome at `http://localhost:8080`.
#
# The bundle is compiled with `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`
# when .env asks for it, so the capture → log → Day Board loop works in the
# browser without the passphrase flow. Data then lives and dies with the tab —
# see create_encrypted_store_web.dart.
#
# There is NO API key anywhere in this script, in .env, or in the build (S1):
# anything compiled into a bundle is public. Enter your key at run time in
# Settings → Your AI; on web it is kept in memory for the unlocked session only.
#
# .env (gitignored; see .env.example) is read as DATA, never executed. Only the
# allow-listed, non-secret OPENPLATE_* names below are used; anything else —
# especially anything that looks like a secret — is ignored with a notice.
#
# Usage:
#   scripts/run_local_web.sh [--port 8080] [--no-open] [--tunnel]
#
#   --tunnel   also expose the app to your phone via an ephemeral ngrok https
#              URL (printed with a scannable QR when `qrencode` is installed).
#              HTTPS is required for camera features (barcode, plate photo).
#              Disabled by default. The URL is PUBLIC to anyone who has it, and
#              the bundle is scanned for secrets first; use only on throwaway
#              data.
# ───────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${PORT:-8080}"
OPEN_CHROME=1
TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || { echo "--port needs a value" >&2; exit 2; }
      PORT="$2"; shift 2 ;;
    --no-open) OPEN_CHROME=0; shift ;;
    --tunnel) TUNNEL=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "✗ invalid port: $PORT" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The pinned toolchain image (version + digest) lives in one place.
IMAGE="$("$ROOT/scripts/flutter_docker.sh" --print-image)"

# ── per-run temp files (mktemp: unpredictable names, mode 0600) ─────────────
BUILD_LOG="$(mktemp "${TMPDIR:-/tmp}/openplate-web-build.XXXXXX")"
NGROK_LOG="$(mktemp "${TMPDIR:-/tmp}/openplate-ngrok.XXXXXX")"
SERVER_PID=""
NGROK_PID=""

cleanup() {
  if [[ -n "$NGROK_PID" ]]; then
    kill "$NGROK_PID" 2>/dev/null || true
    NGROK_PID=""
  fi
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  rm -f "$BUILD_LOG" "$NGROK_LOG"
}
trap cleanup INT TERM EXIT

# ── .env, read as data ─────────────────────────────────────────────────────
ENDPOINT_URL=""
MODEL=""
DEV_IN_MEMORY=""

load_env_file() {
  local file="$1" line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
    if ! [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      continue
    fi
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    # One layer of matching quotes.
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    case "$key" in
      OPENPLATE_BYOK_ENDPOINT_URL) ENDPOINT_URL="$value" ;;
      OPENPLATE_BYOK_MODEL) MODEL="$value" ;;
      OPENPLATE_DEV_IN_MEMORY_STORE) DEV_IN_MEMORY="$value" ;;
      *KEY*|*TOKEN*|*SECRET*|*PASSWORD*)
        echo "• ignoring $key in .env — secrets are never read from files or" \
          "compiled in; enter keys in the app (Settings → Your AI)." >&2 ;;
      *) : ;;
    esac
  done <"$file"
}

if [[ -f "$ROOT/.env" ]]; then
  load_env_file "$ROOT/.env"
fi

# ── build the argument list as an ARRAY (no string re-parsing, no sh -c) ───
DEFINES=()
if [[ -n "$ENDPOINT_URL" ]]; then
  # Same rules as the app (validateByokEndpoint): https, or http only for
  # localhost / 127.0.0.1 / ::1; no credentials, query or fragment.
  if [[ "$ENDPOINT_URL" =~ [[:space:][:cntrl:]] || "$ENDPOINT_URL" == *[\?\#@]* ]]; then
    echo "✗ OPENPLATE_BYOK_ENDPOINT_URL must not contain spaces, '?', '#' or '@'" >&2
    exit 2
  fi
  if ! [[ "$ENDPOINT_URL" =~ ^https://[^/:]+(:[0-9]+)?(/.*)?$ \
    || "$ENDPOINT_URL" =~ ^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/.*)?$ ]]; then
    echo "✗ OPENPLATE_BYOK_ENDPOINT_URL must be https:// (http:// only for" \
      "localhost, 127.0.0.1 or [::1])" >&2
    exit 2
  fi
  DEFINES+=("--dart-define=OPENPLATE_BYOK_ENDPOINT_URL=$ENDPOINT_URL")
fi
if [[ -n "$MODEL" ]]; then
  if [[ "$MODEL" =~ [[:space:]] ]]; then
    echo "✗ OPENPLATE_BYOK_MODEL must not contain spaces" >&2
    exit 2
  fi
  DEFINES+=("--dart-define=OPENPLATE_BYOK_MODEL=$MODEL")
fi
if [[ "$DEV_IN_MEMORY" == "true" ]]; then
  DEFINES+=("--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true" "--dart-define=OPENPLATE_BUILD=dev")
elif [[ -n "$DEV_IN_MEMORY" && "$DEV_IN_MEMORY" != "false" ]]; then
  echo "✗ OPENPLATE_DEV_IN_MEMORY_STORE must be true or false" >&2
  exit 2
fi

# The web store's pinned, SHA-256-verified sqlite3mc.wasm (Phase 2B).
"$ROOT/scripts/flutter_docker.sh" bash scripts/fetch_web_sqlite.sh

echo "▶ Building web bundle (${#DEFINES[@]} define(s))…"
# `bash -c '…' _ "$@"`: the defines reach flutter as separate argv entries;
# flutter_docker.sh %q-quotes every argument on the way into the container.
if ! "$ROOT/scripts/flutter_docker.sh" \
  bash -c 'cd apps/client && exec flutter build web --release --no-web-resources-cdn "$@"' _ \
  "${DEFINES[@]+"${DEFINES[@]}"}" >"$BUILD_LOG" 2>&1; then
  echo "✗ web build failed — tail of log:" >&2
  tail -30 "$BUILD_LOG" >&2
  exit 1
fi

# Belt and braces: never serve (least of all through a tunnel) a bundle with
# a key-shaped string in it.
"$ROOT/scripts/flutter_docker.sh" bash tools/check_no_secrets_in_build.sh --web-only

echo "▶ Serving build/web on http://localhost:$PORT …"
# No `sh -c`: the server command is a fixed argv. The bundle is mounted
# read-only; the port is published on the loopback interface only.
docker run --rm \
  -v "$ROOT/apps/client/build/web":/site:ro -w /site \
  -p "127.0.0.1:$PORT:8080" \
  "$IMAGE" \
  python3 -m http.server 8080 --bind 0.0.0.0 &
SERVER_PID=$!

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
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open -a "Google Chrome" "http://localhost:$PORT" || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT" || true
  fi
fi

if [[ "$TUNNEL" -eq 1 ]]; then
  echo "▶ Opening ngrok tunnel to http://localhost:$PORT …"
  echo "  (the URL is public to anyone who has it — throwaway data only)"
  ngrok http "$PORT" --log stdout >"$NGROK_LOG" 2>&1 &
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
    echo "✗ ngrok tunnel did not come up in time — tail of its log:" >&2
    tail -15 "$NGROK_LOG" >&2
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
