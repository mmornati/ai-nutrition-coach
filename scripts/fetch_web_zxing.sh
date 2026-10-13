#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fetch the zxing-wasm barcode decoder the web build self-hosts (ADR-0003) and
# VERIFY it against pinned SHA-256 values before it can enter a build.
#
#   scripts/fetch_web_zxing.sh             idempotent: no download when the
#                                          output already matches the pins
#
# Why: Safari / iOS has no native `BarcodeDetector`, and Firefox neither.
# `mobile_scanner` (7.4.x) then falls back to `zxing-wasm`, a script it loads
# by default from cdn.jsdelivr.net, and that script in turn fetches its
# `.wasm` from the same CDN. Both are third-party loads (blocked by our CSP,
# contrary to the zero-third-party posture), so the decoder is served from
# OUR origin instead:
#
#   apps/client/web/zxing/<version>/reader.js          (the IIFE reader, with
#                                                       the CDN wasm URL
#                                                       rewritten to a path
#                                                       next to it)
#   apps/client/web/zxing/<version>/zxing_reader.wasm  (unmodified)
#   apps/client/web/zxing/<version>/LICENSE            (MIT, zxing-wasm)
#
# Source: the npm tarball https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-<v>.tgz
# (MIT; bundles zxing-cpp, Apache-2.0). The tarball is verified against a
# pinned SHA-256; the one text edit made to the reader is deterministic and
# the RESULT is verified against a second pin, so a changed upstream or a
# changed edit fails closed.
#
# Version coupling: `mobile_scanner` hard-codes the zxing-wasm version it
# expects (lib/src/web/web_library_versions.dart, `zxingWasmVersion`; the
# reader API and result format names are version-specific). The script refuses
# to run when pubspec.lock pins a different mobile_scanner than the one this
# pin was reviewed against, so an upgrade forces a conscious re-pin.
#
# The output is NOT committed (apps/client/web/zxing/ is git-ignored); it is
# produced by `melos run build:web`, infra/Dockerfile, CI and
# scripts/run_local_web.sh through this script. The directory name carries the
# version, so nginx can cache it forever and an upgrade gets a new URL;
# `kWebZxingReaderScriptPath` in scanner_adapters.dart must match (a unit test
# enforces it).
#
# To re-pin: set ZXING_WASM_VERSION to what the new mobile_scanner expects,
# download the npm tarball, review the release, `sha256sum` it into
# ZXING_TARBALL_SHA256, run the script once with ZXING_ALLOW_REPIN=1 to print
# the new ZXING_READER_PATCHED_SHA256 / ZXING_WASM_SHA256, and update those.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ZXING_WASM_VERSION="3.1.1"
MOBILE_SCANNER_REVIEWED="7.4.0"
ZXING_TARBALL_SHA256="294f1c96be94f8f59d44ddcb0c4703d68ea67ecd7fd478de88a179ed5a65e0ab"
ZXING_READER_PATCHED_SHA256="a82be6b3daddbee473d308ca4ce87f210be2dce984051ac86c4500a952e4b2ef"
ZXING_WASM_SHA256="6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_BASE="$ROOT/apps/client/web/zxing"
OUT="$OUT_BASE/$ZXING_WASM_VERSION"
URL="https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-${ZXING_WASM_VERSION}.tgz"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Guard: the pin was reviewed against this mobile_scanner.
LOCKED="$(awk '/^  mobile_scanner:$/ {f=1} f && /^    version:/ {gsub(/"/, "", $2); print $2; exit}' "$ROOT/pubspec.lock")"
if [[ "$LOCKED" != "$MOBILE_SCANNER_REVIEWED" ]]; then
  echo "✗ pubspec.lock pins mobile_scanner $LOCKED but this script was reviewed for $MOBILE_SCANNER_REVIEWED." >&2
  echo "  Check zxingWasmVersion in mobile_scanner's lib/src/web/web_library_versions.dart and re-pin" >&2
  echo "  (see the header of $0)." >&2
  exit 1
fi

