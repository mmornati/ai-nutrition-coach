#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fail if the built web bundle references a third-party host (N5).
#
# AI Nutrition Coach's zero-third-party posture means the shipped bundle must not load
# fonts, CanvasKit, scanner libraries or anything else from a CDN. This scans
# the text assets of apps/client/build/web (.js .html .json .css; the
# CanvasKit/skwasm engine binaries under canvaskit/ and the licence NOTICES
# are binary/legal blobs, not network configuration) for every http(s)://host
# and fails on any host that is not explicitly allowed below.
#
#   tools/check_no_external_hosts.sh                scan apps/client/build/web
#   tools/check_no_external_hosts.sh <dir>          scan this directory instead
#   tools/check_no_external_hosts.sh --self-test    prove the scanner works
#
# Three allow-lists, each entry justified:
#   NETWORK     hosts the app is meant to contact (user-initiated).
#   INERT       documentation / hint hosts for strings that are never fetched.
#   OVERRIDDEN  the four exact engine/scanner default CDN URLs (with expected
#               counts) that remain as dead literals but are neutralised by
#               config. Tolerated only while that config is verified present
#               (and the CSP would block them anyway).
# Matched: http(s)://, ws(s):// and protocol-relative //host.tld in .js .mjs
# .html .json .css .webmanifest.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LC_ALL=C
export LC_ALL

# User-initiated network use (documented in docs/telemetry-posture.md).
NETWORK_HOSTS=(world.openfoodfacts.org)
# Never fetched: doc links in engine error messages, UI placeholder hints.
#   openrouter.ai  BYOK endpoint placeholder text; contacted only if the user
#                  configures it.
#   localhost      BYOK hint "http://localhost".
#   drift.simonbinder.eu  documentation link inside drift's join-API error
#                  message (`.../queries/joins#aliases`, thrown on a misuse of
#                  `readTable` and never fetched); compiled in since the Day
#                  Board reads plates + entries with one join query (F8).
INERT_HOSTS=(
  docs.flutter.dev api.flutter.dev flutter.dev pub.dev
  developer.mozilla.org github.com
  openrouter.ai localhost
  drift.simonbinder.eu
)
# JS/React build (apps/web/dist). Inert string constants, never loaded from the network;
# allowed as EXACT URLs (or a fixed path prefix), not as whole hosts, so any other URL on
# these hosts still fails:
#   w3.org namespace URIs   XML namespace identifiers React DOM passes to
#                           createElementNS / setAttributeNS (svg, xlink, MathML, xml).
#   react.dev/errors        the production error-decoder message React prints; text only.
#   bit.ly/wb-precache      a documentation link inside a Workbox warning string.
#   emscripten.org, sqlite.org   licence-header comment and a documentation link inside the pinned
#                           sqlite3mc wasm build (public/sqlite3mc/<version>/sqlite3.mjs, fetched by
#                           scripts/fetch_web_sqlite3mc.sh); text only, never requested. The
#                           trailing-colon forms are how the scanner sees "https://sqlite.org:" in
#                           the licence prose.
INERT_URLS=(
  "http://www.w3.org/2000/svg"
  "http://www.w3.org/1999/xlink"
  "http://www.w3.org/1999/xhtml"
  "http://www.w3.org/1998/Math/MathML"
  "http://www.w3.org/XML/1998/namespace"
  "https://bit.ly/wb-precache"
  "https://emscripten.org:"
  "https://emscripten.org/docs/introducing_emscripten/emscripten_license.html"
  "https://sqlite.org:"
  "https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep"
)
INERT_URL_PREFIXES=(
  "https://react.dev/errors/"
)
# Engine / scanner default CDN URLs that exist as dead literals in the shipped
# JS but are neutralised by build/runtime config (see verify_overrides). They
# are allowed as EXACT strings with an EXACT expected number of occurrences
# across the bundle, not as whole hosts: any other URL on these hosts, or a
# different count (e.g. after a Flutter / mobile_scanner upgrade), fails and
# must be reviewed.
OVERRIDDEN_URLS=(
  "https://www.gstatic.com/flutter-canvaskit"
  "https://fonts.gstatic.com/s/"
  "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.1/dist/iife/reader/index.js"
  "https://unpkg.com/@zxing/library@0.23.0"
)
OVERRIDDEN_COUNTS=(2 1 1 1) # flutter.js + flutter_bootstrap.js; main.dart.js x3

in_list() {
  local n="$1" x
  shift
  for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done
  return 1
}

