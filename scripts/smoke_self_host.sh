#!/usr/bin/env bash
# Self-host smoke test (Story 4.4, hardened in Phase 4 / I8, N6).
#
#   bash scripts/smoke_self_host.sh
#
# Builds the image through `bin/openplate up` (so the real run flags are what
# is tested) and asserts:
#   * the base images are digest-pinned (nginx-unprivileged, Caddy);
#   * readiness (a poll loop, no fixed sleep) and HTTP 200 for the app shell,
#     SPA deep links, a 404 for a missing asset and 405 for POST;
#   * the versioned sqlite3mc wasm is served as application/wasm and immutable;
#   * the security headers (CSP, nosniff, ...) are on html, js AND wasm
#     responses, `Server` carries no version, index/js are `no-cache`;
#   * the CSP has no 'unsafe-inline' script, no blanket https: connect-src;
#   * the container is non-root, has a read-only root filesystem, dropped
#     capabilities and no-new-privileges;
#   * a second `bin/openplate up` fails with a clear name-collision error;
#   * EGRESS: the same hardened container, on a docker `--internal` network
#     (no outbound route), still boots and serves — i.e. it NEEDS no outbound
#     network — and the rendered nginx config contains no proxy_pass /
#     resolver (nothing in it could make a request). This shows the server is
#     self-contained; it is not a packet capture. A deliberate outbound
#     request from the container fails, so the test notices if the network
#     were not actually isolated;
#   * ACCESS LOG (privacy audit PV9): off by default - the requests above left
#     no line (and no User-Agent) in `docker logs`; OPENPLATE_ACCESS_LOG=on
#     logs the resolved file only, with the client address truncated, and never the
#     User-Agent, Referer or query string; a bad value refuses to start;
#   * OPENPLATE_CONNECT_SRC_EXTRA values that could rewrite the CSP (quote
#     injection, `;`, `*`, newline) make the container refuse to start;
#   * the OPENPLATE_CONNECT_SRC_EXTRA knob reaches the CSP;
#   * the compose file is valid, binds 127.0.0.1 by default, has the tls
#     profile, and the shipped bundle has no third-party hosts.
#
# Exit codes: 0 ok; 10 no docker; 20 build failed; 30 readiness/HTTP failure;
#             40 pin/config assertion failed; 50 header/CSP assertion failed;
#             60 hardening assertion failed; 70 egress assertion failed.

set -euo pipefail

cd "$(dirname "$0")/.."

NAME="openplate-smoke"
NET="openplate-smoke-internal"
NAME_ISO="openplate-smoke-iso"
PORT="${OPENPLATE_SMOKE_PORT:-8088}"
IMAGE="openplate:smoke"
BUDGET="${OPENPLATE_SMOKE_BUDGET:-300}"
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
grep -Eq 'image: caddy:[0-9][^ @]*@sha256:[0-9a-f]{64}' infra/docker-compose.yml \
  || fail 40 "Caddy is not pinned by digest (infra/docker-compose.yml)"
ok "base images pinned by digest"

# ── compose config ──────────────────────────────────────────────────────────
compose_cfg="$(docker compose -f infra/docker-compose.yml config 2>&1)" \
  || fail 40 "docker-compose.yml is invalid: $compose_cfg"
grep -q 'host_ip: 127.0.0.1' <<<"$compose_cfg" \
  || fail 40 "compose default does not bind 127.0.0.1"
! grep -q 'caddy:' <<<"$compose_cfg" || fail 40 "caddy runs without the tls profile"
OPENPLATE_DOMAIN=plate.example.test docker compose -f infra/docker-compose.yml --profile tls config 2>&1 \
  | grep -q 'caddy:' || fail 40 "tls profile does not define caddy"
! grep -q 'openplate-data' infra/docker-compose.yml || fail 40 "compose still references the removed /data volume"
ok "compose: loopback by default, tls profile present, no /data volume"

# ── Traefik compose (docs/pwa.md): renders, no published port, right labels ──
! OPENPLATE_DOMAIN='' docker compose -f infra/docker-compose.traefik.yml config >/dev/null 2>&1 \
  || fail 40 "the Traefik compose renders without OPENPLATE_DOMAIN"
tcfg="$(OPENPLATE_DOMAIN=plate.example.test docker compose -f infra/docker-compose.traefik.yml config 2>&1)" \
  || fail 40 "docker-compose.traefik.yml is invalid: $tcfg"
