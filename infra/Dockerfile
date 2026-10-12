# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach self-host web build — multi-stage.
#
#   Build from the repository root (the build context must be the repo root):
#       docker build -f infra/Dockerfile -t openplate:dev .
#
#   stage 1 (build):   ghcr.io/cirruslabs/flutter:3.44.0 (pinned by digest)
#                      → flutter pub get --enforce-lockfile (pubspec.lock)
#                      → melos run build:web
#
#   stage 2 (serve):  nginxinc/nginx-unprivileged:1.30.5-alpine (by digest)
#                      → serves /usr/share/nginx/html on :8080
#                      → SPA fallback via try_files (FR11 seam)
#                      → runs as uid 101 (nginx), never root; works with a
#                        read-only root filesystem (writes only to /tmp)
#                      → the server holds NO user data: the store is encrypted
#                        in the user's browser (ADR-0002)
#
# Reproducibility (I7): the Flutter image is pinned by version AND digest
# (keep in sync with scripts/flutter_docker.sh, .github/workflows/*,
# CONTRIBUTING.md), and dependencies are resolved strictly from the
# committed pubspec.lock — a drifting lockfile fails the build.
# ───────────────────────────────────────────────────────────────────────────

# ── stage 1: build ────────────────────────────────────────────────────────
FROM ghcr.io/cirruslabs/flutter:3.44.0@sha256:46691e311715845de03a3ba4753a475476936805b29431b1f00f1816981033f8 AS build

WORKDIR /work

# Resolve the workspace first, from the manifests + lockfile only, so the
# dependency layer is cached until a pubspec changes. `--enforce-lockfile`
# refuses to build if pubspec.lock is missing or out of date. Melos itself
# is a locked dev_dependency of the root pubspec, so `dart run melos` needs
# no global activation.
COPY pubspec.yaml pubspec.lock ./
COPY apps/client/pubspec.yaml apps/client/pubspec.yaml
COPY packages/domain_core/pubspec.yaml packages/domain_core/pubspec.yaml
COPY packages/integrations/pubspec.yaml packages/integrations/pubspec.yaml
RUN flutter pub get --enforce-lockfile

# Phase 2B: the web store's sqlite3mc.wasm, fetched and SHA-256-verified by the
# pinned script (it also checks the sqlite3 version against pubspec.lock). Done
# before the sources are copied so the ~800 KB download is a cached layer.
COPY scripts/fetch_web_sqlite.sh scripts/fetch_web_sqlite.sh
RUN bash scripts/fetch_web_sqlite.sh

# ADR-0003: the zxing-wasm barcode decoder (Safari / iOS have no native
# BarcodeDetector), self-hosted instead of loaded from a CDN; SHA-256-verified
# by the pinned script (it also checks the mobile_scanner version it was
# reviewed against). Cached layer, like the sqlite wasm.
COPY scripts/fetch_web_zxing.sh scripts/fetch_web_zxing.sh
RUN bash scripts/fetch_web_zxing.sh

COPY apps ./apps
COPY packages ./packages
# The `build:web` script ends with the secrets scan of the bundle (S1): the
# image build fails if a key-shaped string was compiled in.
COPY tools/check_no_secrets_in_build.sh tools/check_no_external_hosts.sh tools/
COPY tools/generate_precache_manifest.dart tools/generate_precache_manifest.dart
COPY tools/check_release_posture.dart tools/check_release_posture.dart
COPY tools/pwa/ tools/pwa/

# Build the web release bundle via the `build:web` script in the root
# pubspec.yaml `melos:` block. `--release` + `--pwa-strategy=none` drops
# Flutter's own (deprecated) service worker; OpenPlate's own `sw.js` and the
# precache manifest are then generated into the bundle by
# tools/generate_precache_manifest.dart (offline use + the "new version is
# ready" flow, ADR-0003, docs/pwa.md).
# The script also builds with --no-web-resources-cdn (CanvasKit is served from
# this origin), then runs the secrets scan and the third-party-host scan: the
# image build fails if the bundle would call out to a CDN.
# Debug symbol maps for the engine are never loaded at run time: drop them.
# OPENPLATE_PROJECT_URL (build argument, optional) is the project page that goes
# into the app identity / Open Food Facts User-Agent. Unset keeps the
# unresolvable https://openplate.invalid default, which
# `OPENPLATE_BUILD=release dart run tools/check_release_posture.dart` refuses
# for a release (docs/release-checklist.md).
# OPENPLATE_RELEASE=1 makes this a RELEASE build: the project-URL rule is
# enforced here (it fails while the URL is the `.invalid` default). The release
# workflow passes both arguments (.github/workflows/release-gate.yml). Whatever
# the value, a URL that is set must be a plain https URL (checked by the same
# tool, also inside `build:web`).
ARG OPENPLATE_PROJECT_URL=""
ARG OPENPLATE_RELEASE=0
ENV OPENPLATE_PROJECT_URL=${OPENPLATE_PROJECT_URL}
RUN if [ "$OPENPLATE_RELEASE" = "1" ]; then \
      OPENPLATE_BUILD=selfhost dart run tools/check_release_posture.dart --project-url-only; \
    else \
      dart run tools/check_release_posture.dart --project-url-only; \
    fi
RUN dart run melos run build:web \
 && rm -f apps/client/build/web/canvaskit/*.js.symbols

# ── stage 2: serve ────────────────────────────────────────────────────────
# Pinned by digest so the production image is byte-stable across rebuilds
# (tag 1.30.5-alpine; bump tag + digest together, keep scripts/smoke_self_host.sh
# in sync).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e AS serve

# The base image already runs as uid 101 (`nginx`) and listens on 8080; no
# user juggling is needed (the previous `useradd ... || true` never worked).
# Drop the stock vhost; ours is rendered from the templates at start-up.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf /usr/share/nginx/html/50x.html
USER 101

COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
# Rendered by the base image's entrypoint (envsubst) into /tmp — a tmpfs when
# the container runs with a read-only root filesystem. NGINX_ENVSUBST_FILTER
# limits substitution to OPENPLATE_* variables so nginx's own $variables are
# left alone.
COPY infra/nginx/templates/ /etc/nginx/templates/
# Fails the start-up (before envsubst) if OPENPLATE_CONNECT_SRC_EXTRA could
# alter the CSP beyond adding origins.
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/05-validate-csp.sh /docker-entrypoint.d/05-validate-csp.sh
# Renders sw.js + the precache manifest for this start (build id = bundle +
# header hash, so a CSP-only redeploy reaches installed apps) or, with
# OPENPLATE_SW_KILL=1, the kill-switch worker (docs/pwa.md).
# Renders the access-log config (PV9): off by default; OPENPLATE_ACCESS_LOG=on
# is a minimal, address-truncated log without User-Agent.
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/10-render-access-log.sh /docker-entrypoint.d/10-render-access-log.sh
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/30-render-sw.sh /docker-entrypoint.d/30-render-sw.sh
COPY tools/pwa/sw.kill.js /etc/openplate/sw.kill.js
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER=OPENPLATE_ \
    NGINX_ENTRYPOINT_QUIET_LOGS=1 \
    OPENPLATE_CONNECT_SRC_EXTRA="" \
    OPENPLATE_ACCESS_LOG="off"

# The release build output.
COPY --from=build /work/apps/client/build/web /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
