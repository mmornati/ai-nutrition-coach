#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fetch the hash-wasm Argon2id build the React PWA self-hosts (docs/adr/0007-encrypted-vault.md,
# "Phase S1") and VERIFY it against pinned SHA-256 values before it can enter a build.
#
#   scripts/fetch_web_argon2.sh             idempotent: no download when the output already
#                                           matches the pins
#   scripts/fetch_web_argon2.sh --self-test offline check of the pin handling
#
# Why: the encrypted backup file (and, later, the relay vault) derives its key from the passphrase
# with Argon2id (memory-hard), which WebCrypto does not offer. hash-wasm's UMD build embeds the
# wasm in one 29 KB file, so it is served from OUR origin and loaded by a module worker; nothing
# comes from a CDN:
#
#   apps/web/public/argon2/<version>/argon2.umd.min.js   the UMD build, one URL in its header
#                                                        comment removed (the host scan flags it)
#   apps/web/public/argon2/<version>/LICENSE             MIT, Dani Biro
#
# Three things are pinned: the npm tarball, the patched file and the licence text. The header text the patch writes is
# covered by ARGON2_PATCHED_SHA256; rewording it is a deliberate re-pin.
#
# The output is NOT committed (apps/web/public/argon2/ is git-ignored); `pnpm dev|build|test|e2e`
# run this script first. The directory name carries the version, so nginx can cache it
# `immutable` forever and an upgrade gets a new URL. `ARGON2_VERSION` in
# apps/web/src/sync/vault/argon2-pin.ts must match (a unit test enforces it and that the pins are
# well-formed). Other versions in the output directory are removed so a stale build is never
# shipped. The precache manifest generator (tools/generate_precache_manifest.mjs) lists the file so
# backups work offline.
#
# To re-pin: set HASH_WASM_VERSION, download the npm tarball, review the release, `shasum -a 256`
# it into ARGON2_TARBALL_SHA256, then run the script once with ARGON2_ALLOW_REPIN=1 to print the new
# pin and update it. In that mode the script ALWAYS exits non-zero when the file does not match the
# current pin (and removes any output directory), so a human has to update the pin before a build
# can pass. The unit tests check the RFC 9106 style vector against the served file's algorithm
# (apps/web/src/sync/vault/kdf.test.ts), so a re-pin that changes the output is caught.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

HASH_WASM_VERSION="4.12.0"
ARGON2_TARBALL_SHA256="1db32a125fb46177932ec8ac438d3cd8214ebdfaccb5d6611b657d88eb586f92"
ARGON2_PATCHED_SHA256="c1588d51de58111eee71f2e61dc9a98944801e612331eb847162f0b3845dcd9e"
ARGON2_LICENSE_SHA256="c14dea172f72f2714284a0ac2ab1b00b5352a01409d58255a46227ffc541debd"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_BASE="$ROOT/apps/web/public/argon2"
OUT="$OUT_BASE/$HASH_WASM_VERSION"
URL="https://registry.npmjs.org/hash-wasm/-/hash-wasm-${HASH_WASM_VERSION}.tgz"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Compare the produced file's hash with the pin. A mismatch always fails; with
# ARGON2_ALLOW_REPIN=1 it first prints the new hash and removes $OUT, so nothing unverified can be
# served.
check_pins() {
  local patched="$1"
  if [[ "${ARGON2_ALLOW_REPIN:-0}" == "1" ]]; then
    echo "  ARGON2_PATCHED_SHA256=\"$patched\""
  fi
  if [[ "$patched" != "$ARGON2_PATCHED_SHA256" ]]; then
    if [[ "${ARGON2_ALLOW_REPIN:-0}" == "1" ]]; then
      rm -rf "$OUT"
      echo "✗ ARGON2_ALLOW_REPIN=1: the file differs from the current pin. Update the pin above" >&2
      echo "  in this script (and review the release), then run it again without the flag." >&2
      exit 1
    fi
    echo "✗ hash-wasm argon2 checksum mismatch after the pinned edit" >&2
    echo "  expected $ARGON2_PATCHED_SHA256 actual $patched" >&2
    exit 1
  fi
}

# Fails closed (exit 1, nothing extracted, nothing written) unless the downloaded tarball matches
# the pinned SHA-256.
check_tarball() {
  local actual
  actual="$(sha256_of "$1")"
  if [[ "$actual" != "$ARGON2_TARBALL_SHA256" ]]; then
    echo "✗ hash-wasm tarball checksum mismatch" >&2
    echo "  expected $ARGON2_TARBALL_SHA256" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
}