# Drop other versions so a stale decoder is never shipped.
if [[ -d "$OUT_BASE" ]]; then
  for old in "$OUT_BASE"/*; do
    [[ -e "$old" && "$old" != "$OUT" ]] && rm -rf "$old"
  done
fi

if [[ -f "$OUT/reader.js" && -f "$OUT/zxing_reader.wasm" && -f "$OUT/LICENSE" \
  && "$(sha256_of "$OUT/reader.js")" == "$ZXING_READER_PATCHED_SHA256" \
  && "$(sha256_of "$OUT/zxing_reader.wasm")" == "$ZXING_WASM_SHA256" ]]; then
  echo "✓ zxing-wasm $ZXING_WASM_VERSION already present and verified"
  exit 0
fi

echo "▶ fetching zxing-wasm $ZXING_WASM_VERSION"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl --fail --silent --show-error --location --retry 3 --output "$TMP/zxing.tgz" "$URL"

ACTUAL="$(sha256_of "$TMP/zxing.tgz")"
if [[ "$ACTUAL" != "$ZXING_TARBALL_SHA256" ]]; then
  echo "✗ zxing-wasm tarball checksum mismatch" >&2
  echo "  expected $ZXING_TARBALL_SHA256" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi

tar -xzf "$TMP/zxing.tgz" -C "$TMP" \
  package/dist/iife/reader/index.js package/dist/reader/zxing_reader.wasm package/LICENSE

# The one edit: the reader's default `locateFile` points the wasm at
# jsdelivr; point it at the file next to the reader (relative to the document
# base) instead. Fails if upstream's text is not exactly what was reviewed.
python3 - "$TMP/package/dist/iife/reader/index.js" "$TMP/reader.js" "$ZXING_WASM_VERSION" <<'PY'
import sys
src, dst, version = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
old = "https://fastly.jsdelivr.net/npm/zxing-wasm@%s/dist/${n[1]}/${e}" % version
new = "zxing/%s/${e}" % version
if text.count(old) != 1:
    sys.exit("✗ expected exactly one jsdelivr wasm URL in the zxing-wasm reader; upstream changed")
text = text.replace(old, new)
if "jsdelivr" in text:
    sys.exit("✗ a CDN host remains in the patched zxing-wasm reader")
# NOTE: this header text is covered by ZXING_READER_PATCHED_SHA256; changing it is a
# deliberate re-pin (see "To re-pin" above).
header = ("/* zxing-wasm %s (MIT, see LICENSE) - self-hosted by AI Nutrition Coach: the wasm "
          "path points at this directory instead of a CDN. Patched by "
          "scripts/fetch_web_zxing.sh. */\n" % version)
open(dst, "w", encoding="utf-8", newline="\n").write(header + text)
PY

PATCHED="$(sha256_of "$TMP/reader.js")"
WASM="$(sha256_of "$TMP/package/dist/reader/zxing_reader.wasm")"
if [[ "${ZXING_ALLOW_REPIN:-0}" == "1" ]]; then
  echo "  ZXING_READER_PATCHED_SHA256=\"$PATCHED\""
  echo "  ZXING_WASM_SHA256=\"$WASM\""
fi
if [[ "$PATCHED" != "$ZXING_READER_PATCHED_SHA256" || "$WASM" != "$ZXING_WASM_SHA256" ]]; then
  [[ "${ZXING_ALLOW_REPIN:-0}" == "1" ]] && exit 0
  echo "✗ zxing-wasm reader / wasm checksum mismatch after the pinned edit" >&2
  echo "  reader expected $ZXING_READER_PATCHED_SHA256 actual $PATCHED" >&2
  echo "  wasm   expected $ZXING_WASM_SHA256 actual $WASM" >&2
  exit 1
fi

mkdir -p "$OUT"
cp "$TMP/reader.js" "$OUT/reader.js"
cp "$TMP/package/dist/reader/zxing_reader.wasm" "$OUT/zxing_reader.wasm"
cp "$TMP/package/LICENSE" "$OUT/LICENSE"
echo "✓ zxing-wasm $ZXING_WASM_VERSION verified (reader sha256 $PATCHED)"
