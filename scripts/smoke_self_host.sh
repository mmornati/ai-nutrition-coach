#!/usr/bin/env bash
# Self-host smoke test (Story 4.4, hardened in Phase 4 / I8, N6).
#
#   bash scripts/smoke_self_host.sh
#
# Builds the image through `bin/ai-nutrition-coach up` (so the real run flags are what
# is tested) and asserts:
#   * the base images are digest-pinned (node build stage, nginx-unprivileged, Caddy);
#   * readiness (a poll loop, no fixed sleep) and HTTP 200 for the app shell,
#     SPA deep links, a 404 for a missing asset and 405 for POST;
#   * the versioned sqlite3mc wasm is served as application/wasm and immutable, Vite's hashed
#     assets are immutable, .mjs is a JavaScript type;
#   * the security headers (CSP, nosniff, ...) are on html, js, wasm AND worker responses,
#     `Server` carries no version, index/boot guard/manifests/sw.js are `no-cache`;
#   * every file of the precache manifest is served with exactly the bytes (SHA-256) it lists;
#   * the CSP has no 'unsafe-inline' (neither script nor style), no blanket https: connect-src;
#   * the container is non-root, has a read-only root filesystem, dropped
#     capabilities and no-new-privileges;
#   * a second `bin/ai-nutrition-coach up` fails with a clear name-collision error;
#   * EGRESS: the same hardened container, on a docker `--internal` network
#     (no outbound route), still boots and serves — i.e. it NEEDS no outbound
#     network — and the rendered nginx config contains no proxy_pass /
#     resolver (nothing in it could make a request). This shows the server is
#     self-contained; it is not a packet capture. A deliberate outbound
#     request from the container fails, so the test notices if the network
#     were not actually isolated;
#   * ACCESS LOG (privacy audit PV9): off by default - the requests above left
#     no line (and no User-Agent) in `docker logs`; AI_NUTRITION_COACH_ACCESS_LOG=on
#     logs the resolved file only, with the client address truncated, and never the
#     User-Agent, Referer or query string; a bad value refuses to start;
#   * AI_NUTRITION_COACH_CONNECT_SRC_EXTRA values that could rewrite the CSP (quote
#     injection, `;`, `*`, newline) make the container refuse to start;
#   * the AI_NUTRITION_COACH_CONNECT_SRC_EXTRA knob reaches the CSP;
#   * the compose file is valid, binds 127.0.0.1 by default, has the tls
#     profile, and the shipped bundle has no third-party hosts;
#   * the optional instance-wide AI proxy: OFF by default (/ai/config.json says
#     {"enabled":false}, the proxy path is a 404, nothing is rendered that could make a
#     request); ON against a throw-away HTTPS upstream (needs openssl): the operator's key
#     reaches the provider and the browser's Authorization/Cookie do not, the model is
#     forced, the provider's certificate is verified, a refused key is a bare 502, GET is
#     405, an oversized body 413, a burst 429, and the key lives in one 0600 file only.
#
# Exit codes: 0 ok; 10 no docker; 20 build failed; 30 readiness/HTTP failure;
#             40 pin/config assertion failed; 50 header/CSP assertion failed;
#             60 hardening assertion failed; 70 egress assertion failed.

set -euo pipefail

cd "$(dirname "$0")/.."

NAME="ai-nutrition-coach-smoke"
NET="ai-nutrition-coach-smoke-internal"
NAME_ISO="ai-nutrition-coach-smoke-iso"
PORT="${AI_NUTRITION_COACH_SMOKE_PORT:-8088}"
IMAGE="ai-nutrition-coach:smoke"
BUDGET="${AI_NUTRITION_COACH_SMOKE_BUDGET:-300}"
START_TS=$(date +%s)
TMP="$(mktemp -d)"

cleanup() {
  docker rm -f "$NAME" "$NAME_ISO" "$NAME_ISO-bad" "$NAME_ISO-kill" "$NAME_ISO-log" \
    "$NAME-aiup" "$NAME-ai" "$NAME-ai2" "$NAME-ai3" "$NAME-ai4" "$NAME-ai5" "$NAME-ai6" "$NAME-aibad" >/dev/null 2>&1 || true
  docker rmi "$IMAGE-aitest" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

fail() { # fail <exit-code> <message>
  printf 'smoke: FAIL — %s\n' "$2" >&2
  exit "$1"
}
ok() { printf 'smoke: ok — %s\n' "$1"; }

command -v docker >/dev/null 2>&1 || { printf 'smoke: docker is required.\n' >&2; exit 10; }
command -v curl >/dev/null 2>&1 || fail 10 "curl is required"
docker rm -f "$NAME" "$NAME_ISO" >/dev/null 2>&1 || true

# ── pins ────────────────────────────────────────────────────────────────────
grep -Eq '^FROM nginxinc/nginx-unprivileged:[0-9][^ @]*@sha256:[0-9a-f]{64}' infra/Dockerfile \
  || fail 40 "serve stage is not nginx-unprivileged pinned by digest (infra/Dockerfile)"
! grep -Eq '^FROM nginx:' infra/Dockerfile || fail 40 "root nginx base image still referenced"
grep -Eq '^FROM node:[0-9][^ @]*@sha256:[0-9a-f]{64} AS build' infra/Dockerfile \
  || fail 40 "build stage is not a node image pinned by version and digest (infra/Dockerfile)"
grep -q 'pnpm install --frozen-lockfile' infra/Dockerfile || fail 40 "the build stage does not install strictly from the lockfile"
pm="$(sed -n 's/.*"packageManager": "pnpm@\([0-9.]*\)".*/\1/p' package.json)"
grep -q "corepack prepare pnpm@$pm " infra/Dockerfile || fail 40 "infra/Dockerfile does not pin pnpm@$pm (package.json packageManager)"
grep -Eq 'image: caddy:[0-9][^ @]*@sha256:[0-9a-f]{64}' infra/docker-compose.yml \
  || fail 40 "Caddy is not pinned by digest (infra/docker-compose.yml)"
ok "base images pinned by digest"

# ── compose config ──────────────────────────────────────────────────────────
compose_cfg="$(docker compose -f infra/docker-compose.yml config 2>&1)" \
  || fail 40 "docker-compose.yml is invalid: $compose_cfg"
grep -q 'host_ip: 127.0.0.1' <<<"$compose_cfg" \
  || fail 40 "compose default does not bind 127.0.0.1"
! grep -q 'caddy:' <<<"$compose_cfg" || fail 40 "caddy runs without the tls profile"
AI_NUTRITION_COACH_DOMAIN=plate.example.test docker compose -f infra/docker-compose.yml --profile tls config 2>&1 \
  | grep -q 'caddy:' || fail 40 "tls profile does not define caddy"
! grep -q 'ai-nutrition-coach-data' infra/docker-compose.yml || fail 40 "compose still references the removed /data volume"
ok "compose: loopback by default, tls profile present, no /data volume"

# ── Traefik compose (docs/pwa.md): renders, no published port, right labels ──
! AI_NUTRITION_COACH_DOMAIN='' docker compose -f infra/docker-compose.traefik.yml config >/dev/null 2>&1 \
  || fail 40 "the Traefik compose renders without AI_NUTRITION_COACH_DOMAIN"
tcfg="$(AI_NUTRITION_COACH_DOMAIN=plate.example.test docker compose -f infra/docker-compose.traefik.yml config 2>&1)" \
  || fail 40 "docker-compose.traefik.yml is invalid: $tcfg"
! grep -Eq '^[[:space:]]+(ports|published|host_ip):' <<<"$tcfg" || fail 40 "the Traefik compose publishes a port"
for want in 'traefik.enable: "true"' 'Host(`plate.example.test`)' 'traefik.http.routers.ai-nutrition-coach.entrypoints: websecure' \
            'traefik.http.routers.ai-nutrition-coach.tls: "true"' 'loadbalancer.server.port: "8080"' \
            'headers.stsSeconds: "31536000"' 'headers.stsPreload: "false"' 'traefik.docker.network: traefik' \
            'external: true' 'read_only: true'; do
  grep -qF "$want" <<<"$tcfg" || fail 40 "Traefik compose lacks: $want"
done
! grep -q 'certresolver' <<<"$tcfg" || fail 40 "the Traefik compose emits a certresolver label without the overlay"
tfull="$(AI_NUTRITION_COACH_DOMAIN=plate.example.test AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER=le AI_NUTRITION_COACH_TRAEFIK_NETWORK=proxy \
  AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT=https AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST=192.168.1.0/24 \
  docker compose -f infra/docker-compose.traefik.yml -f infra/docker-compose.traefik-certresolver.yml \
  -f infra/docker-compose.traefik-allowlist.yml config 2>&1)" || fail 40 "Traefik overlays do not render: $tfull"
for want in 'tls.certresolver: le' 'name: proxy' 'entrypoints: https' 'ipallowlist.sourcerange: 192.168.1.0/24' \
            'middlewares: ai-nutrition-coach-hsts,ai-nutrition-coach-allow'; do
  grep -qF "$want" <<<"$tfull" || fail 40 "Traefik overlays lack: $want"
done
! grep -Eq '^[[:space:]]+(ports|published|host_ip):' <<<"$tfull" || fail 40 "the Traefik overlays publish a port"
rc=0
AI_NUTRITION_COACH_DOMAIN=ok.example.test AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT='web;x' bin/ai-nutrition-coach up --traefik >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 40 "bin/ai-nutrition-coach accepted a hostile AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT (exit $rc)"
rc=0
AI_NUTRITION_COACH_DOMAIN=ok.example.test AI_NUTRITION_COACH_TRAEFIK_NETWORK=ai-nutrition-coach-smoke-no-such-net bin/ai-nutrition-coach up --traefik >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 43 ]] || fail 40 "bin/ai-nutrition-coach --traefik did not report the missing network (exit $rc)"
ok "Traefik compose: no published port, HSTS-only middleware, optional overlays render, hostile input refused"

