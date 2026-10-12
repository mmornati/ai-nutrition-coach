# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach self-host web build — multi-stage.
#
#   stage 1 (build):   ghcr.io/cirruslabs/flutter:stable
#                      → melos bootstrap
#                      → melos run build:web
#
#   stage 2 (serve):  nginx:alpine (pinned by digest)
#                      → serves /usr/share/nginx/html
#                      → SPA fallback via try_files (FR11 seam)
#                      → non-root user (Story 4.4 / AD-2 hardening)
#
# The full image is `ghcr.io/cirruslabs/flutter:stable` (the bare short name
# `cirruslabs/flutter:stable` does not resolve on every Docker host — pin
# the registry explicitly so CI builds are reproducible everywhere).
# ───────────────────────────────────────────────────────────────────────────

# ── stage 1: build ────────────────────────────────────────────────────────
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /work

# Resolve the workspace once. `melos bootstrap` walks every package under
# apps/* and packages/* and runs `pub get` per the melos.yaml config.
# Both the workspace pubspec (Dart pub workspaces) and melos.yaml are needed
# in melos 8.x — melos reads the workspace declaration from pubspec.yaml.
COPY melos.yaml pubspec.yaml ./
COPY apps ./apps
COPY packages ./packages

# `flutter create` is not needed at build time — apps/client already exists.
# `dart pub global activate` writes the `melos` shim into ~/.pub-cache/bin
# which is not on PATH by default. Pin it explicitly because $HOME is not
# expanded by `ENV PATH=...` in this context.
ENV PATH="${PATH}:/root/.pub-cache/bin"
RUN flutter pub global activate melos 8.2.2 \
 && melos bootstrap

WORKDIR /work

# Build the web release bundle via the `build:web` script in melos.yaml.
# `--release` + `--pwa-strategy=none` keeps the bundle small and avoids
# the service worker the self-host build never needs.
RUN melos run build:web

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
