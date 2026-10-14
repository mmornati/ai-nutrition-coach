#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# The single "is this change verified?" gate. A thin wrapper: the gate itself
# is `pnpm verify` (root package.json), which runs, in order:
#
#   format:check          Prettier
#   lint, typecheck       ESLint (warnings are errors) + tsc in every package
#   test                  unit tests, incl. the self-tests of the gates
#   test:dst              the suites re-run under TZ=Europe/Paris (REQUIRE_DST=1)
#   gates                 release posture (README proof table, LICENSE, CONTRIBUTING,
#                         NDP list, verify wiring, project URL), telemetry, log
#                         hygiene, adults-only, accessibility floor
#   selftest:scanners     the shell scanners and fetch scripts prove they can fail
#   build                 release build (+ precache manifest and sw.js)
#   scan:bundle           secrets scan, then third-party host scan, of apps/web/dist
#   guards                no gallery, no dev store in the bundle
#
# The autonomous loop must see this exit 0 before marking a story committed.
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -gt 0 ]]; then
  echo "usage: $0   (no arguments; see 'pnpm verify')" >&2
  exit 2
fi

pnpm install --frozen-lockfile
exec pnpm verify