! grep -Eq '^[[:space:]]+(ports|published|host_ip):' <<<"$tcfg" || fail 40 "the Traefik compose publishes a port"
for want in 'traefik.enable: "true"' 'Host(`plate.example.test`)' 'traefik.http.routers.openplate.entrypoints: websecure' \
            'traefik.http.routers.openplate.tls: "true"' 'loadbalancer.server.port: "8080"' \
            'headers.stsSeconds: "31536000"' 'headers.stsPreload: "false"' 'traefik.docker.network: traefik' \
            'external: true' 'read_only: true'; do
  grep -qF "$want" <<<"$tcfg" || fail 40 "Traefik compose lacks: $want"
done
! grep -q 'certresolver' <<<"$tcfg" || fail 40 "the Traefik compose emits a certresolver label without the overlay"
tfull="$(OPENPLATE_DOMAIN=plate.example.test OPENPLATE_TRAEFIK_CERTRESOLVER=le OPENPLATE_TRAEFIK_NETWORK=proxy \
  OPENPLATE_TRAEFIK_ENTRYPOINT=https OPENPLATE_TRAEFIK_ALLOWLIST=192.168.1.0/24 \
  docker compose -f infra/docker-compose.traefik.yml -f infra/docker-compose.traefik-certresolver.yml \
  -f infra/docker-compose.traefik-allowlist.yml config 2>&1)" || fail 40 "Traefik overlays do not render: $tfull"
for want in 'tls.certresolver: le' 'name: proxy' 'entrypoints: https' 'ipallowlist.sourcerange: 192.168.1.0/24' \
            'middlewares: openplate-hsts,openplate-allow'; do
  grep -qF "$want" <<<"$tfull" || fail 40 "Traefik overlays lack: $want"
done
! grep -Eq '^[[:space:]]+(ports|published|host_ip):' <<<"$tfull" || fail 40 "the Traefik overlays publish a port"
rc=0
OPENPLATE_DOMAIN=ok.example.test OPENPLATE_TRAEFIK_ENTRYPOINT='web;x' bin/openplate up --traefik >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 40 "bin/openplate accepted a hostile OPENPLATE_TRAEFIK_ENTRYPOINT (exit $rc)"
rc=0
OPENPLATE_DOMAIN=ok.example.test OPENPLATE_TRAEFIK_NETWORK=openplate-smoke-no-such-net bin/openplate up --traefik >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 43 ]] || fail 40 "bin/openplate --traefik did not report the missing network (exit $rc)"
ok "Traefik compose: no published port, HSTS-only middleware, optional overlays render, hostile input refused"

# ── build + run through the real entry point ────────────────────────────────
printf 'smoke: building and starting via bin/openplate up (port %s) ...\n' "$PORT"
export OPENPLATE_IMAGE_TAG="$IMAGE" OPENPLATE_CONTAINER_NAME="$NAME" OPENPLATE_PORT="$PORT"
rc=0
bin/openplate up >"$TMP/up.log" 2>&1 || rc=$?
if [[ "$rc" -ne 0 ]]; then
  tail -30 "$TMP/up.log" >&2
  fail 20 "bin/openplate up exited $rc"
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
bin/openplate up >"$TMP/dup.log" 2>&1 || rc=$?
[[ "$rc" -eq 31 ]] && grep -q 'already exists' "$TMP/dup.log" \
  || fail 30 "second 'bin/openplate up' did not fail with the name-collision error (exit $rc)"
ok "container name collision is reported clearly"

# ── HTTP behaviour ──────────────────────────────────────────────────────────
body="$(curl -fsS "$BASE/")"
grep -q 'flutter' <<<"$body" || fail 30 "index.html lacks the flutter bootstrap"
# Only tags that load something count: the human description legitimately says "no tracking".
if grep -qiE '<(script|link|img|iframe)[^>]*(analytics|telemetry|tracking|googletagmanager|sentry)' <<<"$body"; then
  fail 50 "telemetry-style reference in index.html"
fi
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/board/2026-08-13")" == 200 ]] \
  || fail 30 "SPA deep link did not fall back to index.html"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/does-not-exist.png")" == 404 ]] \
  || fail 30 "missing asset did not 404 (SPA fallback is swallowing it)"
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

