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
#   stage 2 (serve):  nginx:alpine (pinned by digest)
#                      → serves /usr/share/nginx/html
#                      → SPA fallback via try_files (FR11 seam)
#                      → non-root user (Story 4.4 / AD-2 hardening)
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

COPY apps ./apps
COPY packages ./packages

# Build the web release bundle via the `build:web` script in the root
# pubspec.yaml `melos:` block. `--release` + `--pwa-strategy=none` keeps the
# bundle small and avoids the service worker the self-host build never needs.
RUN dart run melos run build:web

# ── stage 2: serve ────────────────────────────────────────────────────────
# nginx:alpine pinned by digest so the production image is byte-stable
# across rebuilds — digest sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS serve

# Story 4.4 — non-root user hardening (AD-2). The container runs
# as `ai-nutrition-coach:ai-nutrition-coach` so the bind-mounted volume at /data (the
# compose persistent-data path) is writable by the same uid the
# process uses. Alpine ships nginx with the `nginx` user pre-
# declared; we reuse it.
RUN addgroup -g 10001 ai-nutrition-coach 2>/dev/null || true \
 && adduser -D -G ai-nutrition-coach -u 10001 -h /var/cache/nginx -s /sbin/nologin ai-nutrition-coach 2>/dev/null || true \
 && mkdir -p /data \
 && chown -R ai-nutrition-coach:ai-nutrition-coach /data /var/cache/nginx /var/log/nginx

# Story 4.4 — declare the persistent-data volume. The compose file
# bind-mounts `ai-nutrition-coach-data` at /data so the sqlite3mc database
# survives container restarts.
VOLUME ["/data"]

# Replace the default nginx config with our SPA-friendly one.
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the release build output.
COPY --from=build /work/apps/client/build/web /usr/share/nginx/html

EXPOSE 80

# nginx:alpine already declares a healthy CMD; keep it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
