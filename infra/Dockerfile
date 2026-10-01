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

COPY apps ./apps
COPY packages ./packages
# The `build:web` script ends with the secrets scan of the bundle (S1): the
# image build fails if a key-shaped string was compiled in.
COPY tools/check_no_secrets_in_build.sh tools/check_no_external_hosts.sh tools/

# Build the web release bundle via the `build:web` script in the root
# pubspec.yaml `melos:` block. `--release` + `--pwa-strategy=none` keeps the
# bundle small and avoids the service worker the self-host build never needs.
# The script also builds with --no-web-resources-cdn (CanvasKit is served from
# this origin), then runs the secrets scan and the third-party-host scan: the
# image build fails if the bundle would call out to a CDN.
# Debug symbol maps for the engine are never loaded at run time: drop them.
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
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER=OPENPLATE_ \
    NGINX_ENTRYPOINT_QUIET_LOGS=1 \
    OPENPLATE_CONNECT_SRC_EXTRA=""

# The release build output.
COPY --from=build /work/apps/client/build/web /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
