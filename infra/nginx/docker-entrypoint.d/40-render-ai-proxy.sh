#!/bin/sh
# Renders the instance-wide AI proxy for THIS container start (docs/self-host.md "Offer AI to
# everyone on your instance"). Runs after the image's envsubst step (20-) and the service-worker
# step (30-), so the key scan at the end can look at every file the container rendered.
#
# Three files land in /tmp (a tmpfs under a read-only root), which nginx.conf and the server
# block include:
#   ai-nutrition-coach-ai-main.inc       main context: load_module for njs (or a comment)
#   ai-nutrition-coach-ai-http.inc       http context: rate-limit zones, the njs import (or a comment)
#   ai-nutrition-coach-ai-locations.inc  server context: /ai/config.json, /ai/v1/chat/completions
#
# Off (the default): AI_PROXY_ENABLED is not 1, or AI_PROXY_KEY is empty. The locations file then
# only says `{"enabled":false}` and answers 404 under /ai/: no proxy_pass, no resolver, no key.
#
# On: AI_PROXY_ENABLED=1 plus
#   AI_PROXY_UPSTREAM   https://host[:port][/path]   the OpenAI-compatible base (no trailing /chat/completions)
#   AI_PROXY_KEY        the provider key. It reaches ONLY the locations file (mode 0600), through the
#                       environment of awk, never a command line, a log line or a message of this script.
#   AI_PROXY_MODEL      forced into every request by njs (the client cannot choose another)
#   optional: AI_PROXY_TRANSCRIPTION=1 also offers POST /ai/v1/audio/transcriptions (voice to text;
#   default off) with AI_PROXY_TRANSCRIPTION_MODEL (default whisper-1, validated by njs: the client
#   must send exactly this model), AI_PROXY_TRANSCRIPTION_RATE (default 6r/m per client address),
#   AI_PROXY_TRANSCRIPTION_RATE_ALL (default 20r/m for the whole instance) and
#   AI_PROXY_TRANSCRIPTION_BURST (default 2).
#   optional: AI_PROXY_LABEL (shown to people; default: the upstream host), AI_PROXY_RATE (default
#   10r/m per client address), AI_PROXY_RATE_ALL (default 30r/m for the whole instance),
#   AI_PROXY_BURST (default 5), AI_PROXY_CONN (concurrent requests per address, default 2),
#   AI_PROXY_MAX_TOKENS (default 2000), AI_PROXY_TOKEN_PARAM (max_tokens, or max_completion_tokens
#   for reasoning models), AI_PROXY_RESOLVER (default: the first plain nameserver of /etc/resolv.conf).
# Every value is validated against a strict pattern; an invalid value refuses to start, like a
# bad AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (05-validate-csp.sh). Error messages name the variable
# and never print its value.
#
# After rendering, the script verifies that the locations file is mode 0600 and that the key appears
# in NO other rendered file (the access-log format, the headers, the main config).
#
# Overridable for tests: AI_PROXY_OUT_DIR, AI_PROXY_TEMPLATE_DIR, AI_PROXY_RESOLV_CONF.
set -eu
# Never trace: `sh -x` would print the key.
set +x
umask 077

out="${AI_PROXY_OUT_DIR:-/tmp}"
tpl="${AI_PROXY_TEMPLATE_DIR:-/etc/ai-nutrition-coach/ai-proxy}"
resolv="${AI_PROXY_RESOLV_CONF:-/etc/resolv.conf}"

main_inc="$out/ai-nutrition-coach-ai-main.inc"
httpctx_inc="$out/ai-nutrition-coach-ai-http.inc"
loc_inc="$out/ai-nutrition-coach-ai-locations.inc"

die() {
  echo "40-render-ai-proxy: refusing to start: $1" >&2
  exit 1
}

# render <template> <output>: replaces @@ANC_AI_*@@ tokens with the ANC_AI_* variables of the
# environment. awk reads them through ENVIRON, so the key is never on a command line.
render() {
  awk '
    function rep(s, k, v,   o, i) {
      o = ""
      while ((i = index(s, k)) > 0) { o = o substr(s, 1, i - 1) v; s = substr(s, i + length(k)) }
      return o s
    }
    BEGIN { n = split("URL HOST KEY MODEL CONFIG_JSON RATE RATE_ALL BURST CONN MAX_TOKENS TOKEN_PARAM RESOLVER URL_TX TX_MODEL TX_RATE TX_RATE_ALL TX_BURST", names, " ") }
    {
      line = $0
      for (j = 1; j <= n; j++) line = rep(line, "@@ANC_AI_" names[j] "@@", ENVIRON["ANC_AI_" names[j]])
      print line
    }
  ' "$1" > "$2"
  if grep -q '@@ANC_AI_' "$2"; then die "an unreplaced token is left in $2 (template and script out of step)"; fi
}

write_off() {
  printf '%s\n' '# Instance AI proxy: off (nothing to load).' > "$main_inc"
  printf '%s\n' '# Instance AI proxy: off (no zones, no njs).' > "$httpctx_inc"
  cp "$tpl/ai-proxy.disabled.inc.template" "$loc_inc"
}

