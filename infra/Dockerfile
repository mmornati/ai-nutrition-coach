# ───────────────────────────────────────────────────────────────────────────
# AI Nutrition Coach self-host web build — multi-stage.
#
#   Build from the repository root (the build context must be the repo root):
#       docker build -f infra/Dockerfile -t ai-nutrition-coach:dev .
#
#   stage 1 (build):   node:24 LTS alpine (pinned by version AND digest)
#                      → pnpm from corepack, pinned to the repo's packageManager
#                      → pnpm install --frozen-lockfile (pnpm-lock.yaml)
#                      → the two SHA-256-pinned wasm fetches (cached layers)
#                      → vite build + the precache manifest / service worker
#                      → secrets scan, third-party-host scan, no-gallery and
#                        no-dev-store checks: any failure fails the image build
#
#   stage 2 (serve):  nginxinc/nginx-unprivileged:1.31.6-alpine (by digest)
#                      → serves /usr/share/nginx/html on :8080
#                      → SPA fallback via try_files (FR11 seam)
#                      → runs as uid 101 (nginx), never root; works with a
#                        read-only root filesystem (writes only to /tmp)
#                      → the server holds NO user data: the store is encrypted
#                        in the user's browser (ADR-0005)
#
# Reproducibility (I7): the build image is pinned by version AND digest (bump
# tag + digest together; Dependabot keeps the digest moving), pnpm is pinned to
# the version in the root package.json `packageManager`, and dependencies are
# resolved strictly from the committed pnpm-lock.yaml — a drifting lockfile
# fails the build.
# ───────────────────────────────────────────────────────────────────────────

# ── stage 1: build ────────────────────────────────────────────────────────
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build

# What the fetch scripts and the build scans use. Nothing here ends up in the
# runtime image, and every download is verified against pinned SHA-256 values.
RUN apk add --no-cache bash curl unzip python3 grep findutils coreutils

# Keep in step with package.json `packageManager`; corepack refuses a mismatch
# with the manifest at install time.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

WORKDIR /work

# The encrypted store's sqlite3mc engine (js + wasm), the zxing-wasm barcode
# decoder and the hash-wasm Argon2id build (encrypted backups), fetched and SHA-256-verified by the pinned scripts. Done before
# `pnpm install` and before the sources are copied (the scripts need no node_modules), so the
# downloads stay cached layers across dependency and source changes. The build re-runs them
# (idempotent: no download when the output already matches the pins).
COPY scripts/fetch_web_sqlite3mc.sh scripts/fetch_web_zxing_pwa.sh scripts/fetch_web_argon2.sh scripts/
RUN mkdir -p apps/web/public \
 && bash scripts/fetch_web_sqlite3mc.sh \
 && bash scripts/fetch_web_zxing_pwa.sh \
 && bash scripts/fetch_web_argon2.sh

# Resolve the workspace first, from the manifests + lockfile only, so the
# dependency layer is cached until a manifest changes. `--frozen-lockfile`
# refuses to install if pnpm-lock.yaml is missing or out of date.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile

# .gitignore: Tailwind's source scanner honours it (it must not pick class-like words out of the
# git-ignored fetched wasm/JS under apps/web/public, or the CSS would differ from a local build).
COPY .gitignore tsconfig.base.json eslint.restrictions.js ./
COPY apps/web apps/web
COPY packages/core packages/core
COPY tools/ tools/

# AI_NUTRITION_COACH_PROJECT_URL (build argument, optional) is the project page
# that identifies this deployment (docs/self-host.md "The project URL"). Unset
# keeps the default (the project repository). AI_NUTRITION_COACH_RELEASE=1 makes
# this a RELEASE build: an empty or `.invalid` URL fails the build. Whatever the
# value, a URL that is set must be a plain https URL. CI and the publish workflow
# pass both arguments (.github/workflows/ci.yml, .github/workflows/publish.yml).
ARG AI_NUTRITION_COACH_PROJECT_URL=""
ARG AI_NUTRITION_COACH_RELEASE=0
RUN if [ "$AI_NUTRITION_COACH_RELEASE" = "1" ]; then \
      AI_NUTRITION_COACH_BUILD=selfhost node tools/check_project_url.mjs; \
    else \
      node tools/check_project_url.mjs; \
    fi

# `build` = fetch (no-op) → tsc -b → vite build → tools/generate_precache_manifest.mjs, which
# writes sw.js + precache-manifest.json and REFUSES a bundle that cannot boot offline.
RUN pnpm --filter @anc/web build

