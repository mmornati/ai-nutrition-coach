#!/bin/sh
# Renders the access-log configuration for THIS container start into
# /tmp/openplate-access-log.inc, which /etc/nginx/nginx.conf includes in the
# http block (privacy audit PV9). The root filesystem is read-only, so the
# file lives in /tmp like the rest of the rendered config.
#
# OPENPLATE_ACCESS_LOG:
#   off   (default)  no access log at all.
#   on               time, METHOD + PATH (never the query string), status and
#                    size, with the client address truncated (IPv4 loses the
#                    last octet, IPv6 keeps at most the first two groups, a /32;
#                    anything that does not match logs as `::`). No
#                    User-Agent, no Referer. nginx has no built-in anonymiser,
#                    so this is a `map` of the address.
#   full             as `on`, but with the full client address (what you need
#                    to debug a firewall or allow-list problem; keep it short
#                    lived).
# The container healthcheck (127.0.0.1) is never logged. Anything else refuses
# to start, like a bad OPENPLATE_CONNECT_SRC_EXTRA (05-validate-csp.sh).
#
# Overridable for tests: OPENPLATE_ACCESS_LOG_OUT.
set -eu

mode="${OPENPLATE_ACCESS_LOG:-off}"
out="${OPENPLATE_ACCESS_LOG_OUT:-/tmp/openplate-access-log.inc}"

case "$mode" in
  off)
    printf '%s\n' '# OPENPLATE_ACCESS_LOG=off (default): nothing is logged per request.' 'access_log off;' > "$out"
    ;;
  on | full)
    if [ "$mode" = "on" ]; then
      addr='$openplate_log_ip'
    else
      addr='$remote_addr'
    fi
    cat > "$out" <<CONF
# OPENPLATE_ACCESS_LOG=$mode: minimal access log. No User-Agent, no Referer,
# no query string.
map \$remote_addr \$openplate_log_ip {
    "~^(?<net>[0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+\$"                                 \$net.0;
    "~^(?<net>[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}):"                                \$net::;
    default                                                                      ::;
}
# The container's own healthcheck (127.0.0.1) is not a request worth logging.
map \$remote_addr \$openplate_loggable {
    127.0.0.1  0;
    ::1        0;
    default    1;
}
log_format openplate '$addr [\$time_local] "\$request_method \$uri" \$status \$body_bytes_sent';
access_log /dev/stdout openplate if=\$openplate_loggable;
CONF
    ;;
  *)
    echo "10-render-access-log: refusing to start: OPENPLATE_ACCESS_LOG must be off, on or full (got an invalid value)." >&2
    exit 1
    ;;
esac
