#!/bin/sh
# Runs before the image's envsubst step (20-envsubst-on-templates.sh).
#
# OPENPLATE_CONNECT_SRC_EXTRA is substituted into the Content-Security-Policy
# header. An unvalidated value could close the quote/directive and rewrite the
# policy (`'; script-src *`), so refuse to start unless every entry is a plain
# origin: https://host[:port] (or http://localhost[:port] for a local model),
# separated by spaces. No quotes, semicolons, wildcards, newlines, paths.
set -eu

v="${OPENPLATE_CONNECT_SRC_EXTRA:-}"

die() {
  echo "05-validate-csp: refusing to start: OPENPLATE_CONNECT_SRC_EXTRA must be space-separated https://host[:port] origins (got an invalid value)." >&2
  exit 1
}

# Only these characters may appear at all (a newline or tab is not in the set).
# (The trailing # survives $(...), which would otherwise strip a final newline.)
rest="$(printf '%s#' "$v" | LC_ALL=C tr -d 'A-Za-z0-9.:/ -')"
[ "$rest" = '#' ] || die

set -f # no globbing while splitting
for token in $v; do
  case "$token" in
    https://*) body="${token#https://}" ;;
    http://localhost | http://localhost:*) body="${token#http://}" ;;
    *) die ;;
  esac
  printf '%s' "$body" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?$' || die
done
exit 0
