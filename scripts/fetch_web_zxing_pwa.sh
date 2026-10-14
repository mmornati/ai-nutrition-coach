#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fetch the zxing-wasm barcode decoder the React PWA self-hosts (docs/pwa.md,
# "Barcode decoder") and VERIFY it against pinned SHA-256 values before it can
# enter a build.
#
#   scripts/fetch_web_zxing_pwa.sh             idempotent: no download when the
#                                              output already matches the pins
#   scripts/fetch_web_zxing_pwa.sh --self-test offline check of the pin handling
#
# Why: Safari / iOS and Firefox have no native `BarcodeDetector`. The PWA then falls back to
# zxing-wasm, which by default loads its `.wasm` from a CDN: a third-party load the CSP blocks and
# the zero-third-party posture forbids. So the reader and the wasm are served from OUR origin:
#
#   apps/web/public/zxing/<version>/reader.js          the IIFE reader, with the CDN wasm URL
#                                                      rewritten to a path beside it
#   apps/web/public/zxing/<version>/zxing_reader.wasm  unmodified
#   apps/web/public/zxing/<version>/LICENSE            MIT, zxing-wasm
#
# This is the same decoder, from the same npm tarball, with the same three pins as the Flutter web
# build (scripts/fetch_web_zxing.sh, the SPEC for this migration): the tarball, the patched reader
# and the wasm. The one text edit and its header are byte-identical to that script, so the pins are
# shared (the header text is covered by ZXING_READER_PATCHED_SHA256; do not reword it).
#
# The output is NOT committed (apps/web/public/zxing/ is git-ignored); `pnpm dev|build|test|e2e`
# run this script first. The directory name carries the version, so nginx can cache it
# `immutable` forever and an upgrade gets a new URL. `ZXING_VERSION` in
# apps/web/src/barcode/zxing-pin.ts must match (a unit test enforces it and that the pins are
# well-formed). Other versions in the output directory are removed so a stale decoder is never
# shipped. The precache manifest generator (tools/generate_precache_manifest.mjs) lists the .js and .wasm so scanning works offline.
#
# To re-pin: set ZXING_WASM_VERSION, download the npm tarball, review the release, `shasum -a 256`
# it into ZXING_TARBALL_SHA256, then run the script once with ZXING_ALLOW_REPIN=1 to print the new
# reader / wasm pins and update them. In that mode the script ALWAYS exits non-zero when the files
# do not match the current pins (and removes any output directory), so a human has to update the
# pins before a build can pass.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ZXING_WASM_VERSION="3.1.1"
ZXING_TARBALL_SHA256="294f1c96be94f8f59d44ddcb0c4703d68ea67ecd7fd478de88a179ed5a65e0ab"
ZXING_READER_PATCHED_SHA256="a82be6b3daddbee473d308ca4ce87f210be2dce984051ac86c4500a952e4b2ef"
ZXING_WASM_SHA256="6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_BASE="$ROOT/apps/web/public/zxing"
OUT="$OUT_BASE/$ZXING_WASM_VERSION"
URL="https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-${ZXING_WASM_VERSION}.tgz"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Compare the produced files' hashes with the pins. A mismatch always fails; with
# ZXING_ALLOW_REPIN=1 it first prints the new hashes and removes $OUT, so nothing unverified can be
# served.
check_pins() {
  local reader="$1" wasm="$2"
  if [[ "${ZXING_ALLOW_REPIN:-0}" == "1" ]]; then
    echo "  ZXING_READER_PATCHED_SHA256=\"$reader\""
    echo "  ZXING_WASM_SHA256=\"$wasm\""
  fi
  if [[ "$reader" != "$ZXING_READER_PATCHED_SHA256" || "$wasm" != "$ZXING_WASM_SHA256" ]]; then
    if [[ "${ZXING_ALLOW_REPIN:-0}" == "1" ]]; then
      rm -rf "$OUT"
      echo "✗ ZXING_ALLOW_REPIN=1: the files differ from the current pins. Update the pins above" >&2
      echo "  in this script (and review the release), then run it again without the flag." >&2
      exit 1
    fi
    echo "✗ zxing-wasm reader / wasm checksum mismatch after the pinned edit" >&2
    echo "  reader expected $ZXING_READER_PATCHED_SHA256 actual $reader" >&2
    echo "  wasm   expected $ZXING_WASM_SHA256 actual $wasm" >&2
    exit 1
  fi
}

