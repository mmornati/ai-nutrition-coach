#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# The single "is this change verified?" gate (security review B2).
#
#   scripts/verify.sh              format:check, analyze (infos fatal), test,
#                                  the release web build, the secrets scan
#                                  of that build (S1: no key-shaped string may
#                                  be compiled into a bundle) and the
#                                  third-party host scan (N5)
#   scripts/verify.sh --with-apk   additionally `flutter build apk --debug`
#                                  (slow; needs the Android SDK platform 37 —
#                                  CI installs it, see .github/workflows/ci.yml)
#                                  and scans the APK too
#
# Everything runs inside the pinned toolchain image via flutter_docker.sh.
# The autonomous loop must see this exit 0 before marking a story committed.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_APK=0
for arg in "$@"; do
  case "$arg" in
    --with-apk) WITH_APK=1 ;;
    *) echo "usage: $0 [--with-apk]" >&2; exit 2 ;;
  esac
done

run() {
  echo "▶ $*"
  "$ROOT/scripts/flutter_docker.sh" "$@"
}

run melos bootstrap
run melos run format:check
run melos run analyze
run melos run test
run bash tools/check_no_secrets_in_build.sh --self-test
run bash tools/check_no_external_hosts.sh --self-test
# build:web builds the bundle and scans it (secrets --web-only, then the
# third-party host scan) as its last steps.
run melos run build:web

if [[ "$WITH_APK" -eq 1 ]]; then
  run bash -c 'yes | sdkmanager --licenses >/dev/null || true; sdkmanager "platforms;android-37.0" >/dev/null; cd apps/client && flutter build apk --debug'
  run bash tools/check_no_secrets_in_build.sh
fi

echo "✓ verify: all gates passed"
