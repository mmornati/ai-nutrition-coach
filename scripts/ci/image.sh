#!/usr/bin/env bash
# Self-host image gates, sharing one Docker daemon so the layer cache from the
# first build makes the later builds near-free:
#   1. infra/Dockerfile builds (from the committed pubspec.lock);
#   2. trivy: fail on fixable HIGH/CRITICAL (B6);
#   3. self-host smoke (scripts/smoke_self_host.sh, FR-11);
#   4. WebKit + Chromium browser smoke of that image (scripts/webkit_smoke.sh).
#
#   SKIP_BROWSER_SMOKE=1     stop after step 3
#
# Toolchain: a Docker daemon with network access (a VM, not docker-in-docker:
# the smoke test creates --internal networks and inspects container hardening).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Keep in step with the trivy version Dependabot proposes for the GitHub action.
TRIVY_IMAGE="aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa"
IMAGE="ai-nutrition-coach:ci"

step() { printf '\n▶ %s\n' "$*"; }

step 'Build infra/Dockerfile'
docker build -f infra/Dockerfile -t "$IMAGE" .

step 'trivy (HIGH/CRITICAL, unfixed ignored)'
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$TRIVY_IMAGE" \
  image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format table "$IMAGE"

step 'Self-host smoke'
bash scripts/smoke_self_host.sh

if [[ "${SKIP_BROWSER_SMOKE:-0}" != 1 ]]; then
  step 'Browser smoke (WebKit + Chromium)'
  AI_NUTRITION_COACH_SMOKE_IMAGE="$IMAGE" bash scripts/webkit_smoke.sh --no-build
fi

echo 'image: PASS'
