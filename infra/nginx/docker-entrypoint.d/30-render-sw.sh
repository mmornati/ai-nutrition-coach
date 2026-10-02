#!/bin/sh
# Runs AFTER the image's envsubst step (20-envsubst-on-templates.sh), so the
# security-header include has been rendered.
#
# Renders the service worker and its precache manifest for THIS container
# start into /tmp/openplate-pwa (the root filesystem is read-only), and nginx
# serves them from there (`location = /sw.js`, `= /precache-manifest.json`).
#
# Why not serve the files baked into the image: the build id the generator
# wrote hashes the BUNDLE only, but the Content-Security-Policy -- applied at
# container start from OPENPLATE_CONNECT_SRC_EXTRA -- also decides what an
# installed app may do, and the service worker serves the cached index.html
# WITH the headers it was fetched with. A deployment that only changed the CSP
# would otherwise never reach installed clients. So the id served is
#     <bundle id>-<first 12 hex of sha256 of the rendered header include>
# and any change to the headers is a new service-worker version: users get the
# normal calm "new version" banner after the restart.
#
# OPENPLATE_SW_KILL=1 serves the kill-switch worker instead (docs/pwa.md).
#
# Overridable for tests: OPENPLATE_PWA_SRC, OPENPLATE_PWA_OUT,
# OPENPLATE_HEADERS_FILE, OPENPLATE_SW_KILL_FILE.
set -eu

src="${OPENPLATE_PWA_SRC:-/usr/share/nginx/html}"
out="${OPENPLATE_PWA_OUT:-/tmp/openplate-pwa}"
headers="${OPENPLATE_HEADERS_FILE:-/tmp/openplate-headers.inc}"
kill_file="${OPENPLATE_SW_KILL_FILE:-/etc/openplate/sw.kill.js}"

mkdir -p "$out"

if [ "${OPENPLATE_SW_KILL:-}" = "1" ]; then
  cp "$kill_file" "$out/sw.js"
  # No precache list: the kill worker caches nothing.
  printf '{ "buildId": "kill", "files": [] }\n' > "$out/precache-manifest.json"
  echo "30-render-sw: OPENPLATE_SW_KILL=1 - serving the kill-switch service worker" >&2
  exit 0
fi

bundle_id="$(sed -n "s/^const BUILD_ID = '\([A-Za-z0-9._-]*\)';.*/\1/p" "$src/sw.js" | head -1)"
if [ -z "$bundle_id" ] || [ ! -f "$src/precache-manifest.json" ]; then
  echo "30-render-sw: refusing to start: the bundle has no sw.js / precache-manifest.json" >&2
  exit 1
fi

suffix="$(sha256sum "$headers" | cut -c1-12)"
id="$bundle_id-$suffix"

sed "s/^const BUILD_ID = '[A-Za-z0-9._-]*';/const BUILD_ID = '$id';/" "$src/sw.js" > "$out/sw.js"
sed "s/\"buildId\": \"[A-Za-z0-9._-]*\"/\"buildId\": \"$id\"/" "$src/precache-manifest.json" > "$out/precache-manifest.json"
grep -q "^const BUILD_ID = '$id';" "$out/sw.js"
grep -q "\"buildId\": \"$id\"" "$out/precache-manifest.json"
