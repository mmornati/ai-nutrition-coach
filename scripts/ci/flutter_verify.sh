#!/usr/bin/env bash
# Flutter gate: one bootstrap, then every check ci.yml (verify), release-gate.yml
# and ndp-review.yml run — each of those used to bootstrap and re-run
# analyze + test on its own.
#
# Toolchain: ghcr.io/cirruslabs/flutter:3.44.0 (pinned by digest in the CI
# config; keep in sync with scripts/flutter_docker.sh and infra/Dockerfile).
#
#   CI_TAG                   set to the git tag on tag builds (v*): also runs the
#                            project-URL release check (needs
#                            AI_NUTRITION_COACH_PROJECT_URL when overriding it)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

step() { printf '\n▶ %s\n' "$*"; }

step 'Toolchain'
flutter --version
dart --version

step 'Named-reviewer gate'
bash scripts/ci/ndp_owners.sh

step 'melos'
flutter pub global activate melos 8.2.2
export PATH="$HOME/.pub-cache/bin:$PATH"
melos bootstrap

step 'Committed lockfile is unchanged'
git config --global --add safe.directory "$PWD"
git diff --exit-code -- pubspec.lock

step 'Format';                 melos run format:check
step 'Analyze (Gate A)';       melos run analyze
step 'Test (Gate A)';          melos run test
step 'Test, DST zone (F3)';    melos run test:dst
step 'Telemetry (Gate D, N6)'; melos run check:telemetry
step 'Release posture (Gate C)'; melos run check:release-posture

if [[ "${CI_TAG:-}" == v* ]]; then
  step 'Project URL (release tag)'
  AI_NUTRITION_COACH_BUILD=release dart run tools/check_release_posture.dart --project-url-only
fi

step 'Build web (release)'
bash scripts/fetch_web_sqlite.sh
bash scripts/fetch_web_zxing.sh
(cd apps/client && flutter build web --release --pwa-strategy=none --no-web-resources-cdn --dart-define=AI_NUTRITION_COACH_BUILD=selfhost)
dart run tools/generate_precache_manifest.dart apps/client/build/web

step 'Secrets scan — web bundle (S1)'
bash tools/check_no_secrets_in_build.sh --self-test
bash tools/check_no_secrets_in_build.sh --web-only

step 'Third-party host scan — web bundle (N5)'
bash tools/check_no_external_hosts.sh --self-test
bash tools/check_no_external_hosts.sh

echo 'flutter verify: PASS'