# ── build + run through the real entry point ────────────────────────────────
printf 'smoke: building and starting via bin/ai-nutrition-coach up (port %s) ...\n' "$PORT"
export AI_NUTRITION_COACH_IMAGE_TAG="$IMAGE" AI_NUTRITION_COACH_CONTAINER_NAME="$NAME" AI_NUTRITION_COACH_PORT="$PORT"
rc=0
bin/ai-nutrition-coach up >"$TMP/up.log" 2>&1 || rc=$?
if [[ "$rc" -ne 0 ]]; then
  tail -30 "$TMP/up.log" >&2
  fail 20 "bin/ai-nutrition-coach up exited $rc"
fi

# readiness loop (replaces the old fixed sleep)
BASE="http://127.0.0.1:${PORT}"
ready=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$BASE/" 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done
[[ "$ready" -eq 1 ]] || { docker logs "$NAME" 2>&1 | tail -20 >&2; fail 30 "no HTTP 200 from $BASE/ within 30s"; }
ok "ready, HTTP 200 for /"

# ── name collision ──────────────────────────────────────────────────────────
rc=0
bin/ai-nutrition-coach up >"$TMP/dup.log" 2>&1 || rc=$?
[[ "$rc" -eq 31 ]] && grep -q 'already exists' "$TMP/dup.log" \
  || fail 30 "second 'bin/ai-nutrition-coach up' did not fail with the name-collision error (exit $rc)"
ok "container name collision is reported clearly"

# ── HTTP behaviour ──────────────────────────────────────────────────────────
body="$(curl -fsS "$BASE/")"
grep -q '<div id="root">' <<<"$body" || fail 30 "index.html lacks the app root"
grep -Eq '<script type="module"[^>]* src="/assets/[^"]+\.js"' <<<"$body" || fail 30 "index.html does not load the hashed app module"
grep -Eq 'rel="manifest" href="/manifest.webmanifest"' <<<"$body" || fail 30 "index.html does not link the web manifest"
! grep -Eq '<script(\s[^>]*)?>[^<]' <<<"$body" || fail 50 "index.html contains an inline script"
# Only tags that load something count: the human description legitimately says "no tracking".
if grep -qiE '<(script|link|img|iframe)[^>]*(analytics|telemetry|tracking|googletagmanager|sentry)' <<<"$body"; then
  fail 50 "telemetry-style reference in index.html"
fi
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/board/2026-08-13")" == 200 ]] \
  || fail 30 "SPA deep link did not fall back to index.html"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/does-not-exist.png")" == 404 ]] \
  || fail 30 "missing asset did not 404 (SPA fallback is swallowing it)"
for missing in /nope.png /icons/nope.png /sqlite3mc/9.9.9/sqlite3.wasm /zxing/9.9.9/reader.js /robots.txt; do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$missing")" == 404 ]] \
    || fail 30 "missing file $missing did not 404 (it must not return the app shell)"
done
[[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/")" == 405 ]] \
  || fail 30 "POST was not rejected with 405"
# Error responses carry the security headers too, and a 404 is never publicly cacheable.
for spec in "-X POST $BASE/" "$BASE/assets/does-not-exist.png"; do
  # shellcheck disable=SC2086
  eh="$(curl -sS -D - -o /dev/null $spec | tr -d '\r')"
  for want in 'content-security-policy:' 'x-content-type-options: nosniff' 'cross-origin-opener-policy:'; do
    grep -qiF "$want" <<<"$eh" || fail 50 "error response ($spec) is missing header: $want"
  done
  ! grep -qi '^cache-control:.*public' <<<"$eh" || fail 50 "error response ($spec) is publicly cacheable"
done
ok "SPA fallback, 404 for missing assets, 405 for POST; headers on error responses"

ENTRY="$(grep -o '/assets/[^"]*\.js' <<<"$body" | head -1)"
CSS="$(grep -o '/assets/[^"]*\.css' <<<"$body" | head -1)"
[[ -n "$ENTRY" && -n "$CSS" ]] || fail 30 "index.html does not name the hashed entry script / stylesheet"
SQ="$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html/sqlite3mc' | head -1)"
[[ -n "$SQ" ]] || fail 30 "no versioned sqlite3mc engine in the image"
WASM="sqlite3mc/$SQ/sqlite3.wasm"
MJS="sqlite3mc/$SQ/sqlite3.mjs"
WORKER="$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html/assets' | grep -E '^store\.worker-.*\.js$' | head -1)"
[[ -n "$WORKER" ]] || fail 30 "no store worker chunk in the image"

hdr() { curl -sS -D - -o /dev/null "$BASE$1"; }
for path in "/" "$ENTRY" "$CSS" "/assets/$WORKER" "/boot-guard.js" "/$WASM" "/$MJS" "/manifest.webmanifest" "/sw.js" "/precache-manifest.json" "/icons/icon-192.png"; do
  h="$(hdr "$path")"
  head -1 <<<"$h" | grep -q ' 200' || fail 30 "$path did not return 200"
  for want in 'content-security-policy:' 'x-content-type-options: nosniff' 'referrer-policy: no-referrer' \
              'x-frame-options: deny' 'permissions-policy: camera=(self), microphone=(self)' \
              'cross-origin-opener-policy: same-origin' 'cross-origin-resource-policy: same-origin'; do
    tr -d '\r' <<<"$h" | grep -qiF "$want" || fail 50 "$path is missing header: $want"
  done
  tr -d '\r' <<<"$h" | grep -qi '^server: nginx$' || fail 50 "$path: Server header exposes a version"
