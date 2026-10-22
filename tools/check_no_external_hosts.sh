#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fail if the built web bundle references a third-party host (N5).
#
# AI Nutrition Coach's zero-third-party posture means the shipped bundle must not load
# fonts, CanvasKit, scanner libraries or anything else from a CDN. This scans
# the text assets of apps/web/dist (.js .mjs .html .json .css .webmanifest) for
# every http(s)://host and fails on any host that is not explicitly allowed below.
#
#   tools/check_no_external_hosts.sh                scan apps/web/dist
#   tools/check_no_external_hosts.sh <dir>          scan this directory instead
#   tools/check_no_external_hosts.sh --self-test    prove the scanner works
#
# Allow-lists, each entry justified (re-derived from the React bundle; a new
# host in the bundle fails until a person has looked at it):
#   NETWORK     hosts the app is meant to contact (user-initiated).
#   INERT_URLS  exact never-fetched URL literals: the UI placeholder hint, React and the pinned
#               wasm engine. Whole hosts are never allowed, only these exact strings.
# Matched: http(s)://, ws(s):// and protocol-relative //host.tld in .js .mjs
# .html .json .css .webmanifest.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LC_ALL=C
export LC_ALL

# User-initiated network use (documented in docs/telemetry-posture.md).
# world.openfoodfacts.org also appears as the add-product link of the barcode not-found state
# (https://world.openfoodfacts.org/cgi/product.pl?type=add&code=): a plain <a target=_blank> the person may
# follow, never fetched by the app; the host is already allowed, so no exact-URL entry is needed.
NETWORK_HOSTS=(world.openfoodfacts.org)
# JS/React build (apps/web/dist). Inert string constants, never loaded from the network;
# allowed as EXACT URLs (or a fixed path prefix), not as whole hosts, so any other URL on
# these hosts still fails:
#   w3.org namespace URIs   XML namespace identifiers React DOM passes to
#                           createElementNS / setAttributeNS (svg, xlink, MathML, xml).
#   react.dev/errors        the production error-decoder message React prints; text only.
#   openrouter.ai/api/v1    the BYOK endpoint placeholder text (en.ts); contacted only if the user
#                           configures an endpoint, and then through the capped-fetch helper.
#   emscripten.org, sqlite.org   licence-header comment and a documentation link inside the pinned
#                           sqlite3mc wasm build (public/sqlite3mc/<version>/sqlite3.mjs, fetched by
#                           scripts/fetch_web_sqlite3mc.sh); text only, never requested. The
#                           trailing-colon forms are how the scanner sees "https://sqlite.org:" in
#                           the licence prose.
#   beateatingdisorders.org.uk, ffab.fr   the two eating-disorder support links of the "talking to
#                           someone can help" line (apps/web/src/components/nutrition/support.ts):
#                           plain `<a href target=_blank rel="noopener noreferrer">` links the person
#                           may click, never fetched by the app; allowed as EXACT URLs only
#                           (docs/no-dark-patterns-standard.md, "Support").
#   tailwindcss.com         the MIT licence banner Tailwind writes into the built CSS
#                           (`/*! tailwindcss vX | MIT License | https://tailwindcss.com */`);
#                           text only, never requested.
INERT_URLS=(
  "http://www.w3.org/2000/svg"
  "http://www.w3.org/1999/xlink"
  "http://www.w3.org/1998/Math/MathML"
  "http://www.w3.org/XML/1998/namespace"
  "https://openrouter.ai/api/v1"
  "https://emscripten.org:"
  "https://emscripten.org/docs/introducing_emscripten/emscripten_license.html"
  "https://sqlite.org:"
  "https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep"
  "https://tailwindcss.com"
  "https://www.beateatingdisorders.org.uk/get-information-and-support/get-help-for-myself/support-now/"
  "https://www.ffab.fr/trouver-de-l-aide/permanence-telephonique"
)
INERT_URL_PREFIXES=(
  "https://react.dev/errors/"
)
in_list() {
  local n="$1" x
  shift
  for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done
  return 1
}