enabled="${AI_PROXY_ENABLED:-0}"
key="${AI_PROXY_KEY:-}"

if [ "$enabled" != "1" ]; then
  write_off
  exit 0
fi
if [ -z "$key" ]; then
  echo "40-render-ai-proxy: AI_PROXY_ENABLED=1 but AI_PROXY_KEY is empty: the instance AI stays OFF." >&2
  write_off
  exit 0
fi

# ── validate (never echo a value) ───────────────────────────────────────────
# `case` patterns, not grep: grep matches line by line, so a value with an embedded newline
# would pass on its first line.
is_one_line() { [ "$(printf '%s' "$1" | wc -l | tr -d ' ')" = 0 ]; }
matches() { is_one_line "$2" && printf '%s' "$2" | grep -Eq "$1"; }

matches '^[A-Za-z0-9._~+/=:-]{8,255}$' "$key" \
  || die "AI_PROXY_KEY has characters outside A-Z a-z 0-9 . _ ~ + / = : - or is not 8-255 characters long (the value is not shown)."

upstream="${AI_PROXY_UPSTREAM:-}"
upstream="${upstream%/}"
matches '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$' "$upstream" \
  || die "AI_PROXY_UPSTREAM must be https://host[:port][/path] (letters, digits . _ ~ - /; no query, no credentials), e.g. https://openrouter.ai/api/v1."
case "${upstream#https://}" in *..*|*//*) die "AI_PROXY_UPSTREAM must not contain '..' or '//'." ;; esac
host="${upstream#https://}"
host="${host%%/*}"
hostname="${host%%:*}"

model="${AI_PROXY_MODEL:-}"
matches '^[A-Za-z0-9._:/@+-]{1,128}$' "$model" \
  || die "AI_PROXY_MODEL must be 1-128 characters of A-Z a-z 0-9 . _ : / @ + - (e.g. google/gemini-2.0-flash-001)."

# The default label is the upstream host, cut to the 60 characters a label may have.
label="${AI_PROXY_LABEL:-$(printf '%s' "$hostname" | cut -c1-60)}"
matches '^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,59}$' "$label" \
  || die "AI_PROXY_LABEL must be 1-60 characters of letters, digits, spaces and . _ ( ) + - (it is shown to people)."

rate="${AI_PROXY_RATE:-10r/m}"
matches '^[1-9][0-9]{0,3}r/[sm]$' "$rate" || die "AI_PROXY_RATE must look like 10r/m or 2r/s."
rate_all="${AI_PROXY_RATE_ALL:-30r/m}"
matches '^[1-9][0-9]{0,3}r/[sm]$' "$rate_all" || die "AI_PROXY_RATE_ALL must look like 30r/m or 2r/s."
conn="${AI_PROXY_CONN:-2}"
matches '^[1-9][0-9]{0,2}$' "$conn" || die "AI_PROXY_CONN must be a whole number from 1 to 999."
token_param="${AI_PROXY_TOKEN_PARAM:-max_tokens}"
case "$token_param" in max_tokens|max_completion_tokens) ;; *) die "AI_PROXY_TOKEN_PARAM must be max_tokens or max_completion_tokens." ;; esac
burst="${AI_PROXY_BURST:-5}"
matches '^[0-9]{1,3}$' "$burst" || die "AI_PROXY_BURST must be a whole number up to 999."
max_tokens="${AI_PROXY_MAX_TOKENS:-2000}"
matches '^[1-9][0-9]{0,4}$' "$max_tokens" || die "AI_PROXY_MAX_TOKENS must be a whole number up to 99999."

# The first nameserver that is a plain address (a scoped one such as fe80::1%eth0 is skipped).
# nginx resolves the provider through THIS server only: /etc/hosts and `--add-host` are ignored.
resolver="${AI_PROXY_RESOLVER:-}"
if [ -z "$resolver" ] && [ -r "$resolv" ]; then
  for ns in $(awk '$1 == "nameserver" { print $2 }' "$resolv"); do
    if printf '%s' "$ns" | grep -Eq '^[0-9A-Fa-f:.]{2,45}$'; then resolver="$ns"; break; fi
  done
fi
matches '^[0-9A-Fa-f:.]{2,45}$' "$resolver" \
  || die "no usable DNS server: set AI_PROXY_RESOLVER to an IP address (nginx resolves the provider at request time)."
case "$resolver" in *:*) resolver="[$resolver]" ;; esac