done
ok "security headers on html, js, css, worker, wasm, manifest and icon responses; Server has no version"

hdr "/$WASM" | tr -d '\r' | grep -qi '^content-type: application/wasm' || fail 50 "$WASM is not application/wasm"
hdr "/$WASM" | tr -d '\r' | grep -qi '^cache-control:.*immutable' || fail 50 "$WASM is not immutable"
hdr "/$MJS" | tr -d '\r' | grep -qi '^content-type: text/javascript' || fail 50 "$MJS is not served as text/javascript"
hdr "/$MJS" | tr -d '\r' | grep -qi '^cache-control:.*immutable' || fail 50 "$MJS is not immutable"
for p in "$ENTRY" "$CSS" "/assets/$WORKER"; do
  hdr "$p" | tr -d '\r' | grep -qi '^cache-control: public, max-age=31536000, immutable$' || fail 50 "$p (hashed asset) is not immutable"
done
for p in / /boot-guard.js /manifest.webmanifest /index.html; do
  hdr "$p" | tr -d '\r' | grep -qi '^cache-control: no-cache$' || fail 50 "$p is not no-cache"
done
ok "wasm: application/wasm + immutable; .mjs text/javascript; hashed assets immutable; index/boot guard/web manifest: no-cache"

# PWA (ADR-0003): the service worker + both manifests are always revalidated,
# are served as JavaScript / JSON, and agree on the build id; the versioned
# zxing decoder is immutable and served as wasm.
for p in /sw.js /precache-manifest.json /manifest.webmanifest; do
  hdr "$p" | tr -d '\r' | grep -qi '^cache-control: no-cache$' || fail 50 "$p is not no-cache"
done
hdr /sw.js | tr -d '\r' | grep -qi '^content-type: application/javascript' || fail 50 "sw.js is not served as JavaScript"
hdr /precache-manifest.json | tr -d '\r' | grep -qi '^content-type: application/json' || fail 50 "precache-manifest.json is not served as JSON"
hdr /manifest.webmanifest | tr -d '\r' | grep -qi '^content-type: application/manifest+json' || fail 50 "the web manifest is not application/manifest+json"
sw_id="$(curl -fsS "$BASE/sw.js" | sed -n "s/^const BUILD_ID = '\([^']*\)';.*/\1/p")"
man_id="$(curl -fsS "$BASE/precache-manifest.json" | sed -n 's/.*"buildId": "\([^"]*\)".*/\1/p' | head -1)"
[[ -n "$sw_id" && "$sw_id" == "$man_id" ]] || fail 50 "sw.js build id '$sw_id' differs from the precache manifest's '$man_id'"
ZX="$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html/zxing' | head -1)"
[[ -n "$ZX" ]] || fail 30 "no self-hosted zxing decoder in the image"
hdr "/zxing/$ZX/zxing_reader.wasm" | tr -d '\r' | grep -qi '^content-type: application/wasm' || fail 50 "the zxing wasm is not application/wasm"
hdr "/zxing/$ZX/reader.js" | tr -d '\r' | grep -qi '^cache-control:.*immutable' || fail 50 "the zxing reader is not immutable"
ok "PWA: sw.js + manifests no-cache and consistent (build $sw_id); zxing decoder served, immutable"

# Every file the precache manifest lists is served, byte for byte (the worker verifies each SHA-256
# on install; a mismatch would abort every install).
curl -fsS "$BASE/precache-manifest.json" >"$TMP/manifest.json"
checked=0
sha256_stdin() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
while IFS= read -r entry; do
  url="${entry#*\"url\":\"}"; url="${url%%\"*}"
  want="${entry#*\"sha256\":\"}"; want="${want%%\"*}"
  got="$(curl -fsS "$BASE/$url" | sha256_stdin)" || fail 50 "precache file $url is not served"
  [[ "$got" == "$want" ]] || fail 50 "precache file $url: served bytes differ from the manifest's SHA-256"
  checked=$((checked + 1))
done < <(tr -d '\n ' <"$TMP/manifest.json" | grep -o '{"url":"[^"]*","sha256":"[0-9a-f]*"')
[[ "$checked" -ge 20 ]] || fail 50 "the precache manifest lists only $checked files"
for required in "$WASM" "$MJS" "assets/$WORKER" "zxing/$ZX/zxing_reader.wasm" index.html boot-guard.js manifest.webmanifest; do
  grep -q "\"$required\"" "$TMP/manifest.json" || fail 50 "the precache manifest does not list $required"
done
! grep -q '"sw.js"\|precache-manifest.json"' "$TMP/manifest.json" || fail 50 "the precache manifest lists the generated files"
ok "all $checked precache-manifest files are served with exactly their SHA-256; boot-critical files are listed"

csp="$(hdr / | tr -d '\r' | grep -i '^content-security-policy:')"
script_src="$(tr ';' '\n' <<<"$csp" | grep -i "script-src")"
grep -q "'wasm-unsafe-eval'" <<<"$script_src" || fail 50 "CSP script-src lacks 'wasm-unsafe-eval'"
! grep -q "unsafe-inline" <<<"$script_src" || fail 50 "CSP script-src allows 'unsafe-inline'"
connect_src="$(tr ';' '\n' <<<"$csp" | grep -i 'connect-src')"
! grep -Eq "(^| )(https:|\*)( |$)" <<<"$connect_src" || fail 50 "CSP connect-src allows any https:/* origin by default"
grep -q 'https://world.openfoodfacts.org' <<<"$connect_src" || fail 50 "CSP connect-src lacks Open Food Facts"
style_src="$(tr ';' '\n' <<<"$csp" | grep -i 'style-src')"
! grep -q "unsafe-inline" <<<"$style_src" || fail 50 "CSP style-src allows 'unsafe-inline'"
! grep -q "'unsafe-eval'" <<<"$csp" || fail 50 "CSP allows unsafe-eval"
for d in "default-src 'self'" "object-src 'none'" "frame-ancestors 'none'" "form-action 'none'" "base-uri 'none'" "style-src 'self'"; do
  grep -qF "$d" <<<"$csp" || fail 50 "CSP lacks: $d"
done
ok "CSP: strict script-src, explicit connect-src allow-list"

for p in "$ENTRY" "$CSS" "/$WASM" "/$MJS"; do
  curl -sS -H 'Accept-Encoding: gzip' -D - -o /dev/null "$BASE$p" | tr -d '\r' \
    | grep -qi '^content-encoding: gzip' || fail 50 "$p is not gzip-compressed"
done
ok "js, css, wasm and mjs are compressed"

# ── hardening ───────────────────────────────────────────────────────────────
uid="$(docker exec "$NAME" id -u)"
[[ "$uid" != 0 ]] || fail 60 "container runs as root"
[[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$NAME")" == true ]] || fail 60 "root filesystem is not read-only"
! docker exec "$NAME" sh -c 'touch /usr/share/nginx/html/.w 2>/dev/null' || fail 60 "docroot is writable"
! docker exec "$NAME" sh -c 'touch /etc/nginx/.w 2>/dev/null' || fail 60 "/etc/nginx is writable"
docker inspect -f '{{.HostConfig.CapDrop}}' "$NAME" | grep -qi 'ALL' || fail 60 "capabilities not dropped"
docker inspect -f '{{.HostConfig.SecurityOpt}}' "$NAME" | grep -q 'no-new-privileges' || fail 60 "no-new-privileges not set"
ok "non-root (uid $uid), read-only rootfs, cap_drop ALL, no-new-privileges"

# ── static bundle host scan ─────────────────────────────────────────────────
docker cp "$NAME:/usr/share/nginx/html" "$TMP/html" >/dev/null
bash tools/check_no_external_hosts.sh "$TMP/html" >/dev/null 2>"$TMP/hosts.log" \
  || { cat "$TMP/hosts.log" >&2; fail 50 "third-party hosts in the shipped bundle"; }
ok "no third-party hosts in the shipped bundle"

# ── egress: serve on a network with no outbound route ───────────────────────
docker network create --internal "$NET" >/dev/null
docker run -d --name "$NAME_ISO" --network "$NET" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="https://api.byok.example.test" \
  "$IMAGE" >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$NAME_ISO" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done
[[ "$ready" -eq 1 ]] || fail 70 "container does not serve on an internal (no-egress) network"
# The isolation must be real, or the test above proves nothing.
if docker exec "$NAME_ISO" wget -q -T 4 -O /dev/null https://example.com/ 2>/dev/null; then
  fail 70 "the --internal network is not isolated (outbound request succeeded)"
fi
ok "boots and serves with no outbound network (needs none); outbound requests from it fail"
docker exec "$NAME_ISO" wget -q -S -O /dev/null http://127.0.0.1:8080/ 2>&1 \
  | grep -i 'content-security-policy' | grep -qF 'connect-src '"'self'"' https://world.openfoodfacts.org https://api.byok.example.test' \
  || fail 50 "AI_NUTRITION_COACH_CONNECT_SRC_EXTRA did not reach the CSP"
ok "AI_NUTRITION_COACH_CONNECT_SRC_EXTRA reaches the CSP"

# A CSP-only redeploy must reach installed apps: the service-worker build id
# covers the headers applied at container start (30-render-sw.sh).
iso_sw_id="$(docker exec "$NAME_ISO" wget -q -O - http://127.0.0.1:8080/sw.js | sed -n "s/^const BUILD_ID = '\([^']*\)';.*/\1/p")"
[[ "$iso_sw_id" =~ ^[A-Za-z0-9]+-[0-9a-f]{12}$ && "$sw_id" =~ ^[A-Za-z0-9]+-[0-9a-f]{12}$ ]] \
  || fail 50 "service-worker build ids are not <bundle>-<header hash>: '$sw_id' / '$iso_sw_id'"