HITS=0
OVERRIDDEN_SEEN=0

# scan_dir <dir>: sets HITS / OVERRIDDEN_SEEN; prints offenders.
# Matches http(s)://, ws(s):// and protocol-relative //host.tld URLs in text
# assets (.js .mjs .html .json .css .webmanifest); canvaskit/ engine binaries
# are not network configuration and contain compressed-dictionary noise.
scan_dir() {
  local dir="$1" line file url host i
  local seen=()
  for i in "${!OVERRIDDEN_URLS[@]}"; do seen[$i]=0; done
  HITS=0
  OVERRIDDEN_SEEN=0
  while IFS= read -r line; do
    file="${line%%:*}"
    url="${line#*:}"
    host="${url#*//}"
    # A host ends at a path/port/query/fragment or at a list separator: a CSP value such as
    # `connect-src 'self' https://world.openfoodfacts.org; worker-src ...` ends with `;`.
    host="${host%%[/:?#;,]*}"
    host="${host%.}"
    # Exact, counted allow-list first.
    local matched=0
    for i in "${!OVERRIDDEN_URLS[@]}"; do
      if [[ "$url" == "${OVERRIDDEN_URLS[$i]}" ]]; then
        seen[$i]=$((seen[$i] + 1))
        OVERRIDDEN_SEEN=1
        matched=1
      fi
    done
    [[ "$matched" -eq 1 ]] && continue
    if in_list "$url" "${INERT_URLS[@]}"; then continue; fi
    local p
    for p in "${INERT_URL_PREFIXES[@]}"; do
      [[ "$url" == "$p"* ]] && matched=1
    done
    [[ "$matched" -eq 1 ]] && continue
    if in_list "$host" "${NETWORK_HOSTS[@]}" "${INERT_HOSTS[@]}"; then continue; fi
    printf '  ✗ %s references third-party URL %s\n' "$file" "$url" >&2
    HITS=$((HITS + 1))
  done < <(cd "$dir" && grep -rEao \
    '((https?|wss?):)?//[A-Za-z0-9._-]+\.[A-Za-z]{2,}[A-Za-z0-9._~:/?#@!$&*+,;=%-]*' \
    --include='*.js' --include='*.mjs' --include='*.html' --include='*.json' \
    --include='*.css' --include='*.webmanifest' . 2>/dev/null |
    grep -v '^\./canvaskit/' | sed 's#^\./##')
  for i in "${!OVERRIDDEN_URLS[@]}"; do
    if [[ "${seen[$i]}" -ne 0 && "${seen[$i]}" -ne "${OVERRIDDEN_COUNTS[$i]}" ]]; then
      printf '  ✗ %s occurs %s time(s), expected %s\n' \
        "${OVERRIDDEN_URLS[$i]}" "${seen[$i]}" "${OVERRIDDEN_COUNTS[$i]}" >&2
      HITS=$((HITS + 1))
    fi
  done
}

# Source lines that are not comments.
code_lines() { grep -Ev '^[[:space:]]*//' "$1" 2>/dev/null || true; }