# Voice transcription: off unless AI_PROXY_TRANSCRIPTION=1 exactly.
tx="${AI_PROXY_TRANSCRIPTION:-0}"
tx_model="${AI_PROXY_TRANSCRIPTION_MODEL:-whisper-1}"
tx_rate="${AI_PROXY_TRANSCRIPTION_RATE:-6r/m}"
tx_rate_all="${AI_PROXY_TRANSCRIPTION_RATE_ALL:-20r/m}"
tx_burst="${AI_PROXY_TRANSCRIPTION_BURST:-2}"
# Only validated when the voice route is on: a bad value must not stop the chat proxy.
if [ "$tx" = "1" ]; then
  matches '^[A-Za-z0-9._:/@+-]{1,128}$' "$tx_model" \
    || die "AI_PROXY_TRANSCRIPTION_MODEL must be 1-128 characters of A-Z a-z 0-9 . _ : / @ + - (e.g. whisper-1)."
  matches '^[1-9][0-9]{0,3}r/[sm]$' "$tx_rate" || die "AI_PROXY_TRANSCRIPTION_RATE must look like 6r/m or 1r/s."
  matches '^[1-9][0-9]{0,3}r/[sm]$' "$tx_rate_all" || die "AI_PROXY_TRANSCRIPTION_RATE_ALL must look like 20r/m or 1r/s."
  matches '^[0-9]{1,3}$' "$tx_burst" || die "AI_PROXY_TRANSCRIPTION_BURST must be a whole number up to 999."
else
  # Off: the (unused) zones still render, so ignore whatever was set and use the defaults.
  tx_model="whisper-1"; tx_rate="6r/m"; tx_rate_all="20r/m"; tx_burst="2"
fi

# A value must not contain a placeholder of its own (substitution is not re-entrant).
for v in "$key" "$upstream" "$model" "$label" "$rate" "$rate_all" "$resolver" "$tx_model" "$tx_rate" "$tx_rate_all"; do
  case "$v" in *@@*) die "an AI_PROXY_* value contains '@@' (the value is not shown)." ;; esac
done

# ── render ──────────────────────────────────────────────────────────────────
ANC_AI_URL="$upstream/chat/completions"
ANC_AI_HOST="$host"
ANC_AI_KEY="$key"
ANC_AI_MODEL="$model"
ANC_AI_URL_TX="$upstream/audio/transcriptions"
ANC_AI_TX_MODEL="$tx_model"
ANC_AI_TX_RATE="$tx_rate"
ANC_AI_TX_RATE_ALL="$tx_rate_all"
ANC_AI_TX_BURST="$tx_burst"
if [ "$tx" = "1" ]; then
  ANC_AI_CONFIG_JSON="{\"enabled\":true,\"model\":\"$model\",\"label\":\"$label\",\"transcription\":true,\"transcriptionModel\":\"$tx_model\"}"
else
  ANC_AI_CONFIG_JSON="{\"enabled\":true,\"model\":\"$model\",\"label\":\"$label\",\"transcription\":false}"
fi
ANC_AI_RATE="$rate"
ANC_AI_BURST="$burst"
ANC_AI_RATE_ALL="$rate_all"
ANC_AI_CONN="$conn"
ANC_AI_TOKEN_PARAM="$token_param"
ANC_AI_MAX_TOKENS="$max_tokens"
ANC_AI_RESOLVER="$resolver"
export ANC_AI_URL ANC_AI_HOST ANC_AI_KEY ANC_AI_MODEL ANC_AI_CONFIG_JSON ANC_AI_RATE ANC_AI_RATE_ALL \
  ANC_AI_BURST ANC_AI_CONN ANC_AI_MAX_TOKENS ANC_AI_TOKEN_PARAM ANC_AI_RESOLVER \
  ANC_AI_URL_TX ANC_AI_TX_MODEL ANC_AI_TX_RATE ANC_AI_TX_RATE_ALL ANC_AI_TX_BURST

printf '%s\n' 'load_module /usr/lib/nginx/modules/ngx_http_js_module.so;' > "$main_inc"
render "$tpl/ai-proxy.http.inc.template" "$httpctx_inc"
render "$tpl/ai-proxy.locations.inc.template" "$loc_inc"
if [ "$tx" = "1" ]; then
  # The voice route is appended to the SAME private file (it holds the key too). nginx matches the
  # exact-path location whatever its position, so it wins over the /ai/ catch-all before it.
  render "$tpl/ai-proxy.transcription.inc.template" "$loc_inc.tx"
  cat "$loc_inc.tx" >> "$loc_inc"
  rm -f "$loc_inc.tx"
fi
unset ANC_AI_KEY

# ── verify: the key is in exactly one file, and that file is private ────────
chmod 600 "$loc_inc" "$httpctx_inc" "$main_inc"
mode="$(stat -c %a "$loc_inc" 2>/dev/null || stat -f %Lp "$loc_inc")"
[ "$mode" = 600 ] || die "the rendered proxy config is mode $mode, not 600."

leaks=""
for f in "$out"/ai-nutrition-coach*; do
  [ -e "$f" ] || continue
  [ "$f" = "$loc_inc" ] && continue
  if printf '%s\n' "$key" | grep -rlF -f - "$f" >/dev/null 2>&1; then leaks="$leaks ${f##*/}"; fi
done
[ -z "$leaks" ] || die "the provider key leaked into:$leaks."

if [ "$tx" = "1" ]; then
  echo "40-render-ai-proxy: instance AI proxy on for $hostname (model $model, voice transcription $tx_model)." >&2
else
  echo "40-render-ai-proxy: instance AI proxy on for $hostname (model $model)." >&2
fi
exit 0