[[ "${iso_sw_id%-*}" == "${sw_id%-*}" ]] || fail 50 "the bundle part of the build id differs between containers of one image"
[[ "$iso_sw_id" != "$sw_id" ]] || fail 50 "a different AI_NUTRITION_COACH_CONNECT_SRC_EXTRA did not change the service-worker build id"
iso_man_id="$(docker exec "$NAME_ISO" wget -q -O - http://127.0.0.1:8080/precache-manifest.json | sed -n 's/.*"buildId": "\([^"]*\)".*/\1/p' | head -1)"
[[ "$iso_man_id" == "$iso_sw_id" ]] || fail 50 "sw.js and the precache manifest disagree after rendering ($iso_sw_id vs $iso_man_id)"
ok "a different AI_NUTRITION_COACH_CONNECT_SRC_EXTRA is a different service-worker version ($sw_id vs $iso_sw_id)"

docker rm -f "$NAME_ISO-kill" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-kill" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e AI_NUTRITION_COACH_SW_KILL=1 "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME_ISO-kill" wget -q -O /dev/null http://127.0.0.1:8080/sw.js 2>/dev/null && break
  sleep 0.5
done
kill_sw="$(docker exec "$NAME_ISO-kill" wget -q -O - http://127.0.0.1:8080/sw.js)"
grep -q 'client.navigate(client.url)' <<<"$kill_sw" && grep -q 'caches.delete' <<<"$kill_sw" \
  || fail 50 "AI_NUTRITION_COACH_SW_KILL=1 does not serve the kill-switch worker"
! grep -q 'precache-manifest' <<<"$kill_sw" || fail 50 "the kill-switch worker precaches"
docker rm -f "$NAME_ISO-kill" >/dev/null 2>&1 || true
ok "AI_NUTRITION_COACH_SW_KILL=1 serves the kill-switch service worker"

# ── access log (PV9): off by default, minimal and anonymised when on ────────
docker exec "$NAME" cat /tmp/ai-nutrition-coach-access-log.inc | grep -q '^access_log off;' \
  || fail 50 "the default container does not render 'access_log off;'"
logs_default="$(docker logs "$NAME" 2>&1)"
if grep -Eq '"(GET|POST|HEAD) |curl/|Mozilla|Wget' <<<"$logs_default"; then
  fail 50 "the default container wrote request lines to its log (access_log should be off)"
fi
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-log" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e AI_NUTRITION_COACH_ACCESS_LOG=on "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME_ISO-log" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break
  sleep 0.5
done
# A request from ANOTHER container (the loopback healthcheck is never logged).
docker run --rm --network "$NET" --entrypoint wget "$IMAGE" -q -O /dev/null \
  --header 'User-Agent: smoke-secret-ua' --header 'Referer: http://secret.referer.test/' \
  "http://$NAME_ISO-log:8080/manifest.webmanifest?q=smoke-secret-query" >/dev/null 2>&1 || true
sleep 1
logs_on="$(docker logs "$NAME_ISO-log" 2>&1)"
grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.0 \[[^]]+\] "GET /manifest.webmanifest" 200 ' <<<"$logs_on" \
  || fail 50 "AI_NUTRITION_COACH_ACCESS_LOG=on did not log the path with a truncated address: $(tail -3 <<<"$logs_on")"
for secret in smoke-secret-ua secret.referer.test smoke-secret-query; do
  ! grep -qF "$secret" <<<"$logs_on" || fail 50 "the access log contains '$secret' (User-Agent / Referer / query string)"
done
! grep -qE '"GET / "|"GET / HTTP' <<<"$logs_on" || fail 50 "the loopback healthcheck is being logged"
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-log" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e AI_NUTRITION_COACH_ACCESS_LOG=verbose "$IMAGE" >/dev/null 2>&1 || true
sleep 2
[[ "$(docker inspect -f '{{.State.Running}}' "$NAME_ISO-log" 2>/dev/null || echo false)" == false ]] \
  || fail 50 "container started with an invalid AI_NUTRITION_COACH_ACCESS_LOG"
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
ok "access log: off by default; =on logs the resolved file only, address truncated, no User-Agent/Referer/query; bad value refused"

# The rendered config cannot make a request: no proxying, no DNS resolver.
cfg="$(docker exec "$NAME_ISO" sh -c 'cat /tmp/ai-nutrition-coach.conf /tmp/ai-nutrition-coach-headers.inc /tmp/ai-nutrition-coach-ai-*.inc /etc/nginx/nginx.conf')"
if grep -Eq '^[[:space:]]*(proxy_pass|resolver|fastcgi_pass|uwsgi_pass|scgi_pass|grpc_pass)\b' <<<"$cfg"; then
  fail 70 "rendered nginx config contains proxy_pass/resolver-style directives"
fi
ok "rendered nginx config (including the AI-proxy includes, which are empty when off) contains no proxy_pass / resolver"

# ── CSP injection: hostile AI_NUTRITION_COACH_CONNECT_SRC_EXTRA must stop the container ──
inject_cases=("https://a.test'; script-src *" "https://a.test; script-src 'unsafe-inline'" "*" "https:" \
              $'https://a.test\nhttps://b.test' "https://a.test/path" "http://evil.test")
for bad in "${inject_cases[@]}"; do
  docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
  if docker run -d --name "$NAME_ISO-bad" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
       --cap-drop ALL --security-opt no-new-privileges:true \
       -e AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="$bad" "$IMAGE" >/dev/null 2>&1; then
    sleep 2
    state="$(docker inspect -f '{{.State.Running}}' "$NAME_ISO-bad" 2>/dev/null || echo false)"
    docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
    [[ "$state" == false ]] || fail 50 "container started with hostile AI_NUTRITION_COACH_CONNECT_SRC_EXTRA: $(printf %q "$bad")"
  fi
  docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
done
ok "hostile AI_NUTRITION_COACH_CONNECT_SRC_EXTRA values (quote, ;, *, https:, newline, path, http) refuse to start"
rc=0
AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="*" bin/ai-nutrition-coach up >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 50 "bin/ai-nutrition-coach accepted a hostile AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (exit $rc)"
rc=0
AI_NUTRITION_COACH_DOMAIN=$'a.test\nevil' bin/ai-nutrition-coach up --tls >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 50 "bin/ai-nutrition-coach accepted a hostile AI_NUTRITION_COACH_DOMAIN (exit $rc)"
ok "bin/ai-nutrition-coach rejects hostile AI_NUTRITION_COACH_CONNECT_SRC_EXTRA / AI_NUTRITION_COACH_DOMAIN"

# ── instance-wide AI proxy (docs/self-host.md "Offer AI to everyone on your instance") ──
# OFF by default: the offer says so, the proxy path is a plain 404, nothing is precached.
[[ "$(curl -fsS "$BASE/ai/config.json")" == '{"enabled":false}' ]] \
  || fail 50 "/ai/config.json is not {\"enabled\":false} by default"
ah="$(hdr /ai/config.json | tr -d '\r')"
grep -qi '^cache-control: no-store$' <<<"$ah" || fail 50 "/ai/config.json is cacheable"
grep -qi '^content-type: application/json' <<<"$ah" || fail 50 "/ai/config.json is not JSON"
grep -qi '^content-security-policy:' <<<"$ah" || fail 50 "/ai/config.json lacks the security headers"
for spec in "-X POST $BASE/ai/v1/chat/completions" "$BASE/ai/v1/chat/completions" "$BASE/ai/other" "-X POST $BASE/ai/config.json"; do
  # shellcheck disable=SC2086
  code="$(curl -s -o /dev/null -w '%{http_code}' $spec)"
  case "$spec" in
    "-X POST $BASE/ai/config.json") [[ "$code" == 405 ]] || fail 50 "POST /ai/config.json is $code, not 405" ;;
    *) [[ "$code" == 404 ]] || fail 50 "the disabled AI path ($spec) answers $code, not 404" ;;
  esac
