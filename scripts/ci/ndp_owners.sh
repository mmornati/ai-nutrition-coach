#!/usr/bin/env bash
# Named-reviewer gate (Story 5.3 / FR-15): REVIEWERS.md and .github/CODEOWNERS
# exist at HEAD, and every owner CODEOWNERS names is recorded in REVIEWERS.md.
# Forking the repo and replacing the placeholder handle needs no change here.
# (An owner is a whitespace-delimited @handle; e-mail owners are not matched.)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

test -f REVIEWERS.md || { echo 'ndp-review: REVIEWERS.md missing — see Story 5.3 / FR-15.'; exit 1; }
test -f .github/CODEOWNERS || { echo 'ndp-review: .github/CODEOWNERS missing — see Story 5.3 / FR-15.'; exit 1; }
owners=$(grep -v '^[[:space:]]*#' .github/CODEOWNERS | grep -oE '(^|[[:space:]])@[A-Za-z0-9_./-]+' | sed -E 's/^[[:space:]]+//' | sort -u)
test -n "$owners" || { echo 'ndp-review: CODEOWNERS names no owner.'; exit 1; }
for o in $owners; do
  esc=$(printf '%s' "$o" | sed 's/[.[\*^$/]/\\&/g')
  grep -qE "(^|[^A-Za-z0-9_./@-])${esc}([^A-Za-z0-9_./-]|$)" REVIEWERS.md \
    || { echo "ndp-review: CODEOWNERS owner $o is not recorded in REVIEWERS.md."; exit 1; }
done
echo 'ndp-review: REVIEWERS.md + CODEOWNERS at HEAD.'