# Fails closed (exit 1, nothing extracted, nothing written) unless the downloaded tarball matches
# the pinned SHA-256.
check_tarball() {
  local actual
  actual="$(sha256_of "$1")"
  if [[ "$actual" != "$ZXING_TARBALL_SHA256" ]]; then
    echo "✗ zxing-wasm tarball checksum mismatch" >&2
    echo "  expected $ZXING_TARBALL_SHA256" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
}

# Offline self-test of check_pins (run by `pnpm verify`).
if [[ "${1:-}" == "--self-test" ]]; then
  ST="$(mktemp -d)"
  trap 'rm -rf "$ST"' EXIT
  fail_test() { echo "✗ fetch_web_zxing_pwa self-test: $1" >&2; exit 1; }
  OUT="$ST/out"
  mkdir -p "$OUT"; echo x > "$OUT/reader.js"
  # matching pins: passes, output kept
  ( check_pins "$ZXING_READER_PATCHED_SHA256" "$ZXING_WASM_SHA256" ) >/dev/null 2>&1 \
    || fail_test "matching pins must pass"
  [[ -d "$OUT" ]] || fail_test "matching pins must keep the output"
  # mismatch: fails
  if ( check_pins "bad" "$ZXING_WASM_SHA256" ) >/dev/null 2>&1; then fail_test "a mismatch must fail"; fi
  if ( check_pins "$ZXING_READER_PATCHED_SHA256" "bad" ) >/dev/null 2>&1; then fail_test "a wasm mismatch must fail"; fi
  # mismatch in repin mode: prints the hashes, removes the output and STILL fails
  printed="$(ZXING_ALLOW_REPIN=1 bash -c '
    set -uo pipefail
    ZXING_READER_PATCHED_SHA256='"$ZXING_READER_PATCHED_SHA256"'; ZXING_WASM_SHA256='"$ZXING_WASM_SHA256"'; OUT='"$OUT"'
    '"$(declare -f check_pins)"'
    check_pins newreader newwasm' 2>/dev/null)" && fail_test "a repin mismatch must exit non-zero"
  [[ "$printed" == *'ZXING_READER_PATCHED_SHA256="newreader"'* ]] || fail_test "repin must print the new hashes"
  [[ ! -e "$OUT" ]] || fail_test "a repin mismatch must remove the output directory"
  # tarball mismatch: fails closed and leaves any output untouched / unwritten
  echo "not the pinned tarball" > "$ST/zxing.tgz"
  if ( check_tarball "$ST/zxing.tgz" ) >/dev/null 2>&1; then fail_test "a tarball mismatch must fail"; fi
  [[ ! -e "$ST/package" ]] || fail_test "a tarball mismatch must extract nothing"
  # a tarball that does hash to the pin passes (stub the pin to this file's own hash)
  ( ZXING_TARBALL_SHA256="$(sha256_of "$ST/zxing.tgz")"; check_tarball "$ST/zxing.tgz" ) >/dev/null 2>&1 \
    || fail_test "a matching tarball must pass"
  echo "✓ fetch_web_zxing_pwa self-test OK"
  exit 0
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

check_tarball "$TMP/zxing.tgz"

tar -xzf "$TMP/zxing.tgz" -C "$TMP" \
  package/dist/iife/reader/index.js package/dist/reader/zxing_reader.wasm package/LICENSE

# The one edit: the reader's default `locateFile` points the wasm at jsdelivr; point it at the file
# next to the reader (relative to the document base) instead. Fails if upstream's text is not
# exactly what was reviewed. (The app also passes an absolute `locateFile` at runtime.)
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
# NOTE: this header text is covered by ZXING_READER_PATCHED_SHA256 and is byte-identical to the
# Flutter script's (shared pins); changing it is a deliberate re-pin (see "To re-pin" above).
header = ("/* zxing-wasm %s (MIT, see LICENSE) - self-hosted by AI Nutrition Coach: the wasm "
          "path points at this directory instead of a CDN. Patched by "
          "scripts/fetch_web_zxing.sh. */\n" % version)
open(dst, "w", encoding="utf-8", newline="\n").write(header + text)
PY

PATCHED="$(sha256_of "$TMP/reader.js")"
WASM="$(sha256_of "$TMP/package/dist/reader/zxing_reader.wasm")"
check_pins "$PATCHED" "$WASM"

mkdir -p "$OUT"
cp "$TMP/reader.js" "$OUT/reader.js"
cp "$TMP/package/dist/reader/zxing_reader.wasm" "$OUT/zxing_reader.wasm"
cp "$TMP/package/LICENSE" "$OUT/LICENSE"
echo "✓ zxing-wasm $ZXING_WASM_VERSION verified (reader sha256 $PATCHED)"
