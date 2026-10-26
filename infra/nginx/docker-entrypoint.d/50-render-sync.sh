#!/bin/sh
# Renders the encrypted-backup relay's proxy for THIS container start (docs/self-host.md
# "Encrypted backup on your own server"). Runs after the image's envsubst step and the AI proxy step.
#
# Two files land in /tmp (a tmpfs under a read-only root):
#   ai-nutrition-coach-sync-http.inc        http context: the connection-limit zone (a comment when off)
#   ai-nutrition-coach-sync-locations.inc   server context: /sync/config.json and /sync/v1/...
#
# Off (the default): AI_NUTRITION_COACH_SYNC is not 1. The file then only answers 404 under /sync/:
# no proxy_pass, no resolver. The app reads that as "no relay offered" and shows nothing about sync.
#
# On: AI_NUTRITION_COACH_SYNC=1, with the relay container (compose profile `sync`, service
# `sync-relay`) on the same network. Optional:
#   SYNC_RELAY_HOST    the relay's name on that network (default sync-relay)
#   SYNC_RELAY_PORT    its port (default 4100)
#   SYNC_MAX_VAULT_MB  the largest vault in MB (default 20; the same value the relay reads), which
#                      sets the largest request body this server lets through
#   SYNC_RESOLVER      a DNS server IP (default: the first plain nameserver of /etc/resolv.conf,
#                      Docker's embedded resolver on a compose network)
# Every value is validated against a strict pattern; an invalid one refuses to start, like a bad
# AI_NUTRITION_COACH_CONNECT_SRC_EXTRA. Messages name the variable and never print its value.
#
# Overridable for tests: SYNC_OUT_DIR, SYNC_TEMPLATE_DIR, SYNC_RESOLV_CONF.
set -eu
set +x
umask 077

out="${SYNC_OUT_DIR:-/tmp}"
tpl="${SYNC_TEMPLATE_DIR:-/etc/ai-nutrition-coach/sync}"
resolv="${SYNC_RESOLV_CONF:-/etc/resolv.conf}"
loc_inc="$out/ai-nutrition-coach-sync-locations.inc"
zone_inc="$out/ai-nutrition-coach-sync-http.inc"

die() {
  echo "50-render-sync: refusing to start: $1" >&2
  exit 1
}

if [ "${AI_NUTRITION_COACH_SYNC:-0}" != "1" ]; then
  cp "$tpl/sync.disabled.inc.template" "$loc_inc"
  printf '%s\n' '# Encrypted-backup relay off: no http-level directives.' > "$zone_inc"
  exit 0
fi

is_one_line() { [ "$(printf '%s' "$1" | wc -l | tr -d ' ')" = 0 ]; }
matches() { is_one_line "$2" && printf '%s' "$2" | grep -Eq "$1"; }

host="${SYNC_RELAY_HOST:-sync-relay}"
matches '^[A-Za-z0-9]([A-Za-z0-9.-]{0,61}[A-Za-z0-9])?$' "$host" \
  || die "SYNC_RELAY_HOST must be a host name (letters, digits, dots and dashes)."
port="${SYNC_RELAY_PORT:-4100}"
matches '^[1-9][0-9]{0,4}$' "$port" || die "SYNC_RELAY_PORT must be a port number."
[ "$port" -le 65535 ] || die "SYNC_RELAY_PORT must be a port number."
mb="${SYNC_MAX_VAULT_MB:-20}"
matches '^[1-9][0-9]?$' "$mb" || die "SYNC_MAX_VAULT_MB must be a whole number from 1 to 24."
[ "$mb" -le 24 ] || die "SYNC_MAX_VAULT_MB must be a whole number from 1 to 24."
# Base64url and JSON make a body a third larger than the ciphertext; a few KB for the rest.
body="$(( (mb * 1024 * 1024 * 4 + 2) / 3 / 1024 + 8 ))k"

resolver="${SYNC_RESOLVER:-}"
if [ -z "$resolver" ] && [ -r "$resolv" ]; then
  for ns in $(awk '$1 == "nameserver" { print $2 }' "$resolv"); do
    if printf '%s' "$ns" | grep -Eq '^[0-9A-Fa-f:.]{2,45}$'; then resolver="$ns"; break; fi
  done
fi
matches '^[0-9A-Fa-f:.]{2,45}$' "$resolver" \
  || die "no usable DNS server: set SYNC_RESOLVER to an IP address (nginx resolves the relay at request time)."
case "$resolver" in *:*) resolver="[$resolver]" ;; esac

# A value must not contain a placeholder of its own (substitution is not re-entrant).
for v in "$host" "$resolver"; do
  case "$v" in *@@*) die "a SYNC_* value contains '@@' (the value is not shown)." ;; esac
done

awk -v host="$host" -v port="$port" -v body="$body" -v resolver="$resolver" '
  function rep(s, k, v,   o, i) {
    o = ""
    while ((i = index(s, k)) > 0) { o = o substr(s, 1, i - 1) v; s = substr(s, i + length(k)) }
    return o s
  }
  {
    line = $0
    line = rep(line, "@@ANC_SYNC_HOST@@", host)
    line = rep(line, "@@ANC_SYNC_PORT@@", port)
    line = rep(line, "@@ANC_SYNC_BODY@@", body)
    line = rep(line, "@@ANC_SYNC_RESOLVER@@", resolver)
    print line
  }
' "$tpl/sync.locations.inc.template" > "$loc_inc"
if grep -q '@@ANC_SYNC_' "$loc_inc"; then die "an unreplaced token is left in the rendered config (template and script out of step)."; fi
cp "$tpl/sync.http.inc.template" "$zone_inc"
echo "50-render-sync: encrypted-backup relay proxied to $host:$port (vaults up to ${mb} MB)." >&2
exit 0
