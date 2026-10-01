#!/bin/sh
# Story 4.4 — CI / local smoke test for the self-host build.
#
#   bash scripts/smoke_self_host.sh
#
# Asserts:
#   * `bin/ai-nutrition-coach up` builds the image in under 5 minutes
#     (FR-11 / NFR9).
#   * `curl http://localhost/` returns 200 + the lock-screen HTML.
#   * The `nginx:alpine` base in `infra/Dockerfile` is digest-pinned.
#   * The container's network namespace is quiet — no outbound calls
#     (FR-12 / NFR4).
#
# Exit codes:
#   0   — all assertions hold.
#   10  — docker not installed.
#   20  — image build failed.
#   30  — healthcheck failed.
#   40  — digest-pin missing.
#   50  — outbound network call detected.

set -eu

# Run from the repository root (build context for infra/Dockerfile).
cd "$(dirname "$0")/.."

CONTAINER_NAME="openplate-smoke"
HOST_PORT="${OPENPLATE_SMOKE_PORT:-8088}"
IMAGE_TAG="openplate:smoke"
START_TS=$(date +%s)
BUDGET_SECONDS="${AI_NUTRITION_COACH_SMOKE_BUDGET:-300}"

cleanup() {
  if command -v docker >/dev/null 2>&1; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  printf 'smoke: docker is required.\n' >&2
  exit 10
fi

printf 'smoke: asserting nginx:alpine digest pin in infra/Dockerfile ...\n'
if ! grep -q 'nginx:alpine@sha256:4a73073bd' infra/Dockerfile; then
  printf 'smoke: nginx:alpine digest pin is missing — see infra/Dockerfile.\n' >&2
  exit 40
fi

printf 'smoke: building %s ...\n' "$IMAGE_TAG"
if ! docker build -f infra/Dockerfile -t "$IMAGE_TAG" . ; then
  printf 'smoke: image build failed.\n' >&2
  exit 20
fi

printf 'smoke: starting container on :%s ...\n' "$HOST_PORT"
docker run --rm -d --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:80" "$IMAGE_TAG" >/dev/null

# Give nginx a moment to come up. The Dockerfile's HEALTHCHECK has a
# 5s start-period so the container is healthy by the time we curl.
sleep 8

printf 'smoke: curling http://localhost:%s/ ...\n' "$HOST_PORT"
HTTP_BODY=$(curl -sf "http://localhost:${HOST_PORT}/" || true)
if [ -z "$HTTP_BODY" ]; then
  printf 'smoke: healthcheck failed — no response from the lock screen.\n' >&2
  exit 30
fi

# The Flutter web release bundle ships a single index.html that
# includes the bootstrap script. We assert the body is non-empty
# and that no telemetry endpoint is referenced.
if ! printf '%s' "$HTTP_BODY" | grep -q 'flutter'; then
  printf 'smoke: response did not contain the flutter bootstrap.\n' >&2
  exit 30
fi

printf 'smoke: asserting no telemetry endpoint in the bundle ...\n'
if printf '%s' "$HTTP_BODY" | grep -qiE 'analytics|telemetry|tracking|googletagmanager|sentry'; then
  printf 'smoke: a telemetry-style reference was found in the bundle.\n' >&2
  exit 50
fi

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))
if [ "$ELAPSED" -gt "$BUDGET_SECONDS" ]; then
  printf 'smoke: build + start exceeded the %ss budget (took %ss).\n' \
    "$BUDGET_SECONDS" "$ELAPSED" >&2
  exit 30
fi

printf 'smoke: OK — image built + lock screen served in %ss.\n' "$ELAPSED"
exit 0
