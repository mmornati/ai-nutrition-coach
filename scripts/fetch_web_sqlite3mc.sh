#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fetch the SQLite3 Multiple Ciphers WebAssembly build the React PWA stores its
# data with (docs/adr/0005-web-encrypted-store.md) and VERIFY it against pinned
# SHA-256 values before it can enter a build.
#
#   scripts/fetch_web_sqlite3mc.sh         idempotent: no download when the
#                                          output already matches the pins
#
# Source: https://github.com/utelle/SQLite3MultipleCiphers/releases/tag/v2.5.1
#   asset  sqlite3mc-2.5.1-sqlite-3.53.4-wasm.zip   (SQLite 3.53.4 + sqlite3mc 2.5.1)
# The zip's SHA-256 below was checked against the release's own
# `sqlite3mc-2.5.1-SHA256SUMS` file (2026-10-14). The newer 2.6.x line was deliberately not
# taken (too fresh to trust). The two files the app uses are pinned a second time after
# extraction, so a swapped archive, a changed extractor or a tampered cache fails closed.
#
# What it produces (git-ignored, never committed, served by Vite from `public/`):
#
#   apps/web/public/sqlite3mc/<version>/sqlite3.mjs    ES-module JS API (incl. the
#                                                      `opfs-sahpool` VFS installer)
#   apps/web/public/sqlite3mc/<version>/sqlite3.wasm   the engine with the ciphers
#   apps/web/public/sqlite3mc/<version>/NOTICE.txt     provenance and licences
#
# The directory name carries the version, so the served URL is versioned and nginx can cache
# it `immutable` forever; an upgrade gets a new URL. `SQLITE3MC_VERSION` in
# apps/web/src/storage/engine-pin.ts must match (a unit test enforces it, and that the pins
# below are well-formed). Other versions in the output directory are removed so a stale
# engine is never shipped.
#
# To re-pin: change SQLITE3MC_VERSION / SQLITE3MC_SQLITE_VERSION, download the new zip, review
# the release, compare its hash with the release's SHA256SUMS file, `shasum -a 256` it into
# SQLITE3MC_ZIP_SHA256, then run the script once with SQLITE3MC_ALLOW_REPIN=1 to print the new
# file pins and update them. Re-pinning is a conscious change reviewed in a pull request.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

SQLITE3MC_VERSION="2.5.1"
SQLITE3MC_SQLITE_VERSION="3.53.4"
SQLITE3MC_WASM_DIRNAME="sqlite3mc-wasm-3530400"
SQLITE3MC_ZIP_SHA256="761a41b8dc996cfa21f193fc044739fbb0c4a31a1fd657a4df49cc59085577ce"
SQLITE3MC_MJS_SHA256="058b526608afdd81c244540f525286275d7bcc6a11676d19fdda7be50502f10e"
SQLITE3MC_WASM_SHA256="b6aedab9eee5cd5de0f13498e0bf64bb5ee9cc786d1d0303cc365578b64d18ab"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_BASE="$ROOT/apps/web/public/sqlite3mc"
OUT="$OUT_BASE/$SQLITE3MC_VERSION"
ASSET="sqlite3mc-${SQLITE3MC_VERSION}-sqlite-${SQLITE3MC_SQLITE_VERSION}-wasm.zip"
URL="https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v${SQLITE3MC_VERSION}/${ASSET}"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Drop other versions so a stale engine is never shipped.
if [[ -d "$OUT_BASE" ]]; then
  for old in "$OUT_BASE"/*; do
    [[ -e "$old" && "$old" != "$OUT" ]] && rm -rf "$old"
  done
fi

if [[ -f "$OUT/sqlite3.mjs" && -f "$OUT/sqlite3.wasm" && -f "$OUT/NOTICE.txt" \
  && "$(sha256_of "$OUT/sqlite3.mjs")" == "$SQLITE3MC_MJS_SHA256" \
  && "$(sha256_of "$OUT/sqlite3.wasm")" == "$SQLITE3MC_WASM_SHA256" ]]; then
  echo "✓ sqlite3mc $SQLITE3MC_VERSION (SQLite $SQLITE3MC_SQLITE_VERSION) already present and verified"
  exit 0
fi

echo "▶ fetching sqlite3mc $SQLITE3MC_VERSION wasm build"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl --fail --silent --show-error --location --retry 3 --output "$TMP/sqlite3mc.zip" "$URL"

ACTUAL="$(sha256_of "$TMP/sqlite3mc.zip")"
if [[ "$ACTUAL" != "$SQLITE3MC_ZIP_SHA256" ]]; then
  echo "✗ sqlite3mc zip checksum mismatch" >&2
  echo "  expected $SQLITE3MC_ZIP_SHA256" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi

mkdir "$TMP/x"
unzip -q -j "$TMP/sqlite3mc.zip" \
  "$SQLITE3MC_WASM_DIRNAME/jswasm/sqlite3.mjs" \
  "$SQLITE3MC_WASM_DIRNAME/jswasm/sqlite3.wasm" \
  -d "$TMP/x"

MJS="$(sha256_of "$TMP/x/sqlite3.mjs")"
WASM="$(sha256_of "$TMP/x/sqlite3.wasm")"
if [[ "${SQLITE3MC_ALLOW_REPIN:-0}" == "1" ]]; then
  echo "  SQLITE3MC_MJS_SHA256=\"$MJS\""
  echo "  SQLITE3MC_WASM_SHA256=\"$WASM\""
fi
if [[ "$MJS" != "$SQLITE3MC_MJS_SHA256" || "$WASM" != "$SQLITE3MC_WASM_SHA256" ]]; then
  [[ "${SQLITE3MC_ALLOW_REPIN:-0}" == "1" ]] && exit 0
  echo "✗ sqlite3mc sqlite3.mjs / sqlite3.wasm checksum mismatch after extraction" >&2
  echo "  mjs  expected $SQLITE3MC_MJS_SHA256 actual $MJS" >&2
  echo "  wasm expected $SQLITE3MC_WASM_SHA256 actual $WASM" >&2
  exit 1
fi

mkdir -p "$OUT"
cp "$TMP/x/sqlite3.mjs" "$OUT/sqlite3.mjs"
cp "$TMP/x/sqlite3.wasm" "$OUT/sqlite3.wasm"
cat > "$OUT/NOTICE.txt" <<NOTICE
SQLite3 Multiple Ciphers ${SQLITE3MC_VERSION} (SQLite ${SQLITE3MC_SQLITE_VERSION}), WebAssembly build.
Fetched by scripts/fetch_web_sqlite3mc.sh from ${URL}
and verified against pinned SHA-256 values. Not modified.

SQLite is in the public domain. SQLite3 Multiple Ciphers is MIT licensed
(https://github.com/utelle/SQLite3MultipleCiphers). The JavaScript glue is generated by
Emscripten (MIT / University of Illinois-NCSA) and the sqlite.org WASM API (public domain);
the full notices are at the top of sqlite3.mjs.
NOTICE
echo "✓ sqlite3mc $SQLITE3MC_VERSION verified (mjs sha256 $MJS)"
