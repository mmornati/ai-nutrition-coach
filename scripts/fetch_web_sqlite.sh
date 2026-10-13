#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fetch the sqlite3mc WebAssembly module the web store needs (Phase 2B / ADR-0002)
# and VERIFY it against a pinned SHA-256 before it can enter a build.
#
#   scripts/fetch_web_sqlite.sh            idempotent: no download when the
#                                          file already matches the pin
#
# What it is: SQLite3MultipleCiphers compiled to WebAssembly, published by
# the sqlite3 Dart package's own release pipeline
#   https://github.com/simolus3/sqlite3.dart/releases/tag/sqlite3-<version>
# The release tag MUST equal the `sqlite3` version in pubspec.lock: the wasm
# import/export surface is coupled to the Dart bindings of that exact
# version. The script refuses to run when they differ, so bumping sqlite3
# forces a conscious re-pin (new version + new hash below).
#
# The binary is NOT committed (apps/client/web/sqlite3mc-*.wasm is git-ignored);
# it is fetched by `melos run build:web`, infra/Dockerfile and CI through this
# script. A hash mismatch deletes the download and fails the build.
#
# To re-pin: set SQLITE3_VERSION to the new pubspec.lock version, download
# https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-<v>/sqlite3mc.wasm,
# review the release, `sha256sum` it, and update SQLITE3MC_WASM_SHA256.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

SQLITE3_VERSION="3.5.1"
SQLITE3MC_WASM_SHA256="62a34ec725631c0438e4255ce0c6059099bf8e7fb331e7d4d91a38e075f43a19"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Versioned file name: nginx serves wasm with `immutable` caching, so an
# upgraded wasm MUST get a new URL. `kWebSqliteWasmPath` in
# web_database_backend.dart must match (a unit test enforces it).
DEST="$ROOT/apps/client/web/sqlite3mc-${SQLITE3_VERSION}.wasm"
URL="https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-${SQLITE3_VERSION}/sqlite3mc.wasm"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Guard: the pin must match the locked Dart package.
LOCKED="$(awk '/^  sqlite3:$/ {f=1} f && /^    version:/ {gsub(/"/, "", $2); print $2; exit}' "$ROOT/pubspec.lock")"
if [[ "$LOCKED" != "$SQLITE3_VERSION" ]]; then
  echo "✗ pubspec.lock pins sqlite3 $LOCKED but this script pins the wasm for $SQLITE3_VERSION." >&2
  echo "  Re-pin SQLITE3_VERSION and SQLITE3MC_WASM_SHA256 (see the header of $0)." >&2
  exit 1
fi

# Drop wasm files of other versions so a stale one is never shipped.
for old in "$ROOT"/apps/client/web/sqlite3mc*.wasm; do
  [[ -e "$old" && "$old" != "$DEST" ]] && rm -f "$old"
done

if [[ -f "$DEST" && "$(sha256_of "$DEST")" == "$SQLITE3MC_WASM_SHA256" ]]; then
  echo "✓ sqlite3mc.wasm ($SQLITE3_VERSION) already present and verified"
  exit 0
fi

echo "▶ fetching sqlite3mc.wasm $SQLITE3_VERSION"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl --fail --silent --show-error --location --retry 3 --output "$TMP" "$URL"

ACTUAL="$(sha256_of "$TMP")"
if [[ "$ACTUAL" != "$SQLITE3MC_WASM_SHA256" ]]; then
  echo "✗ sqlite3mc.wasm checksum mismatch" >&2
  echo "  expected $SQLITE3MC_WASM_SHA256" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
mv "$TMP" "$DEST"
trap - EXIT
echo "✓ sqlite3mc.wasm $SQLITE3_VERSION verified (sha256 $ACTUAL)"