# The OVERRIDDEN literals are acceptable only if the neutralising config is
# really in the bundle / source.
verify_overrides() {
  local dir="$1" bs src main reader
  [[ "$OVERRIDDEN_SEEN" -eq 1 ]] || return 0
  bs="$dir/flutter_bootstrap.js"
  if ! grep -q '"useLocalCanvasKit":true' "$bs" 2>/dev/null; then
    echo "  ✗ CanvasKit is not self-hosted (build with --no-web-resources-cdn)" >&2
    HITS=$((HITS + 1))
  fi
  if ! grep -Eq 'fontFallbackBaseUrl: *"fallback-fonts/"' "$bs" 2>/dev/null; then
    echo "  ✗ fontFallbackBaseUrl is not pinned to the local origin (apps/client/web/flutter_bootstrap.js)" >&2
    HITS=$((HITS + 1))
  fi
  src="$ROOT/apps/client/lib/state/scanner_adapters.dart"
  main="$ROOT/apps/client/lib/main.dart"
  if [[ -f "$src" ]]; then
    # The zxing-wasm reader (the jsdelivr literal) and its wasm are served from
    # THIS origin: the script URL must be redirected and the reader never
    # forced to the legacy unpkg-hosted zxing-js (the other dead literal).
    if ! code_lines "$src" | grep -q 'setBarcodeLibraryScriptUrl(kWebZxingReaderScriptPath)' ||
      ! code_lines "$src" | grep -q 'setWebBarcodeReader(WebBarcodeReader.auto)'; then
      echo "  ✗ the web barcode reader script is not redirected to the self-hosted copy (scanner_adapters.dart)" >&2
      HITS=$((HITS + 1))
    fi
    if code_lines "$src" | grep -q 'WebBarcodeReader.zxingJs'; then
      echo "  ✗ the unpkg-hosted zxing-js reader is selected (scanner_adapters.dart)" >&2
      HITS=$((HITS + 1))
    fi
    # ...and the redirect must actually run at start-up (not just exist / be in a comment).
    if ! code_lines "$main" | grep -Eq '^[[:space:]]*configureWebBarcodeReader\(\);'; then
      echo "  ✗ main.dart does not call configureWebBarcodeReader()" >&2
      HITS=$((HITS + 1))
    fi
    # The self-hosted decoder is in the bundle and the compiled app points at it.
    reader="$(ls "$dir"/zxing/*/reader.js 2>/dev/null | head -1 || true)"
    if [[ -z "$reader" || ! -f "$(dirname "$reader")/zxing_reader.wasm" ]]; then
      echo "  ✗ the self-hosted zxing decoder is missing from the bundle (run scripts/fetch_web_zxing.sh)" >&2
      HITS=$((HITS + 1))
    elif ! grep -qF "${reader#"$dir"/}" "$dir/main.dart.js" 2>/dev/null; then
      echo "  ✗ main.dart.js does not reference ${reader#"$dir"/}" >&2
      HITS=$((HITS + 1))
    fi
  fi
}

self_test() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/good" "$tmp/bad"
  printf 'var a="https://world.openfoodfacts.org/api";var b="https://docs.flutter.dev/x";\n' >"$tmp/good/main.dart.js"
  # The CSP <meta> of the JS build names the one allowed network host, ended by `;`.
  printf '<meta content="connect-src '"'"'self'"'"' https://world.openfoodfacts.org; worker-src '"'"'self'"'"'">\n' >"$tmp/good/index.html"
  printf 'var a="https://evil.example.com/x.js";\n' >"$tmp/bad/main.dart.js"
  printf '<meta content="connect-src https://evil.example.com; img-src">\n' >"$tmp/bad/index.html"
  printf 'var f="https://fonts.gstatic.com/s/";var g="//cdn.evil.example/x.js";var w="wss://t.evil.example/s";\n' >"$tmp/bad/flutter_bootstrap.js"
  printf 'import "https://fonts.gstatic.com/s/other.woff2";\n' >"$tmp/bad/lib.mjs"
  # JS build: the known inert strings pass, anything else on the same hosts fails.
  printf 'var n="http://www.w3.org/2000/svg";var e="https://react.dev/errors/418";var w="https://bit.ly/wb-precache";\n' >"$tmp/good/index.js"
  printf 'var x="https://react.dev/other";var y="http://www.w3.org/evil";var z="https://bit.ly/other";\n' >"$tmp/bad/index.js"
  scan_dir "$tmp/good"
  verify_overrides "$tmp/good"
  if [[ "$HITS" -ne 0 ]]; then
    echo "self-test FAILED: false positive" >&2
    rc=1
  fi
  scan_dir "$tmp/bad" 2>/dev/null
  verify_overrides "$tmp/bad" 2>/dev/null
  if [[ "$HITS" -lt 9 ]]; then
    echo "self-test FAILED: expected >=9 detections, got $HITS" >&2
    rc=1
  fi
  [[ "$rc" -eq 0 ]] && echo "✓ external-host scanner self-test passed"
  return "$rc"
}

DIR="$ROOT/apps/client/build/web"
for arg in "$@"; do
  case "$arg" in
    --self-test)
      self_test
      exit $?
      ;;
    -h | --help)
      sed -n '2,23p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
    *) DIR="$arg" ;;
  esac
done
[[ -d "$DIR" ]] || {
  echo "✗ $DIR does not exist — build the web bundle first." >&2
  exit 2
}

echo "▶ scanning $DIR for third-party hosts"
scan_dir "$DIR"
verify_overrides "$DIR"
if [[ "$HITS" -ne 0 ]]; then
  echo "✗ $HITS third-party reference(s) in the web bundle. Self-host the asset," >&2
  echo "  or (if it is genuinely inert / user-initiated) justify it in the allow-list." >&2
  exit 1
fi
echo "✓ no third-party hosts in the web bundle"