WASM="$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html | grep -E "^sqlite3mc-[0-9.]+\.wasm$"' | head -1)"
[[ -n "$WASM" ]] || fail 30 "no versioned sqlite3mc-<ver>.wasm in the image"

hdr() { curl -sS -D - -o /dev/null "$BASE$1"; }
for path in "/" "/main.dart.js" "/flutter_bootstrap.js" "/$WASM" "/canvaskit/chromium/canvaskit.wasm" "/assets/FontManifest.json"; do
  h="$(hdr "$path")"
  head -1 <<<"$h" | grep -q ' 200' || fail 30 "$path did not return 200"
  for want in 'content-security-policy:' 'x-content-type-options: nosniff' 'referrer-policy: no-referrer' \
              'x-frame-options: deny' 'permissions-policy: camera=(self), microphone=()' \
              'cross-origin-opener-policy: same-origin' 'cross-origin-resource-policy: same-origin'; do
    tr -d '\r' <<<"$h" | grep -qiF "$want" || fail 50 "$path is missing header: $want"
  done
  tr -d '\r' <<<"$h" | grep -qi '^server: nginx$' || fail 50 "$path: Server header exposes a version"
done
ok "security headers on html, js, wasm and asset responses; Server has no version"

hdr "/$WASM" | tr -d '\r' | grep -qi '^content-type: application/wasm' || fail 50 "$WASM is not application/wasm"
hdr "/$WASM" | tr -d '\r' | grep -qi '^cache-control:.*immutable' || fail 50 "$WASM is not immutable"
for p in / /main.dart.js /flutter_bootstrap.js; do
  hdr "$p" | tr -d '\r' | grep -qi '^cache-control: no-cache$' || fail 50 "$p is not no-cache"
done
hdr "/assets/FontManifest.json" | tr -d '\r' | grep -qi '^cache-control: no-cache$' || fail 50 "asset manifests are not no-cache"
ok "wasm: application/wasm + immutable; index/bootstrap/app code/manifests: no-cache"

# PWA (ADR-0003): the service worker + both manifests are always revalidated,
# are served as JavaScript / JSON, and agree on the build id; the versioned
# zxing decoder is immutable and served as wasm.
for p in /sw.js /precache-manifest.json /manifest.json; do
  hdr "$p" | tr -d '\r' | grep -qi '^cache-control: no-cache$' || fail 50 "$p is not no-cache"
done
hdr /sw.js | tr -d '\r' | grep -qi '^content-type: application/javascript' || fail 50 "sw.js is not served as JavaScript"
hdr /precache-manifest.json | tr -d '\r' | grep -qi '^content-type: application/json' || fail 50 "precache-manifest.json is not served as JSON"
sw_id="$(curl -fsS "$BASE/sw.js" | sed -n "s/^const BUILD_ID = '\([^']*\)';.*/\1/p")"
man_id="$(curl -fsS "$BASE/precache-manifest.json" | sed -n 's/.*"buildId": "\([^"]*\)".*/\1/p' | head -1)"
[[ -n "$sw_id" && "$sw_id" == "$man_id" ]] || fail 50 "sw.js build id '$sw_id' differs from the precache manifest's '$man_id'"
ZX="$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html/zxing' | head -1)"
[[ -n "$ZX" ]] || fail 30 "no self-hosted zxing decoder in the image"
hdr "/zxing/$ZX/zxing_reader.wasm" | tr -d '\r' | grep -qi '^content-type: application/wasm' || fail 50 "the zxing wasm is not application/wasm"
hdr "/zxing/$ZX/reader.js" | tr -d '\r' | grep -qi '^cache-control:.*immutable' || fail 50 "the zxing reader is not immutable"
ok "PWA: sw.js + manifests no-cache and consistent (build $sw_id); zxing decoder served, immutable"

csp="$(hdr / | tr -d '\r' | grep -i '^content-security-policy:')"
script_src="$(tr ';' '\n' <<<"$csp" | grep -i "script-src")"
grep -q "'wasm-unsafe-eval'" <<<"$script_src" || fail 50 "CSP script-src lacks 'wasm-unsafe-eval'"
! grep -q "unsafe-inline" <<<"$script_src" || fail 50 "CSP script-src allows 'unsafe-inline'"
connect_src="$(tr ';' '\n' <<<"$csp" | grep -i 'connect-src')"
! grep -Eq "(^| )(https:|\*)( |$)" <<<"$connect_src" || fail 50 "CSP connect-src allows any https:/* origin by default"
grep -q 'https://world.openfoodfacts.org' <<<"$connect_src" || fail 50 "CSP connect-src lacks Open Food Facts"
for d in "default-src 'self'" "object-src 'none'" "frame-ancestors 'none'" "form-action 'none'" "base-uri 'self'"; do
  grep -qF "$d" <<<"$csp" || fail 50 "CSP lacks: $d"
done
ok "CSP: strict script-src, explicit connect-src allow-list"

curl -sS -H 'Accept-Encoding: gzip' -D - -o /dev/null "$BASE/assets/assets/fonts/Roboto-Regular.ttf" | tr -d '\r' \
  | grep -qi '^content-encoding: gzip' || fail 50 "ttf fonts are not gzip-compressed"
ok "ttf fonts are compressed"

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
  -e OPENPLATE_CONNECT_SRC_EXTRA="https://api.byok.example.test" \
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
  || fail 50 "OPENPLATE_CONNECT_SRC_EXTRA did not reach the CSP"
ok "OPENPLATE_CONNECT_SRC_EXTRA reaches the CSP"

# A CSP-only redeploy must reach installed apps: the service-worker build id
# covers the headers applied at container start (30-render-sw.sh).
iso_sw_id="$(docker exec "$NAME_ISO" wget -q -O - http://127.0.0.1:8080/sw.js | sed -n "s/^const BUILD_ID = '\([^']*\)';.*/\1/p")"
[[ "$iso_sw_id" =~ ^[A-Za-z0-9]+-[0-9a-f]{12}$ && "$sw_id" =~ ^[A-Za-z0-9]+-[0-9a-f]{12}$ ]] \
  || fail 50 "service-worker build ids are not <bundle>-<header hash>: '$sw_id' / '$iso_sw_id'"
