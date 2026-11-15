#!/bin/sh
# Renders the real-client-address configuration for THIS container start into
# /tmp/ai-nutrition-coach-real-ip.inc, which /etc/nginx/nginx.conf includes in the http block.
# The root filesystem is read-only, so the file lives in /tmp like the rest of the rendered config.
#
# Behind Traefik, Caddy or cloudflared every request reaches nginx from the proxy's address, so
# every per-address limit (the AI proxy's rate and connection limits, the relay's connection cap,
# the address the relay limits its signups and logins on) collapses into one bucket for the whole
# household. Telling nginx which peers to believe makes it read the real client address from a
# header those peers set.
#
# Off (the default): AI_NUTRITION_COACH_TRUSTED_PROXIES is empty or unset. The file is a comment and
# nginx behaves exactly as before: the address is the peer's.
#
# On:
#   AI_NUTRITION_COACH_TRUSTED_PROXIES  comma-separated addresses or CIDRs of the proxies whose
#                                       header may be believed, e.g. 172.18.0.5/32 (the proxy
#                                       container; a whole shared subnet lets every container on
#                                       it forge the address). Broad ranges are refused: IPv4
#                                       shorter than /8, IPv6 shorter than /16 (0.0.0.0/0 and
#                                       ::/0 included); they would let any visitor choose the
#                                       address every limit is keyed on.
#   AI_NUTRITION_COACH_REAL_IP_HEADER   X-Forwarded-For (default), CF-Connecting-IP or X-Real-IP.
#                                       With X-Forwarded-For the list is read from the right, past
#                                       every trusted proxy (real_ip_recursive on).
# Every value is validated against a strict pattern; an invalid one refuses to start, like a bad
# AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (05-validate-csp.sh). Messages name the variable and never
# print its value.
#
# Overridable for tests: AI_NUTRITION_COACH_REAL_IP_OUT.
set -eu
set +x
umask 077

out="${AI_NUTRITION_COACH_REAL_IP_OUT:-/tmp/ai-nutrition-coach-real-ip.inc}"
proxies="${AI_NUTRITION_COACH_TRUSTED_PROXIES:-}"
header="${AI_NUTRITION_COACH_REAL_IP_HEADER:-X-Forwarded-For}"

die() {
  echo "45-render-real-ip: refusing to start: $1" >&2
  exit 1
}

# A value with a newline or any character outside the set below could add a directive.
# (The trailing # survives $(...), which would otherwise strip a final newline.)
only() { [ "$(printf '%s#' "$2" | LC_ALL=C tr -d "$1")" = '#' ]; }

if [ -z "$proxies" ]; then
  printf '%s\n' '# AI_NUTRITION_COACH_TRUSTED_PROXIES is not set: the client address is the peer address.' > "$out"
  exit 0
fi

only 'A-Za-z0-9.:/, ' "$proxies" \
  || die "AI_NUTRITION_COACH_TRUSTED_PROXIES must be comma-separated IP addresses or CIDRs (got an invalid value)."

case "$header" in
  X-Forwarded-For | x-forwarded-for) header='X-Forwarded-For' ;;
  CF-Connecting-IP | cf-connecting-ip) header='CF-Connecting-IP' ;;
  X-Real-IP | x-real-ip) header='X-Real-IP' ;;
  *) die "AI_NUTRITION_COACH_REAL_IP_HEADER must be X-Forwarded-For, CF-Connecting-IP or X-Real-IP." ;;
esac

# One entry is an IPv4 address (octets 0-255) or an IPv6 address, with an optional prefix length.
# A prefix that broad would trust (half of) the Internet and is refused: IPv4 shorter than /8,
# IPv6 shorter than /16. Returns 1 for a malformed entry, 2 for one that is too broad.
valid_entry() {
  e="$1"
  addr="${e%%/*}"
  prefix=''
  case "$e" in */*) prefix="${e#*/}" ;; esac
  case "$e" in */*/*) return 1 ;; esac
  if printf '%s' "$addr" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
    for o in $(printf '%s' "$addr" | tr '.' ' '); do
      [ "$o" -le 255 ] || return 1
    done
    max=32
    min=8
  elif printf '%s' "$addr" | grep -Eq '^[0-9A-Fa-f:]{2,39}$' \
    && printf '%s' "$addr" | grep -q ':' \
    && ! printf '%s' "$addr" | grep -Eq ':::|::.*::|[0-9A-Fa-f]{5}|^:[^:]|[^:]:$' \
    && [ "$(printf '%s' "$addr" | tr -cd ':' | wc -c | tr -d ' ')" -le 7 ] \
    && { printf '%s' "$addr" | grep -q '::' || [ "$(printf '%s' "$addr" | tr -cd ':' | wc -c | tr -d ' ')" -eq 7 ]; }; then
    max=128
    min=16
  else
    return 1
  fi
  case "$e" in
    */*)
      printf '%s' "$prefix" | grep -Eq '^[0-9]{1,3}$' || return 1
      [ "$prefix" -le "$max" ] || return 1
      [ "$prefix" -ge "$min" ] || return 2
      ;;
  esac
  return 0
}

# `for` over a comma-split value drops a trailing empty field: refuse it here instead.
squeezed="$(printf '%s' "$proxies" | tr -d ' ')"
case "$squeezed" in
  '' | , | ,* | *, | *,,*) die "AI_NUTRITION_COACH_TRUSTED_PROXIES has an empty entry." ;;
esac

count=0
body=''
set -f # no globbing while splitting
oldifs="$IFS"
IFS=','
for entry in $proxies; do
  IFS="$oldifs"
  entry="$(printf '%s' "$entry" | tr -d ' ')"
  [ -n "$entry" ] || die "AI_NUTRITION_COACH_TRUSTED_PROXIES has an empty entry."
  rc=0
  valid_entry "$entry" || rc=$?
  [ "$rc" -ne 2 ] || die "AI_NUTRITION_COACH_TRUSTED_PROXIES has a range that is too broad (IPv4 prefixes shorter than /8 and IPv6 prefixes shorter than /16 are refused); list your proxy's own address or a narrower network (the value is not shown)."
  [ "$rc" -eq 0 ] || die "AI_NUTRITION_COACH_TRUSTED_PROXIES has an entry that is not an IP address or CIDR (the value is not shown)."
  count=$((count + 1))
  [ "$count" -le 32 ] || die "AI_NUTRITION_COACH_TRUSTED_PROXIES lists more than 32 entries."
  body="${body}set_real_ip_from ${entry};
"
  IFS=','
done
IFS="$oldifs"

{
  echo "# AI_NUTRITION_COACH_TRUSTED_PROXIES is set: the client address is read from $header when the"
  echo "# request comes from one of these peers (and only then)."
  printf '%s' "$body"
  echo "real_ip_header $header;"
  echo "real_ip_recursive on;"
} > "$out"
echo "45-render-real-ip: the client address is read from $header for $count trusted proxy entr$([ "$count" = 1 ] && echo y || echo ies)." >&2
exit 0
