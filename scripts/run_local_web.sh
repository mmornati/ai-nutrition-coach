#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach — run the app locally in Chrome.
#
#   scripts/run_local_web.sh [--port 8080] [--no-open] [--tunnel]
#
# Default: the Vite dev server (hot reload) bound to 127.0.0.1 only. It sends the full production
# Content-Security-Policy as a header (plus what HMR needs), never registers the service worker
# and fetches/verifies the pinned sqlite3mc, zxing and Argon2id assets first (`pnpm dev` does).
#
# --tunnel  builds the RELEASE bundle (secrets scan included), serves it with `vite preview` and
#           exposes it to your phone through an ephemeral ngrok https URL (printed with a
#           scannable QR when `qrencode` is installed). HTTPS is required for the camera and the
#           encrypted store on a phone. The URL is PUBLIC to anyone who has it: use only on
#           throwaway data. A release bundle has no unencrypted dev store.
#
# There is NO API key anywhere in this script, in .env, or in the build: anything compiled into a
# bundle is public. Enter your key at run time in Settings → Your AI; it is kept inside the
# encrypted store (readable only after you unlock it).
#
# .env (gitignored; see .env.example) is read as DATA, never executed. Only the allow-listed,
# non-secret name below is used; anything that looks like a secret is ignored with a notice, and
# any other name is ignored.
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
cd "$ROOT"
command -v pnpm >/dev/null 2>&1 || { echo "✗ pnpm is required (corepack enable)" >&2; exit 2; }

NGROK_LOG="$(mktemp "${TMPDIR:-/tmp}/ai-nutrition-coach-ngrok.XXXXXX")"
SERVER_PID=""
NGROK_PID=""
cleanup() {
  [[ -n "$NGROK_PID" ]] && kill "$NGROK_PID" 2>/dev/null || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$NGROK_LOG"
}
trap cleanup INT TERM EXIT

# ── .env, read as data ─────────────────────────────────────────────────────
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
      AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE) DEV_IN_MEMORY="$value" ;;
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

# The environment handed to Vite, as an ARRAY (no string re-parsing, no sh -c).
VITE_ENV=()
if [[ "$DEV_IN_MEMORY" == "true" ]]; then
  VITE_ENV+=("VITE_DEV_MEMORY_STORE=1")
elif [[ -n "$DEV_IN_MEMORY" && "$DEV_IN_MEMORY" != "false" ]]; then
  echo "✗ AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE must be true or false" >&2
  exit 2
fi

URL="http://localhost:$PORT"
if [[ "$TUNNEL" -eq 1 ]]; then
  echo "▶ Building the release bundle …"
  pnpm --filter @anc/web build >/dev/null
  bash tools/check_no_secrets_in_build.sh apps/web/dist
  echo "▶ Serving apps/web/dist on $URL (vite preview, 127.0.0.1 only) …"
  (cd apps/web && exec pnpm exec vite preview --outDir dist --host 127.0.0.1 --port "$PORT" --strictPort) &
else
  echo "▶ Starting the Vite dev server on $URL (127.0.0.1 only) …"
  (cd apps/web && exec env ${VITE_ENV[@]+"${VITE_ENV[@]}"} pnpm exec vite --host 127.0.0.1 --port "$PORT" --strictPort) &
fi
SERVER_PID=$!

for _ in $(seq 1 60); do
  curl -s -o /dev/null "$URL/" && break
  sleep 1
done
curl -s -o /dev/null "$URL/" || { echo "✗ server did not come up in time." >&2; exit 1; }

echo "✓ App is live at $URL"
echo "  (Ctrl-C to stop)"
if [[ "$OPEN_CHROME" -eq 1 ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open -a "Google Chrome" "$URL" || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" || true
  fi
fi

if [[ "$TUNNEL" -eq 1 ]]; then
  echo "▶ Opening ngrok tunnel to $URL …"
  echo "  (the URL is public to anyone who has it — throwaway data only)"
  ngrok http "$PORT" --log stdout >"$NGROK_LOG" 2>&1 &
  NGROK_PID=$!

  TUNNEL_URL=""
  for _ in $(seq 1 20); do
    TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((t['public_url'] for t in d.get('tunnels',[]) if t.get('public_url','').startswith('https://')), ''))" 2>/dev/null || true)
    [[ -n "$TUNNEL_URL" ]] && break
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