done
! grep -q '"ai/' "$TMP/manifest.json" || fail 50 "the precache manifest lists an /ai/ file"
docker exec "$NAME" sh -c 'cat /tmp/ai-nutrition-coach-ai-*.inc' | grep -Eq '^[[:space:]]*(proxy_pass|resolver|proxy_set_header)\b' \
  && fail 70 "the default container renders proxy directives"
ok "instance AI off by default: /ai/config.json says disabled (no-store), the proxy path is 404, POST elsewhere 405, nothing precached, no proxy directive rendered"

# ON, against a throw-away HTTPS upstream on the same internal network (nothing leaves the host).
AIKEY="smoke-ai-key-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
NODE_IMAGE="$(sed -n 's/^FROM \(node:[^ ]*\) AS build/\1/p' infra/Dockerfile)"
[[ -n "$NODE_IMAGE" ]] || fail 40 "cannot read the node image from infra/Dockerfile"
if command -v openssl >/dev/null 2>&1; then
  mkdir -p "$TMP/ai/certs"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/ai/ca.key" -out "$TMP/ai/ca.crt" -days 2 -subj "/CN=smoke test ca" >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -keyout "$TMP/ai/certs/server.key" -out "$TMP/ai/server.csr" -subj "/CN=fake-ai.test" >/dev/null 2>&1
  printf 'subjectAltName=DNS:fake-ai.test\n' >"$TMP/ai/ext.cnf"
  openssl x509 -req -in "$TMP/ai/server.csr" -CA "$TMP/ai/ca.crt" -CAkey "$TMP/ai/ca.key" -CAcreateserial \
    -out "$TMP/ai/certs/server.crt" -days 2 -extfile "$TMP/ai/ext.cnf" >/dev/null 2>&1
  chmod 755 "$TMP/ai" "$TMP/ai/certs"; chmod 644 "$TMP/ai/certs/server.key" "$TMP/ai/certs/server.crt" "$TMP/ai/ca.crt"
  # The same image with the test CA added to its trust store (only this copy trusts the fake provider).
  printf 'FROM %s\nUSER root\nCOPY ca.crt /tmp/ca.crt\nRUN cat /tmp/ca.crt >> /etc/ssl/certs/ca-certificates.crt\nUSER 101\n' "$IMAGE" >"$TMP/ai/Dockerfile"
  docker build -q -t "$IMAGE-aitest" "$TMP/ai" >/dev/null || fail 20 "building the AI test image failed"
  docker rm -f "$NAME-aiup" "$NAME-ai" "$NAME-ai2" >/dev/null 2>&1 || true
  docker run -d --name "$NAME-aiup" --network "$NET" --network-alias fake-ai.test -e "EXPECT_KEY=$AIKEY" \
    -v "$TMP/ai/certs:/certs:ro" -v "$PWD/scripts/smoke_ai_upstream.mjs:/up.mjs:ro" "$NODE_IMAGE" node /up.mjs >/dev/null \
    || fail 20 "cannot start the throw-away AI upstream"
  # The key goes in by NAME (inherited from this shell), like bin/ai-nutrition-coach does.
  export AI_PROXY_KEY="$AIKEY"
  docker run -d --name "$NAME-ai" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=vendor/model-x -e AI_PROXY_LABEL="Smoke AI" \
    "$IMAGE-aitest" >/dev/null || fail 30 "cannot start the container with the AI proxy on"
  # Same image WITHOUT the test CA: the proxy must refuse an unverifiable provider.
  docker run -d --name "$NAME-ai2" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=vendor/model-x "$IMAGE" >/dev/null \
    || fail 30 "cannot start the second AI-proxy container"
  unset AI_PROXY_KEY
  for c in "$NAME-ai" "$NAME-ai2"; do
    ready=0
    for _ in $(seq 1 60); do
      if docker exec "$c" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null; then ready=1; break; fi
      sleep 0.5
    done
    [[ "$ready" -eq 1 ]] || { docker logs "$c" 2>&1 | tail -10 >&2; fail 30 "$c does not serve with the AI proxy on"; }
  done
  sleep 3 # the throw-away upstream needs a moment to listen
  sleep 6 # the rate limit refills (10 requests a minute, burst 5): start the assertions from a clean slate

  aijson="$(docker exec "$NAME-ai" wget -q -O - http://127.0.0.1:8080/ai/config.json)"
  [[ "$aijson" == '{"enabled":true,"model":"vendor/model-x","label":"Smoke AI","transcription":false}' ]] || fail 50 "/ai/config.json with the proxy on is: $aijson"
  grep -qF "$AIKEY" <<<"$aijson" && fail 50 "/ai/config.json contains the key"
  grep -q 'fake-ai.test' <<<"$aijson" && fail 50 "/ai/config.json names the upstream"

  post() { # post <container> <extra wget args...>: status line + body, never fails the script
    local c="$1"; shift
    docker exec "$c" wget -S -O - --header 'Content-Type: application/json' "$@" \
      --post-data '{"model":"vendor/expensive","stream":true,"n":5,"max_tokens":99999,"messages":[{"role":"user","content":"hi"}]}' \
      http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 || true
  }
  out="$(post "$NAME-ai" --header 'Authorization: Bearer browser-secret' --header 'Cookie: sid=browser-cookie' \
    --header 'Origin: http://127.0.0.1:8080' --header 'X-Forwarded-For: 203.0.113.9')"
  grep -q 'HTTP/1.1 200' <<<"$out" || fail 50 "the proxied request was not a 200: $(tail -3 <<<"$out")"
  for want in '"authOk":true' '"cookie":false' '"origin":false' '"referer":false' '"xff":false' \
              '"model":"vendor/model-x"' '"maxTokens":2000' '"keys":["max_tokens","messages","model"]' '"path":"/v1/chat/completions"'; do
    grep -qF "$want" <<<"$out" || fail 50 "what the provider saw lacks $want"
  done
  grep -qi 'set-cookie' <<<"$out" && fail 50 "the provider's Set-Cookie reached the browser"
  grep -qF "$AIKEY" <<<"$out" && fail 50 "the key came back to the browser"
  grep -qF 'browser-secret' <<<"$out" && fail 50 "the browser's Authorization was echoed"
  ok "AI proxy on: the operator's key reached the provider, the browser's Authorization/Cookie/Origin/X-Forwarded-For did not; the model and token cap are forced; Set-Cookie is dropped"

  # Refused unverifiable upstream (no test CA): a plain failure, never a request with the key.
  out2="$(post "$NAME-ai2")"
  grep -Eq 'HTTP/1.1 50[24]' <<<"$out2" || fail 50 "an unverifiable provider certificate was accepted: $(tail -3 <<<"$out2")"
  ok "AI proxy: the provider's TLS certificate is verified (an untrusted one is a 5xx)"

  # A wrong key at the provider: the 401 (whose body quotes part of what it received) is hidden.
  export AI_PROXY_KEY="wrong-$AIKEY"
  docker run -d --name "$NAME-ai3" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=m "$IMAGE-aitest" >/dev/null
  unset AI_PROXY_KEY
  for _ in $(seq 1 40); do docker exec "$NAME-ai3" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break; sleep 0.5; done
  out3="$(post "$NAME-ai3")"
  grep -q 'HTTP/1.1 502' <<<"$out3" || fail 50 "a refused key was not turned into a 502: $(tail -3 <<<"$out3")"
  grep -q 'bad key starting' <<<"$out3" && fail 50 "the provider's refusal message reached the browser"
  docker rm -f "$NAME-ai3" >/dev/null 2>&1 || true
  ok "AI proxy: a provider's refusal of the key is a bare 502, its message is not shown"

  # Same origin only, JSON only, a bounded input, and a quiet provider envelope. A fresh container,
  # so these requests do not eat the burst allowance the rate-limit check below relies on.
  export AI_PROXY_KEY="$AIKEY"
  docker run -d --name "$NAME-ai4" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=vendor/model-x "$IMAGE-aitest" >/dev/null
  unset AI_PROXY_KEY
  for _ in $(seq 1 40); do docker exec "$NAME-ai4" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break; sleep 0.5; done
  HELLO='{"messages":[{"role":"user","content":"hi"}]}'
  req() { # req <post-data> <wget args...>
    local data="$1"; shift
    docker exec "$NAME-ai4" wget -S -O - "$@" --post-data "$data" http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 || true
  }
  # (wget writes the body to stdout and the headers to stderr: they can interleave on one line.)
  status_of() { grep -oE 'HTTP/1\.1 [0-9]{3}' <<<"$1" | head -1 | cut -d' ' -f2; }
  JSONH='Content-Type: application/json'
  [[ "$(status_of "$(req "$HELLO" --header 'Content-Type: text/plain')")" == 415 ]] || fail 50 "cross-site style text/plain is not a 415"
  [[ "$(status_of "$(req "$HELLO" --header 'Content-Type: application/x-www-form-urlencoded')")" == 415 ]] || fail 50 "a form post is not a 415"
  [[ "$(status_of "$(req "$HELLO" --header "$JSONH" --header 'Sec-Fetch-Site: cross-site')")" == 403 ]] || fail 50 "Sec-Fetch-Site: cross-site is not a 403"
  [[ "$(status_of "$(req "$HELLO" --header "$JSONH" --header 'Sec-Fetch-Site: same-site')")" == 403 ]] || fail 50 "Sec-Fetch-Site: same-site is not a 403"
  [[ "$(status_of "$(req "$HELLO" --header "$JSONH" --header 'Origin: http://evil.test')")" == 403 ]] || fail 50 "a foreign Origin is not a 403"
  [[ "$(status_of "$(req "$HELLO" --header "$JSONH" --header 'Origin: null')")" == 403 ]] || fail 50 "Origin: null is not a 403"
  [[ "$(status_of "$(req "$HELLO" --header "$JSONH" --header 'Origin: http://127.0.0.1:9999')")" == 403 ]] || fail 50 "an Origin on another port is not a 403"
  ok4="$(req "$HELLO" --header "$JSONH" --header 'Origin: http://127.0.0.1:8080' --header 'Sec-Fetch-Site: same-origin')"
  [[ "$(status_of "$ok4")" == 200 ]] || fail 50 "a same-origin JSON request is not a 200: $(head -8 <<<"$ok4")"
  if grep -Eiq '^ *(access-control-|openai-|x-request-id|x-ratelimit|set-cookie|server: [^n])' <<<"$ok4"; then
    fail 50 "the provider's envelope (CORS, account, request id, rate-limit, cookie) reached the browser: $(grep -Ei '^ *(access-control-|openai-|x-request-id|x-ratelimit)' <<<"$ok4" | head -3)"
  fi
  ok "AI proxy: text/plain and form posts 415, cross-site / same-site Sec-Fetch-Site and foreign / null / other-port Origin 403, same-origin JSON 200; no CORS, account, request-id or rate-limit header from the provider"

  # The input budget (njs): a remote image URL, two images, or too much text is not forwarded.
  img='data:image/jpeg;base64,/9j/AAAA'
  seen_keys() { grep -o '"keys":\[[^]]*\]' <<<"$1" | head -1; }
  [[ "$(seen_keys "$(req "{\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"x\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"$img\"}}]}]}" --header "$JSONH")")" == '"keys":["max_tokens","messages","model"]' ]] \
    || fail 50 "a valid one-photo request was not forwarded"
  [[ "$(seen_keys "$(req '{"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"http://evil.test/x.png"}}]}]}' --header "$JSONH")")" == '"keys":[]' ]] \
    || fail 50 "a remote image URL was forwarded"
  [[ "$(seen_keys "$(req "{\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image_url\",\"image_url\":{\"url\":\"$img\"}},{\"type\":\"image_url\",\"image_url\":{\"url\":\"$img\"}}]}]}" --header "$JSONH")")" == '"keys":[]' ]] \
    || fail 50 "two images were forwarded"
  docker exec "$NAME-ai4" sh -c "head -c 30000 /dev/zero | tr '\\0' a > /tmp/long.txt"
  bigtext="$(docker exec "$NAME-ai4" sh -c "printf '{\"messages\":[{\"role\":\"user\",\"content\":\"'; cat /tmp/long.txt; printf '\"}]}'" )"
  [[ "$(seen_keys "$(req "$bigtext" --header "$JSONH")")" == '"keys":[]' ]] || fail 50 "30 KB of text was forwarded"
  ok "AI proxy: the input budget holds (one data: image, 24 KB of text, 8 messages); a remote image URL, two images or too much text are not forwarded"

  # A provider's error text (an empty balance, an account) never reaches the browser.
  e402="$(req '{"messages":[{"role":"user","content":"x __PROVIDER_402__"}]}' --header "$JSONH")"
  [[ "$(status_of "$e402")" == 502 ]] || fail 50 "a provider 402 is not a 502: $(tail -3 <<<"$e402")"
  grep -Eiq 'balance|acct-smoke|top up' <<<"$e402" && fail 50 "the provider's 402 message reached the browser"
  docker rm -f "$NAME-ai4" >/dev/null 2>&1 || true
  ok "AI proxy: a provider 402 with a balance message is a generic 502"

  # Method, size and rate.
  mout="$(docker exec "$NAME-ai" wget -S -O /dev/null http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 || true)"
  grep -q 'HTTP/1.1 405' <<<"$mout" || fail 50 "GET to the proxy path is not a 405"
  docker exec "$NAME-ai" sh -c "head -c 3000000 /dev/zero | tr '\\0' a > /tmp/big.bin"
  bout="$(docker exec "$NAME-ai" wget -S -O /dev/null --header 'Content-Type: application/json' --post-file=/tmp/big.bin \
    http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 || true)"
  grep -q 'HTTP/1.1 413' <<<"$bout" || fail 50 "a 3 MB body to the proxy is not a 413: $(tail -2 <<<"$bout")"
  codes=""
  for _ in $(seq 1 12); do
    c="$(docker exec "$NAME-ai" wget -S -O /dev/null --header 'Content-Type: application/json' --post-data '{"messages":[]}' \
      http://127.0.0.1:8080/ai/v1/chat/completions 2>&1 | sed -n 's/^ *HTTP\/1.1 \([0-9]*\).*/\1/p' | head -1 || true)"
    codes="$codes $c"
  done
  grep -q '429' <<<"$codes" || fail 50 "no 429 after 12 quick requests (codes:$codes)"
  grep -q '200' <<<"$codes" || fail 50 "the burst allowance let nothing through (codes:$codes)"
  ok "AI proxy: GET is 405, a 3 MB body is 413; a burst of 12 requests is rate limited with 429 (codes:$codes)"

  # The key is in ONE private file, in no log, and never in the image.
  docker logs "$NAME-ai" 2>&1 | grep -qF "$AIKEY" && fail 50 "the key is in the container log"
  [[ "$(docker exec "$NAME-ai" stat -c %a /tmp/ai-nutrition-coach-ai-locations.inc)" == 600 ]] \
    || fail 50 "the rendered proxy config is not mode 600"
  holders="$(docker exec "$NAME-ai" sh -c "grep -rlF '$AIKEY' /tmp /etc/nginx /usr/share/nginx/html 2>/dev/null || true")"
  [[ "$holders" == "/tmp/ai-nutrition-coach-ai-locations.inc" ]] || fail 50 "the key is in more than one file: $holders"
  docker history --no-trunc "$IMAGE" 2>/dev/null | grep -qF "$AIKEY" && fail 50 "the key is in the image history"
  ok "AI key: only in one 0600 file under /tmp, not in the log, not in the image or its history"

  # Voice transcription (POST /ai/v1/audio/transcriptions): OFF unless AI_PROXY_TRANSCRIPTION=1.
  # The container above ($NAME-ai) has the chat proxy on and transcription off: a plain 404.
  # (The multipart body is built on the host and piped in: it carries bytes that are not text. busybox
  # wget cannot send a NUL byte, so these use \x01; a real browser-style upload with NULs follows.)
  mpbody() { # mpbody <model> [extra part name]: a multipart body with a tiny "recording" on stdout
    printf -- '--B\r\nContent-Disposition: form-data; name="model"\r\n\r\n%s\r\n' "$1"
    [[ -z "${2:-}" ]] || printf -- '--B\r\nContent-Disposition: form-data; name="%s"\r\n\r\nx\r\n' "$2"
    printf -- '--B\r\nContent-Disposition: form-data; name="file"; filename="voice.webm"\r\nContent-Type: audio/webm;codecs=opus\r\n\r\n\xff\x01\xfe\x80abc\r\n--B--\r\n'
  }
  MPH='Content-Type: multipart/form-data; boundary=B'
  txreq() { # txreq <container> <body-file-in-container> <wget args...>
    local c="$1" f="$2"; shift 2
    docker exec "$c" wget -S -O - "$@" --post-file="$f" http://127.0.0.1:8080/ai/v1/audio/transcriptions 2>&1 || true
  }
  txput() { docker exec -i "$1" sh -c "cat > $2"; } # txput <container> <file> (body on stdin)
  txs() { grep -oE 'HTTP/1\.1 [0-9]{3}' <<<"$1" | head -1 | cut -d' ' -f2; }
  mpbody whisper-1 | txput "$NAME-ai" /tmp/tx.bin
  txoff="$(txreq "$NAME-ai" /tmp/tx.bin --header "$MPH")"
  [[ "$(txs "$txoff")" == 404 ]] \
    || fail 50 "voice transcription answers while AI_PROXY_TRANSCRIPTION is off: $(tail -3 <<<"$txoff")"
  ok "AI proxy: voice transcription is a plain 404 unless AI_PROXY_TRANSCRIPTION=1 (and /ai/config.json says transcription:false)"

  export AI_PROXY_KEY="$AIKEY"
  docker run -d --name "$NAME-ai5" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=vendor/model-x -e AI_PROXY_LABEL="Smoke AI" \
    -e AI_PROXY_TRANSCRIPTION=1 -e AI_PROXY_TRANSCRIPTION_MODEL=whisper-smoke -e AI_PROXY_TRANSCRIPTION_BURST=30 \
    "$IMAGE-aitest" >/dev/null || fail 30 "cannot start the container with transcription on"
  docker run -d --name "$NAME-ai6" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    --security-opt no-new-privileges:true -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY \
    -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=vendor/model-x \
    -e AI_PROXY_TRANSCRIPTION=1 -e AI_PROXY_TRANSCRIPTION_MODEL=whisper-smoke "$IMAGE-aitest" >/dev/null \
    || fail 30 "cannot start the rate-limit container"
  unset AI_PROXY_KEY
  for c in "$NAME-ai5" "$NAME-ai6"; do
    for _ in $(seq 1 60); do docker exec "$c" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break; sleep 0.5; done
  done
  txjson="$(docker exec "$NAME-ai5" wget -q -O - http://127.0.0.1:8080/ai/config.json)"
  [[ "$txjson" == '{"enabled":true,"model":"vendor/model-x","label":"Smoke AI","transcription":true,"transcriptionModel":"whisper-smoke"}' ]] \
    || fail 50 "/ai/config.json with transcription on is: $txjson"
  grep -qF "$AIKEY" <<<"$txjson" && fail 50 "/ai/config.json contains the key"
  mpbody whisper-smoke | txput "$NAME-ai5" /tmp/ok.bin
  mpbody whisper-1 | txput "$NAME-ai5" /tmp/othermodel.bin
  mpbody whisper-smoke prompt | txput "$NAME-ai5" /tmp/extra.bin
  txok="$(txreq "$NAME-ai5" /tmp/ok.bin --header "$MPH" --header 'Authorization: Bearer browser-secret' \
    --header 'Cookie: sid=browser-cookie' --header 'Origin: http://127.0.0.1:8080' --header 'Sec-Fetch-Site: same-origin')"
  [[ "$(txs "$txok")" == 200 ]] || fail 50 "a same-origin recording is not a 200: $(tail -4 <<<"$txok")"
  for want in '"text":"two eggs and toast"' '"authOk":true' '"cookie":false' '"origin":false' '"multipart":true' \
              '"model":"whisper-smoke"' '"hasFile":true' '"binaryIntact":true' '"path":"/v1/audio/transcriptions"'; do
    grep -qF "$want" <<<"$txok" || fail 50 "what the provider saw of the recording lacks $want: $(tail -2 <<<"$txok")"
  done
  grep -qiE 'set-cookie|access-control-|openai-|x-request-id|x-ratelimit' <<<"$txok" && fail 50 "the provider's envelope reached the browser (voice)"
  # A browser-style upload (real FormData, a 100 KB "recording" full of NUL bytes) from a node
  # client on the same network: the audio must reach the provider byte for byte.
  cat >"$TMP/tx_client.mjs" <<'JS'