[[ "${iso_sw_id%-*}" == "${sw_id%-*}" ]] || fail 50 "the bundle part of the build id differs between containers of one image"
[[ "$iso_sw_id" != "$sw_id" ]] || fail 50 "a different OPENPLATE_CONNECT_SRC_EXTRA did not change the service-worker build id"
iso_man_id="$(docker exec "$NAME_ISO" wget -q -O - http://127.0.0.1:8080/precache-manifest.json | sed -n 's/.*"buildId": "\([^"]*\)".*/\1/p' | head -1)"
[[ "$iso_man_id" == "$iso_sw_id" ]] || fail 50 "sw.js and the precache manifest disagree after rendering ($iso_sw_id vs $iso_man_id)"
ok "a different OPENPLATE_CONNECT_SRC_EXTRA is a different service-worker version ($sw_id vs $iso_sw_id)"

docker rm -f "$NAME_ISO-kill" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-kill" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e OPENPLATE_SW_KILL=1 "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME_ISO-kill" wget -q -O /dev/null http://127.0.0.1:8080/sw.js 2>/dev/null && break
  sleep 0.5
done
kill_sw="$(docker exec "$NAME_ISO-kill" wget -q -O - http://127.0.0.1:8080/sw.js)"
grep -q 'client.navigate(client.url)' <<<"$kill_sw" && grep -q 'caches.delete' <<<"$kill_sw" \
  || fail 50 "OPENPLATE_SW_KILL=1 does not serve the kill-switch worker"
! grep -q 'precache-manifest' <<<"$kill_sw" || fail 50 "the kill-switch worker precaches"
docker rm -f "$NAME_ISO-kill" >/dev/null 2>&1 || true
ok "OPENPLATE_SW_KILL=1 serves the kill-switch service worker"

# ── access log (PV9): off by default, minimal and anonymised when on ────────
docker exec "$NAME" cat /tmp/openplate-access-log.inc | grep -q '^access_log off;' \
  || fail 50 "the default container does not render 'access_log off;'"
logs_default="$(docker logs "$NAME" 2>&1)"
if grep -Eq '"(GET|POST|HEAD) |curl/|Mozilla|Wget' <<<"$logs_default"; then
  fail 50 "the default container wrote request lines to its log (access_log should be off)"
fi
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-log" --network "$NET" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e OPENPLATE_ACCESS_LOG=on "$IMAGE" >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME_ISO-log" wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break
  sleep 0.5
done
# A request from ANOTHER container (the loopback healthcheck is never logged).
docker run --rm --network "$NET" --entrypoint wget "$IMAGE" -q -O /dev/null \
  --header 'User-Agent: smoke-secret-ua' --header 'Referer: http://secret.referer.test/' \
  "http://$NAME_ISO-log:8080/manifest.json?q=smoke-secret-query" >/dev/null 2>&1 || true
sleep 1
logs_on="$(docker logs "$NAME_ISO-log" 2>&1)"
grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.0 \[[^]]+\] "GET /manifest.json" 200 ' <<<"$logs_on" \
  || fail 50 "OPENPLATE_ACCESS_LOG=on did not log the path with a truncated address: $(tail -3 <<<"$logs_on")"
for secret in smoke-secret-ua secret.referer.test smoke-secret-query; do
  ! grep -qF "$secret" <<<"$logs_on" || fail 50 "the access log contains '$secret' (User-Agent / Referer / query string)"
done
! grep -qE '"GET / "|"GET / HTTP' <<<"$logs_on" || fail 50 "the loopback healthcheck is being logged"
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
docker run -d --name "$NAME_ISO-log" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true -e OPENPLATE_ACCESS_LOG=verbose "$IMAGE" >/dev/null 2>&1 || true
sleep 2
[[ "$(docker inspect -f '{{.State.Running}}' "$NAME_ISO-log" 2>/dev/null || echo false)" == false ]] \
  || fail 50 "container started with an invalid OPENPLATE_ACCESS_LOG"
docker rm -f "$NAME_ISO-log" >/dev/null 2>&1 || true
ok "access log: off by default; =on logs the resolved file only, address truncated, no User-Agent/Referer/query; bad value refused"

# The rendered config cannot make a request: no proxying, no DNS resolver.
cfg="$(docker exec "$NAME_ISO" sh -c 'cat /tmp/openplate.conf /tmp/openplate-headers.inc /etc/nginx/nginx.conf')"
if grep -Eq '^[[:space:]]*(proxy_pass|resolver|fastcgi_pass|uwsgi_pass|scgi_pass|grpc_pass)\b' <<<"$cfg"; then
  fail 70 "rendered nginx config contains proxy_pass/resolver-style directives"
fi
ok "rendered nginx config contains no proxy_pass / resolver"

# ── CSP injection: hostile OPENPLATE_CONNECT_SRC_EXTRA must stop the container ──
inject_cases=("https://a.test'; script-src *" "https://a.test; script-src 'unsafe-inline'" "*" "https:" \
              $'https://a.test\nhttps://b.test' "https://a.test/path" "http://evil.test")
for bad in "${inject_cases[@]}"; do
  docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
  if docker run -d --name "$NAME_ISO-bad" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
       --cap-drop ALL --security-opt no-new-privileges:true \
       -e OPENPLATE_CONNECT_SRC_EXTRA="$bad" "$IMAGE" >/dev/null 2>&1; then
    sleep 2
    state="$(docker inspect -f '{{.State.Running}}' "$NAME_ISO-bad" 2>/dev/null || echo false)"
    docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
    [[ "$state" == false ]] || fail 50 "container started with hostile OPENPLATE_CONNECT_SRC_EXTRA: $(printf %q "$bad")"
  fi
  docker rm -f "$NAME_ISO-bad" >/dev/null 2>&1 || true
done
ok "hostile OPENPLATE_CONNECT_SRC_EXTRA values (quote, ;, *, https:, newline, path, http) refuse to start"
rc=0
OPENPLATE_CONNECT_SRC_EXTRA="*" bin/openplate up >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 50 "bin/openplate accepted a hostile OPENPLATE_CONNECT_SRC_EXTRA (exit $rc)"
rc=0
OPENPLATE_DOMAIN=$'a.test\nevil' bin/openplate up --tls >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 42 ]] || fail 50 "bin/openplate accepted a hostile OPENPLATE_DOMAIN (exit $rc)"
ok "bin/openplate rejects hostile OPENPLATE_CONNECT_SRC_EXTRA / OPENPLATE_DOMAIN"

ELAPSED=$(($(date +%s) - START_TS))
[[ "$ELAPSED" -le "$BUDGET" ]] || fail 30 "exceeded the ${BUDGET}s budget (took ${ELAPSED}s)"
printf 'smoke: ALL OK in %ss.\n' "$ELAPSED"