# Offline self-test of check_pins (run by `pnpm verify`).
if [[ "${1:-}" == "--self-test" ]]; then
  ST="$(mktemp -d)"
  trap 'rm -rf "$ST"' EXIT
  fail_test() { echo "✗ fetch_web_argon2 self-test: $1" >&2; exit 1; }
  OUT="$ST/out"
  mkdir -p "$OUT"; echo x > "$OUT/argon2.umd.min.js"
  # matching pin: passes, output kept
  ( check_pins "$ARGON2_PATCHED_SHA256" ) >/dev/null 2>&1 || fail_test "a matching pin must pass"
  [[ -d "$OUT" ]] || fail_test "a matching pin must keep the output"
  # mismatch: fails
  if ( check_pins "bad" ) >/dev/null 2>&1; then fail_test "a mismatch must fail"; fi
  # mismatch in repin mode: prints the hash, removes the output and STILL fails
  printed="$(ARGON2_ALLOW_REPIN=1 bash -c '
    set -uo pipefail
    ARGON2_PATCHED_SHA256='"$ARGON2_PATCHED_SHA256"'; OUT='"$OUT"'
    '"$(declare -f check_pins)"'
    check_pins newfile' 2>/dev/null)" && fail_test "a repin mismatch must exit non-zero"
  [[ "$printed" == *'ARGON2_PATCHED_SHA256="newfile"'* ]] || fail_test "repin must print the new hash"
  [[ ! -e "$OUT" ]] || fail_test "a repin mismatch must remove the output directory"
  # tarball mismatch: fails closed and leaves any output untouched / unwritten
  echo "not the pinned tarball" > "$ST/hash-wasm.tgz"
  if ( check_tarball "$ST/hash-wasm.tgz" ) >/dev/null 2>&1; then fail_test "a tarball mismatch must fail"; fi
  # a tarball that does hash to the pin passes (stub the pin to this file's own hash)
  ( ARGON2_TARBALL_SHA256="$(sha256_of "$ST/hash-wasm.tgz")"; check_tarball "$ST/hash-wasm.tgz" ) >/dev/null 2>&1 \
    || fail_test "a matching tarball must pass"
  echo "✓ fetch_web_argon2 self-test OK"
  exit 0
fi

# Drop other versions so a stale build is never shipped.
if [[ -d "$OUT_BASE" ]]; then
  for old in "$OUT_BASE"/*; do
    [[ -e "$old" && "$old" != "$OUT" ]] && rm -rf "$old"
  done
fi

if [[ -f "$OUT/argon2.umd.min.js" && -f "$OUT/LICENSE" \
  && "$(sha256_of "$OUT/argon2.umd.min.js")" == "$ARGON2_PATCHED_SHA256" \
  && "$(sha256_of "$OUT/LICENSE")" == "$ARGON2_LICENSE_SHA256" ]]; then
  echo "✓ hash-wasm argon2 $HASH_WASM_VERSION already present and verified"
  exit 0
fi

echo "▶ fetching hash-wasm $HASH_WASM_VERSION"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl --fail --silent --show-error --location --retry 3 --output "$TMP/hash-wasm.tgz" "$URL"

check_tarball "$TMP/hash-wasm.tgz"

tar -xzf "$TMP/hash-wasm.tgz" -C "$TMP" package/dist/argon2.umd.min.js package/LICENSE

# The one edit: the licence banner links to the package page, a URL the host scan
# (tools/check_no_external_hosts.sh) rightly flags in any shipped file. Replace that one line with a
# note. Fails if upstream's text is not exactly what was reviewed.
python3 - "$TMP/package/dist/argon2.umd.min.js" "$TMP/argon2.umd.min.js" "$HASH_WASM_VERSION" <<'PY'
import re
import sys
src, dst, version = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
old = " * hash-wasm (https://www.npmjs.com/package/hash-wasm)\n"
# NOTE: this text is covered by ARGON2_PATCHED_SHA256; changing it is a deliberate re-pin (see
# "To re-pin" above).
new = (" * hash-wasm %s, self-hosted by AI Nutrition Coach (patched by scripts/fetch_web_argon2.sh: "
       "the package URL was removed from this line)\n" % version)
if text.count(old) != 1:
    sys.exit("✗ expected exactly one package URL line in the hash-wasm banner; upstream changed")
text = text.replace(old, new)
if re.search(r"https?:", text):
    sys.exit("✗ a URL remains in the patched hash-wasm build")
open(dst, "w", encoding="utf-8", newline="\n").write(text)
PY

PATCHED="$(sha256_of "$TMP/argon2.umd.min.js")"
check_pins "$PATCHED"
[[ "$(sha256_of "$TMP/package/LICENSE")" == "$ARGON2_LICENSE_SHA256" ]] \
  || { echo "✗ hash-wasm LICENSE checksum mismatch" >&2; exit 1; }

mkdir -p "$OUT"
cp "$TMP/argon2.umd.min.js" "$OUT/argon2.umd.min.js"
cp "$TMP/package/LICENSE" "$OUT/LICENSE"
echo "✓ hash-wasm argon2 $HASH_WASM_VERSION verified (sha256 $PATCHED)"
