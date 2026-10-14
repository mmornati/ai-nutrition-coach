#!/usr/bin/env bash
# SPDX SBOM of the RELEASE self-host image (B6), written to
# ai-nutrition-coach-image.spdx.json. Release tags and manual runs only.
#
#   AI_NUTRITION_COACH_PROJECT_URL   optional override; the build FAILS if it is
#                                    empty-hosted or `.invalid`
#
# Toolchain: a Docker daemon.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SYFT_IMAGE="anchore/syft:v1.54.1@sha256:3eb5379ba7b409c3f4069b686110527af0c47df993fa5c10d13e7cf34f49b1aa"
OUT="ai-nutrition-coach-image.spdx.json"

docker build -f infra/Dockerfile -t ai-nutrition-coach:release \
  --build-arg AI_NUTRITION_COACH_RELEASE=1 \
  --build-arg "AI_NUTRITION_COACH_PROJECT_URL=${AI_NUTRITION_COACH_PROJECT_URL:-}" .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$SYFT_IMAGE" \
  ai-nutrition-coach:release -o spdx-json > "$OUT"
test -s "$OUT"
echo "sbom: wrote $OUT"
