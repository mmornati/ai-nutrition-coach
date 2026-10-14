#!/usr/bin/env bash
# Main gate: `pnpm verify` (format, lint, types, unit tests, DST re-run, posture
# gates, scanner self-tests, release build, bundle scans, build guards), the
# release bundle's service worker, and the named-reviewer check. One install
# covers what GitHub split across ci.yml (verify), release-gate.yml and
# ndp-review.yml: verify already runs `pnpm gates`.
#
# Toolchain: Node 24 with corepack (pnpm comes from package.json
# "packageManager").
#
#   CI_TAG   set to the git tag on tag builds (v*): also runs the project-URL
#            release check (AI_NUTRITION_COACH_PROJECT_URL overrides the URL)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# shellcheck source=scripts/ci/pnpm.sh
source scripts/ci/pnpm.sh

bash scripts/ci/ndp_owners.sh
pnpm install --frozen-lockfile
pnpm verify
test -f apps/web/dist/sw.js && test -f apps/web/dist/precache-manifest.json

if [[ "${CI_TAG:-}" == v* ]]; then
  AI_NUTRITION_COACH_BUILD=release node tools/check_project_url.mjs
fi

echo 'verify: PASS'
