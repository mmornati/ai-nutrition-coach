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
#     profile, and the shipped bundle has no third-party hosts.
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
  docker rm -f "$NAME" "$NAME_ISO" "$NAME_ISO-bad" "$NAME_ISO-kill" "$NAME_ISO-log" >/dev/null 2>&1 || true
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
              'x-frame-options: deny' 'permissions-policy: camera=(self), microphone=()' \
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
cfg="$(docker exec "$NAME_ISO" sh -c 'cat /tmp/ai-nutrition-coach.conf /tmp/ai-nutrition-coach-headers.inc /etc/nginx/nginx.conf')"
if grep -Eq '^[[:space:]]*(proxy_pass|resolver|fastcgi_pass|uwsgi_pass|scgi_pass|grpc_pass)\b' <<<"$cfg"; then
  fail 70 "rendered nginx config contains proxy_pass/resolver-style directives"
fi
ok "rendered nginx config contains no proxy_pass / resolver"

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

ELAPSED=$(($(date +%s) - START_TS))
[[ "$ELAPSED" -le "$BUDGET" ]] || fail 30 "exceeded the ${BUDGET}s budget (took ${ELAPSED}s)"
printf 'smoke: ALL OK in %ss.\n' "$ELAPSED"
