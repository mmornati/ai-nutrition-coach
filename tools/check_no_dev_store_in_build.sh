#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Fail if the dev-only storage code leaked into a RELEASE build of the web app.
#
# Two things are dev-only (docs/adr/0005-web-encrypted-store.md):
#   - the UNENCRYPTED in-memory store (apps/web/src/storage/dev/), reachable only through
#     `import.meta.env.DEV && VITE_DEV_MEMORY_STORE === '1'` in create-app-store.ts, with a visible
#     "DEV, not encrypted" banner. In a release build the constant folds to `false` and Rollup drops
#     the dynamic import and its chunk.
#   - the encrypted-store test harness page (apps/web/storage-harness.html), a build input only
#     when VITE_STORAGE_HARNESS=1 (the e2e server builds it into apps/web/dist-e2e);
#   - the barcode / OFF capture harness page (apps/web/capture-harness.html), built under the same
#     flag.
#
#   tools/check_no_dev_store_in_build.sh          scan apps/web/dist
#   tools/check_no_dev_store_in_build.sh <dir>     scan <dir> instead (used to prove the guard)
#   tools/check_no_dev_store_in_build.sh --self-test   prove the guard itself: a fake dist with a
#                                                  forbidden marker (or file name) must FAIL, a clean one must pass
#
# Fails when, anywhere under the directory:
#   - a file name contains "storage-harness" or "dev-store" (a lazy chunk is named after its module), or
#   - any file contains the banner copy, the dev flag name, the harness hook or the harness page name.
# src/storage/build-guard.test.ts additionally proves the bundler really drops the dev branch,
# by building an entry that imports createAppStore().
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "${1:-}" = "--self-test" ]; then
  T="$(mktemp -d)"
  trap 'rm -rf "$T"' EXIT
  self="${BASH_SOURCE[0]}"
  expect_fail() {
    if bash "$self" "$1" >/dev/null 2>&1; then
      echo "check_no_dev_store_in_build self-test: $2 was NOT detected" >&2
      exit 1
    fi
  }
  mkdir -p "$T/clean/assets" "$T/marker/assets" "$T/flag/assets" "$T/named/assets" "$T/capname/assets" "$T/capmark/assets"
  echo 'console.log("hello");' > "$T/clean/assets/index.js"
  echo 'x="DEV, not encrypted"' > "$T/marker/assets/index.js"
  echo 'x=import.meta.env.VITE_DEV_MEMORY_STORE' > "$T/flag/assets/index.js"
  echo 'ok' > "$T/named/assets/dev-store-abc.js"
  echo 'ok' > "$T/capname/capture-harness.html"
  echo 'x=window.__captureHarness' > "$T/capmark/assets/index.js"
  bash "$self" "$T/clean" >/dev/null 2>&1 || { echo "check_no_dev_store_in_build self-test: a clean build was rejected" >&2; exit 1; }
  expect_fail "$T/marker" "the banner copy"
  expect_fail "$T/flag" "the dev flag name"
  expect_fail "$T/named" "a dev-store file name"
  expect_fail "$T/capname" "a capture-harness file name"
  expect_fail "$T/capmark" "the capture harness hook"
  expect_fail "$T/missing" "a missing directory"
  echo "check_no_dev_store_in_build: self-test OK"
  exit 0
fi

DIR="${1:-$ROOT/apps/web/dist}"

if [ ! -d "$DIR" ]; then
  echo "check_no_dev_store_in_build: $DIR does not exist; build first (pnpm build)." >&2
  exit 2
fi

fail=0

names="$(find "$DIR" -type f \( -iname '*storage-harness*' -o -iname '*capture-harness*' -o -iname '*dev-store*' -o -iname '*memory-store*' \) -print)"
if [ -n "$names" ]; then
  echo "check_no_dev_store_in_build: dev storage file(s) in the build:" >&2
  echo "$names" >&2
  fail=1
fi

hits="$(grep -rlE 'DEV, not encrypted|VITE_DEV_MEMORY_STORE|data-dev-store-banner|__harness|__captureHarness|storage-harness|capture-harness' "$DIR" || true)"
if [ -n "$hits" ]; then
  echo "check_no_dev_store_in_build: dev store or harness code in the build:" >&2
  echo "$hits" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "The unencrypted dev store and the harness must not ship. Check create-app-store.ts and vite.config.ts." >&2
  exit 1
fi
echo "check_no_dev_store_in_build: OK ($DIR has no dev store, banner or harness)."
