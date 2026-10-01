#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# Run an arbitrary command inside the pinned Flutter toolchain image.
#
#   scripts/flutter_docker.sh <command> [args...]
#   scripts/flutter_docker.sh flutter --version
#   scripts/flutter_docker.sh bash -lc 'melos bootstrap && melos run test'
#
# The repo root is mounted at /work; pub-cache persists in a named volume.
# Files written by the container are chowned back to the invoking user.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Single source of truth for the toolchain version (keep in sync with
# infra/Dockerfile, .github/workflows/*, CONTRIBUTING.md).
FLUTTER_VERSION="3.44.0"
FLUTTER_IMAGE_DIGEST="sha256:46691e311715845de03a3ba4753a475476936805b29431b1f00f1816981033f8"
IMAGE="${OPENPLATE_FLUTTER_IMAGE:-ghcr.io/cirruslabs/flutter:${FLUTTER_VERSION}@${FLUTTER_IMAGE_DIGEST}}"
PUB_VOLUME="${OPENPLATE_PUB_VOLUME:-openplate_pubcache}"

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <command> [args...] | --print-image" >&2
  exit 2
fi

if [[ "$1" == "--print-image" ]]; then
  echo "$IMAGE"
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Quote each argument so it survives the `bash -c` re-parse below.
quoted=""
for a in "$@"; do
  quoted+=" $(printf '%q' "$a")"
done

if [[ -n "${OPENPLATE_FLUTTER_IMAGE:-}" ]]; then
  echo "warning: OPENPLATE_FLUTTER_IMAGE overrides the pinned toolchain; using $IMAGE" >&2
fi

# -i keeps stdin attached (piped input works); -t only when stdin is a TTY.
TTY_FLAGS=(-i)
if [[ -t 0 && -t 1 ]]; then
  TTY_FLAGS=(-i -t)
fi

exec docker run --rm "${TTY_FLAGS[@]}" \
  -v "$ROOT":/work -w /work \
  -v "$PUB_VOLUME":/root/.pub-cache \
  -e PATH="/root/.pub-cache/bin:/sdks/flutter/bin:/sdks/flutter/bin/cache/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/android-sdk-linux/cmdline-tools/latest/bin:/opt/android-sdk-linux/platform-tools" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "$IMAGE" \
  bash -c "trap 'chown -R \$HOST_UID:\$HOST_GID /work/pubspec.lock /work/.dart_tool /work/apps /work/packages /work/tools /work/scripts 2>/dev/null || true' EXIT;$quoted"