const bytes = new Uint8Array(100 * 1024);
for (let i = 0; i < bytes.length; i++) bytes[i] = i % 7 === 0 ? 0 : (i * 31) % 256;
bytes.set([0xff, 0x00, 0xfe, 0x80], 0);
const form = new FormData();
form.append('model', 'whisper-smoke');
form.append('language', 'en');
form.append('file', new Blob([bytes], { type: 'audio/webm;codecs=opus' }), 'voice.webm');
const r = await fetch(`http://${process.env.TARGET}:8080/ai/v1/audio/transcriptions`, { method: 'POST', body: form });
console.log(JSON.stringify({ status: r.status, body: await r.text() }));
JS
  nodeout="$(docker run --rm --network "$NET" -e "TARGET=$NAME-ai5" -v "$TMP/tx_client.mjs:/c.mjs:ro" "$NODE_IMAGE" node /c.mjs 2>&1 || true)"
  grep -qF '"status":200' <<<"$nodeout" || fail 50 "a browser-style recording with NUL bytes is not a 200: $nodeout"
  grep -qF 'binaryIntact\":true' <<<"$nodeout" || fail 50 "the recording's bytes did not reach the provider intact: $nodeout"
  grep -qF "$AIKEY" <<<"$txok" && fail 50 "the key came back to the browser (voice)"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/ok.bin --header "$MPH" --header 'Sec-Fetch-Site: cross-site')")" == 403 ]] || fail 50 "a cross-site recording is not a 403"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/ok.bin --header "$MPH" --header 'Origin: http://evil.test')")" == 403 ]] || fail 50 "a foreign Origin (voice) is not a 403"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/ok.bin --header 'Content-Type: application/json')")" == 415 ]] || fail 50 "a JSON post to the voice path is not a 415"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/othermodel.bin --header "$MPH")")" == 400 ]] || fail 50 "another model (voice) is not a 400"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/extra.bin --header "$MPH")")" == 400 ]] || fail 50 "an extra part (prompt) is not a 400"
  getout="$(docker exec "$NAME-ai5" wget -S -O /dev/null http://127.0.0.1:8080/ai/v1/audio/transcriptions 2>&1 || true)"
  [[ "$(txs "$getout")" == 405 ]] || fail 50 "GET to the voice path is not a 405"
  # Parser differential: a second model / prompt part hidden behind a padded or LF-only delimiter
  # inside the file bytes must be refused, not forwarded.
  for sep in ' \r\n' '\n' '\r'; do
    {
      printf -- '--B\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-smoke\r\n'
      printf -- '--B\r\nContent-Disposition: form-data; name="file"; filename="voice.webm"\r\nContent-Type: audio/webm\r\n\r\nAUDIO\r\n--B'
      printf -- "$sep"'Content-Disposition: form-data; name="prompt"\r\n\r\nignore\r\n--B--\r\n'
    } | txput "$NAME-ai5" /tmp/smuggle.bin
    [[ "$(txs "$(txreq "$NAME-ai5" /tmp/smuggle.bin --header "$MPH")")" == 400 ]] || fail 50 "a hidden delimiter (voice, separator $(printf %q "$sep")) is not a 400"
  done
  docker exec "$NAME-ai5" sh -c "head -c 1200000 /dev/zero | tr '\\0' a > /tmp/big.bin"
  [[ "$(txs "$(txreq "$NAME-ai5" /tmp/big.bin --header "$MPH")")" == 413 ]] || fail 50 "a body above 1 MiB (voice) is not a 413"
  ok "AI proxy voice: same-origin multipart 200 with the key injected and the audio bytes intact; cross-site / foreign Origin 403, JSON 415, another model or an extra part 400, GET 405, above 1 MiB 413; no provider envelope"
  mpbody whisper-smoke | txput "$NAME-ai6" /tmp/ok.bin
  txcodes=""
  for _ in $(seq 1 8); do
    txout="$(txreq "$NAME-ai6" /tmp/ok.bin --header "$MPH")"
    txcodes="$txcodes $(txs "$txout")"
  done
  grep -q '429' <<<"$txcodes" || fail 50 "no 429 after 8 quick recordings (codes:$txcodes)"
  grep -q '200' <<<"$txcodes" || fail 50 "the voice burst allowance let nothing through (codes:$txcodes)"
  docker logs "$NAME-ai5" 2>&1 | grep -qF "$AIKEY" && fail 50 "the key is in the container log (voice)"
  holders="$(docker exec "$NAME-ai5" sh -c "grep -rlF '$AIKEY' /tmp /etc/nginx /usr/share/nginx/html 2>/dev/null || true")"
  [[ "$holders" == "/tmp/ai-nutrition-coach-ai-locations.inc" ]] || fail 50 "the key is in more than one file (voice on): $holders"
  docker rm -f "$NAME-ai5" "$NAME-ai6" >/dev/null 2>&1 || true
  ok "AI proxy voice: its own rate limit answers 429 on a burst (codes:$txcodes); the key still lives in ONE 0600 file"

  # Misconfiguration refuses to start (and says nothing about the value); a missing key stays off.
  for bad in "AI_PROXY_UPSTREAM=http://fake-ai.test/v1" "AI_PROXY_MODEL=" "AI_PROXY_RATE=fast" "AI_PROXY_LABEL=x\"y"; do
    docker rm -f "$NAME-aibad" >/dev/null 2>&1 || true
    export AI_PROXY_KEY="$AIKEY"
    env_up="AI_PROXY_UPSTREAM=https://fake-ai.test/v1"; env_model="AI_PROXY_MODEL=m"
    case "$bad" in AI_PROXY_UPSTREAM=*) env_up="$bad" ;; AI_PROXY_MODEL=*) env_model="$bad" ;; esac
    docker run -d --name "$NAME-aibad" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
      -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY -e "$env_up" -e "$env_model" -e "$bad" "$IMAGE" >/dev/null 2>&1 || true
    unset AI_PROXY_KEY
    sleep 2
    state="$(docker inspect -f '{{.State.Running}}' "$NAME-aibad" 2>/dev/null || echo false)"
    badlog="$(docker logs "$NAME-aibad" 2>&1 || true)"
    docker rm -f "$NAME-aibad" >/dev/null 2>&1 || true
    [[ "$state" == false ]] || fail 50 "container started with a bad AI setting: ${bad%%=*}"
    grep -qF "$AIKEY" <<<"$badlog" && fail 50 "a refused start printed the key"
  done
  docker run -d --name "$NAME-aibad" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL \
    -e AI_PROXY_ENABLED=1 -e AI_PROXY_KEY= -e AI_PROXY_UPSTREAM=https://fake-ai.test/v1 -e AI_PROXY_MODEL=m "$IMAGE" >/dev/null
  for _ in $(seq 1 40); do docker exec "$NAME-aibad" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break; sleep 0.5; done
  [[ "$(docker exec "$NAME-aibad" wget -q -O - http://127.0.0.1:8080/ai/config.json)" == '{"enabled":false}' ]] \
    || fail 50 "AI_PROXY_ENABLED=1 with an empty key is not off"
  docker rm -f "$NAME-aibad" "$NAME-ai" "$NAME-ai2" "$NAME-aiup" >/dev/null 2>&1 || true
  docker rmi "$IMAGE-aitest" >/dev/null 2>&1 || true
  ok "AI proxy: bad settings refuse to start without printing a value; an empty key stays off"
else
  printf 'smoke: SKIP — openssl is not installed: the AI-proxy-on assertions did not run.\n' >&2
fi

ELAPSED=$(($(date +%s) - START_TS))
[[ "$ELAPSED" -le "$BUDGET" ]] || fail 30 "exceeded the ${BUDGET}s budget (took ${ELAPSED}s)"
printf 'smoke: ALL OK in %ss.\n' "$ELAPSED"