# The bundle is public: the image build fails if a key-shaped string, a
# third-party host, the dev gallery or the unencrypted dev store is in it.
RUN bash tools/check_no_secrets_in_build.sh apps/web/dist \
 && bash tools/check_no_external_hosts.sh apps/web/dist \
 && bash tools/check_no_gallery_in_build.sh apps/web/dist \
 && bash tools/check_no_dev_store_in_build.sh apps/web/dist

# ── stage 2: serve ────────────────────────────────────────────────────────
# Pinned by digest so the production image is byte-stable across rebuilds
# (tag 1.31.6-alpine; bump tag + digest together, keep scripts/smoke_self_host.sh
# in sync).
FROM nginxinc/nginx-unprivileged:1.31.6-alpine@sha256:884e0b7f42f303641b0f4e78755aea647521dca0b89ca3be7992ad78b5c07434 AS serve

# The base image already runs as uid 101 (`nginx`) and listens on 8080; no
# user juggling is needed.
# Drop the stock vhost; ours is rendered from the templates at start-up.
USER root
# Pull the distribution's security fixes on top of the digest-pinned base:
# the base tag lags Alpine's package updates (CI's Trivy gate failed on
# fixable HIGH CVEs in pcre2/tiff). Dependabot keeps the digest moving; this
# step closes the window between base-image releases. APK_UPGRADE_DATE (CI passes the UTC day)
# keeps the GitHub Actions layer cache from replaying a stale upgrade for as long as the digest holds.
ARG APK_UPGRADE_DATE=unset
RUN echo "apk upgrade: $APK_UPGRADE_DATE" && apk upgrade --no-cache \
  && rm -f /etc/nginx/conf.d/default.conf /usr/share/nginx/html/50x.html
USER 101

COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
# Rendered by the base image's entrypoint (envsubst) into /tmp — a tmpfs when
# the container runs with a read-only root filesystem. NGINX_ENVSUBST_FILTER
# limits substitution to AI_NUTRITION_COACH_* variables so nginx's own $variables are
# left alone.
COPY infra/nginx/templates/ /etc/nginx/templates/
# Fails the start-up (before envsubst) if AI_NUTRITION_COACH_CONNECT_SRC_EXTRA could
# alter the CSP beyond adding origins.
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/05-validate-csp.sh /docker-entrypoint.d/05-validate-csp.sh
# Renders the access-log config (PV9): off by default; AI_NUTRITION_COACH_ACCESS_LOG=on
# is a minimal, address-truncated log without User-Agent.
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/10-render-access-log.sh /docker-entrypoint.d/10-render-access-log.sh
# Renders sw.js + the precache manifest for this start (build id = bundle +
# header hash, so a CSP-only redeploy reaches installed apps) or, with
# AI_NUTRITION_COACH_SW_KILL=1, the kill-switch worker (docs/pwa.md).
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/30-render-sw.sh /docker-entrypoint.d/30-render-sw.sh
COPY tools/pwa/sw.kill.js /etc/ai-nutrition-coach/sw.kill.js
# The optional instance-wide AI proxy (docs/self-host.md "Offer AI to everyone on your instance").
# OFF unless AI_PROXY_ENABLED=1 and AI_PROXY_KEY are set when the container starts. The key is
# NEVER baked in: this step renders it, at start, into a 0600 file under /tmp (a tmpfs), and fails
# the start if it would appear anywhere else. The njs script forces the model and caps the tokens.
COPY infra/nginx/ai-proxy/ /etc/ai-nutrition-coach/ai-proxy/
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh /docker-entrypoint.d/40-render-ai-proxy.sh
# The optional encrypted-backup relay (docs/self-host.md "Encrypted backup on your own server"): this
# step only renders the /sync/ proxy locations (404 unless AI_NUTRITION_COACH_SYNC=1). The relay
# itself is a separate image (infra/Dockerfile.relay) and a separate compose profile.
COPY infra/nginx/sync/ /etc/ai-nutrition-coach/sync/
COPY --chmod=0755 infra/nginx/docker-entrypoint.d/50-render-sync.sh /docker-entrypoint.d/50-render-sync.sh
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER=AI_NUTRITION_COACH_ \
    NGINX_ENTRYPOINT_QUIET_LOGS=1 \
    AI_NUTRITION_COACH_CONNECT_SRC_EXTRA="" \
    AI_NUTRITION_COACH_ACCESS_LOG="off" \
    AI_PROXY_ENABLED="0" \
    AI_NUTRITION_COACH_SYNC="0"

# The release build output.
COPY --from=build /work/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