HITS=0

# scan_dir <dir>: sets HITS; prints offenders.
# Matches http(s)://, ws(s):// and protocol-relative //host.tld URLs in text
# assets (.js .mjs .html .json .css .webmanifest).
scan_dir() {
  local dir="$1" line file url host
  HITS=0
  while IFS= read -r line; do
    file="${line%%:*}"
    url="${line#*:}"
    host="${url#*//}"
    # A host ends at a path/port/query/fragment or at a list separator: a CSP value such as
    # `connect-src 'self' https://world.openfoodfacts.org; worker-src ...` ends with `;`.
    host="${host%%[/:?#;,]*}"
    host="${host%.}"
    local matched=0
    if in_list "$url" "${INERT_URLS[@]}"; then continue; fi
    local p
    for p in "${INERT_URL_PREFIXES[@]}"; do
      [[ "$url" == "$p"* ]] && matched=1
    done
    [[ "$matched" -eq 1 ]] && continue
    if in_list "$host" "${NETWORK_HOSTS[@]}"; then continue; fi
    printf '  ✗ %s references third-party URL %s\n' "$file" "$url" >&2
    HITS=$((HITS + 1))
  done < <(cd "$dir" && grep -rEao \
    '((https?|wss?):)?//[A-Za-z0-9._-]+\.[A-Za-z]{2,}[A-Za-z0-9._~:/?#@!$&*+,;=%-]*' \
    --include='*.js' --include='*.mjs' --include='*.html' --include='*.json' \
    --include='*.css' --include='*.webmanifest' . 2>/dev/null |
    sed 's#^\./##')
}

self_test() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/good" "$tmp/bad"
  # The CSP <meta> of the build names the one allowed network host, ended by `;`.
  printf '<meta content="connect-src '"'"'self'"'"' https://world.openfoodfacts.org; worker-src '"'"'self'"'"'">\n' >"$tmp/good/index.html"
  # The known inert strings pass.
  printf 'var n="http://www.w3.org/2000/svg";var e="https://react.dev/errors/418";var h="https://openrouter.ai/api/v1";\n' >"$tmp/good/index.js"
  # Anything else fails: another host, a CSP naming one, a CDN script, a websocket, a
  # protocol-relative URL, an import from a CDN, another URL on an inert host.
  printf 'var a="https://evil.example.com/x.js";\n' >"$tmp/bad/main.js"
  printf '<meta content="connect-src https://evil.example.com; img-src">\n' >"$tmp/bad/index.html"
  printf 'var g="//cdn.evil.example/x.js";var w="wss://t.evil.example/s";\n' >"$tmp/bad/boot.js"
  printf 'import "https://fonts.gstatic.com/s/other.woff2";\n' >"$tmp/bad/lib.mjs"
  printf 'var x="https://react.dev/other";var y="http://www.w3.org/evil";var z="https://bit.ly/wb-precache";var q="https://openrouter.ai/api/v1/other";var r="http://www.w3.org/1999/xhtml";\n' >"$tmp/bad/index.js"
  scan_dir "$tmp/good"
  if [[ "$HITS" -ne 0 ]]; then
    echo "self-test FAILED: false positive" >&2
    rc=1
  fi
  scan_dir "$tmp/bad" 2>/dev/null
  if [[ "$HITS" -lt 10 ]]; then
    echo "self-test FAILED: expected >=10 detections, got $HITS" >&2
    rc=1
  fi
  [[ "$rc" -eq 0 ]] && echo "✓ external-host scanner self-test passed"
  return "$rc"
}

DIR="$ROOT/apps/web/dist"
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
if [[ "$HITS" -ne 0 ]]; then
  echo "✗ $HITS third-party reference(s) in the web bundle. Self-host the asset," >&2
  echo "  or (if it is genuinely inert / user-initiated) justify it in the allow-list." >&2
  exit 1
fi
echo "✓ no third-party hosts in the web bundle"
