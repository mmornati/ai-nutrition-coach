---
title: 'Story 4.4 — One-command self-host install'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: '0a47a15'
context:
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-11 promises a non-expert can run OpenPlate on their own server with a single documented command (container image + local DB) in ≤5 minutes. The Dockerfile and `nginx.conf` already exist under `infra/` and declare the multi-stage build (cirruslabs/flutter:stable → `flutter build web --release` → nginx:alpine + `try_files` SPA) — but the documented `openplate up` affordance is missing, the CI smoke test is missing, and the self-host quickstart doc is missing. The build is reproducible (NFR9) and the served app is the offline-first web client with no hosted backend (NFR4), but the affordance that makes the promise believable is not in the repo.

**Approach:** Add a thin `bin/openplate` shell script that wraps `docker build` + `docker run` (and the `docker compose` variant for the persistent-data case) so the documented command resolves. The script is the only file a non-expert touches; the build itself is the existing multi-stage `Dockerfile`. Add a self-host quickstart doc (`docs/self-host.md`) that walks through the one command, the volume mount for the persistent sqlite3mc database, and the no-telemetry / no-hosted-backend posture. Add a CI smoke test (`.github/workflows/self-host-smoke.yml`) that builds the image and curls the healthcheck endpoint — proves the ≤5-min acceptance in CI, not just docs. The image is the existing one; this story is the affordance, the doc, and the smoke test.

## Boundaries & Constraints

**Always:**
- AD-2: the self-host image is the same `apps/client` Flutter web build the mobile clients use — one responsive codebase for all three targets. The self-host build never diverges from the mobile build at the source level.
- FR-11 / NFR9: the build is reproducible. nginx:alpine is pinned by digest in the existing `infra/Dockerfile` (sha256:4a73073bd…); `ghcr.io/cirruslabs/flutter:stable` is the deterministic base. The smoke test asserts the digest-pinning is in place.
- NFR4: the served app is the offline-first web client with no hosted backend. The nginx config is SPA-friendly (`try_files`); no upstream reverse-proxy; no telemetry endpoint.
- AD-7: the self-host quickstart copy lives in `docs/self-host.md` and follows the calm non-judgmental tone of the rest of the doc set. The smoke test's job is to be a single quiet \"image built and serves /\" line.
- FR-12: no telemetry in any shipped build. The smoke test's curl is a one-shot healthcheck; no instrumentation is added to the running image.
- Conventions: the `bin/openplate` script is shell-only; no Node / Python / Go wrapper. POSIX shell, no bash-isms that would break on `sh`.

**Ask First:**
- Whether the `openplate up` command is `docker run` (no compose) or `docker compose` — the spec ships both: `openplate up` (default) uses `docker run` for the zero-config path; `openplate up --with-persist` uses `docker compose` with a bind-mounted volume for the local database. Either way the affordance is a single command.
- Whether the image is published to GHCR or only buildable from source — the spec ships the buildable-from-source affordance; the GHCR publish is a v1.1 follow-up.

**Never:**
- No `docker-compose.yml` required for the default path. The default is `docker run` only; the compose file is opt-in for users who want persistent data.
- No reverse-proxy / TLS termination in the self-host image. The user is responsible for putting nginx / caddy / traefik in front of the container; the v1.1 follow-up adds a self-signed TLS option.
- No telemetry, no hosted backend, no analytics endpoint.
- No data leaves the container except the user-mounted volume.
- No divergence from the mobile build at the source level — `apps/client` is one codebase; the web build is a `flutter build web --release` against the same source.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_DOCKER_RUN | Fresh Docker host; user runs `bin/openplate up` | The script builds the image, starts the container, prints a single calm line \"openplate is up at http://localhost/\"; the user opens the URL and sees the lock screen | script exits non-zero on build failure |
| HAPPY_PATH_DOCKER_COMPOSE | User runs `bin/openplate up --with-persist` | The script writes a temporary compose file with a bind-mounted volume, starts the stack, prints the same line; data persists across container restarts | N/A |
| DOCKER_NOT_INSTALLED | `docker --version` returns non-zero | The script prints a calm line \"docker is required — install it from https://docs.docker.com/get-docker/\" and exits non-zero | graceful |
| BUILD_FAILURE | `docker build` returns non-zero | The script prints the build log tail and exits non-zero; no container is started | graceful |
| HEALTHCHECK | Container is up; `curl http://localhost/` returns 200 | The smoke test (in CI) curls the URL; the dev-mode script prints a one-line confirmation | N/A |
| PERSISTENT_DATA | Container is removed; the bind-mounted volume is intact | The next `bin/openplate up` re-uses the volume; the lock screen re-appears; re-entering the passphrase reveals the data | N/A |
| REPRODUCIBLE_BUILD | The Dockerfile's `nginx:alpine` is digest-pinned | The smoke test asserts the digest is present; the build is byte-stable across rebuilds | grep test |
| NO_TELEMETRY | The container's network calls | The smoke test inspects the running container; no outbound network calls are opened (no analytics endpoint) | smoke test |
| CI_SMOKE | A PR is opened | The CI workflow builds the image, starts the container, curls `/`, asserts 200, stops the container | N/A |
| AD2_INVARIANT | The web build is from the same source as the mobile build | The smoke test asserts the source-tree hash matches the build context; the build is reproducible | grep + smoke test |
| NGINX_SPA | The user navigates to `/your-data` (a non-root route) | nginx returns the `index.html`; the Flutter router takes over | config check |

</frozen-after-approval>

## Code Map

- `bin/openplate` -- new; POSIX shell script that wraps `docker build` + `docker run` / `docker compose up`. Single command: `bin/openplate up` (default) or `bin/openplate up --with-persist` (compose). The script is the only file a non-expert touches; the build is the existing `infra/Dockerfile`.
- `infra/docker-compose.yml` -- new; the opt-in persistent-data compose file. Bind-mounts a host volume at `/data`; the container runs as a non-root user and writes the sqlite3mc database to `/data/openplate_v1.sqlite`.
- `infra/Dockerfile` -- extend; add a non-root user (`openplate:openplate`) and a `VOLUME` declaration for `/data`; the `ENTRYPOINT` runs nginx in the foreground.
- `infra/nginx.conf` -- extend; add `client_max_body_size` (so a 5MB photo upload never gets clipped) and the standard SPA-friendly `try_files $uri $uri/ /index.html` already declared.
- `.dockerignore` -- new; the build context whitelist (just the source tree, never `.git` / `.dart_tool` / build artefacts).
- `docs/self-host.md` -- new; the user-facing self-host quickstart. Three steps: install docker, run `bin/openplate up`, open http://localhost/. Documents the `--with-persist` path, the nginx SPA behaviour, the volume mount, and the no-telemetry / no-hosted-backend posture.
- `.github/workflows/self-host-smoke.yml` -- new; the CI smoke test. Builds the image, starts the container, curls `/`, asserts 200 + the lock-screen HTML, stops the container. Asserts the digest-pinning in `infra/Dockerfile`.
- `scripts/smoke_self_host.sh` -- new; the smoke test script the workflow runs (extracted so it's also runnable locally). The script exits non-zero on any failure.
- `apps/client/README.md` -- extend; add a one-line \"self-host\" pointer to `docs/self-host.md`.
- `docs/ai-tiers.md` -- extend; cross-reference `docs/self-host.md` from the \"free model\" rung's \"or run your own\" copy.
- `melos.yaml` -- extend; add a `smoke:self-host` script that invokes the smoke test.

## Tasks & Acceptance

**Execution:**
- [ ] `bin/openplate` -- POSIX shell script; `up` + `up --with-persist` paths; calm error messages.
- [ ] `infra/docker-compose.yml` -- bind-mounted volume at `/data`; non-root user.
- [ ] `infra/Dockerfile` -- extend with non-root user + `VOLUME` declaration; the digest-pinning is preserved.
- [ ] `infra/nginx.conf` -- extend with `client_max_body_size`; the SPA `try_files` is preserved.
- [ ] `.dockerignore` -- build-context whitelist.
- [ ] `docs/self-host.md` -- the user-facing quickstart.
- [ ] `.github/workflows/self-host-smoke.yml` -- the CI smoke test.
- [ ] `scripts/smoke_self_host.sh` -- the smoke test script (CI + local).
- [ ] `apps/client/README.md` -- self-host pointer.
- [ ] `docs/ai-tiers.md` -- self-host cross-reference.
- [ ] `melos.yaml` -- `smoke:self-host` script.

**Acceptance Criteria:**
- Given a fresh Docker host, when the user runs `bin/openplate up`, then the script builds the image, starts the container, and prints a single calm line \"openplate is up at http://localhost/\"; the user opens the URL and sees the lock screen (FR-11 / NFR4).
- Given the persistent-data path, when the user runs `bin/openplate up --with-persist`, then the compose stack is started with a bind-mounted volume at `/data`; data persists across container restarts (FR-11 / NFR4).
- Given the ≤5-min acceptance, when the smoke test runs in CI, then the image is built and serves `/` in under 5 minutes on a standard CI runner; the smoke test asserts 200 + the lock-screen HTML (FR-11 / NFR9).
- Given the reproducible-build invariant, when the smoke test runs, then the `nginx:alpine` digest pin in `infra/Dockerfile` is asserted; the build is byte-stable across rebuilds (NFR9).
- Given the no-telemetry invariant, when the container runs, then no outbound network calls are opened from the running image; the smoke test asserts the network namespace is quiet (FR-12 / NFR4).
- Given the SPA-fallback invariant, when the user navigates to a non-root route, then nginx returns `index.html`; the Flutter router takes over (FR-11).
- Given the AD-2 one-codebase invariant, when the web build is produced, then the same `apps/client` source the mobile build uses is the build context; no source divergence (AD-2).

## Spec Change Log

## Verification

**Commands (Docker):**
- `bin/openplate up` -- expected: image built + container started + the lock screen reachable at http://localhost/.
- `bin/openplate up --with-persist` -- expected: compose stack started; the volume mount is bound.
- `bash scripts/smoke_self_host.sh` -- expected: the smoke test exits 0; the lock-screen HTML is served.
- `docker run --rm openplate:dev curl -sf http://localhost/ | grep -q 'openplate'` -- expected: the lock-screen HTML is served.
- `grep -q 'sha256:4a73073bd' infra/Dockerfile` -- expected: the digest-pinning is in place.

**Manual checks:**
- Confirm `bin/openplate up` builds the image on a clean Docker host in ≤5 min.
- Confirm the lock screen is the first paint (Story 4.1 carries the gate).
- Confirm the SPA fallback works (`/your-data` returns `index.html`).
- Confirm no outbound network calls from the running image (the smoke test asserts this).

## Suggested Review Order

**Build affordance**
- The `bin/openplate` script + the `infra/docker-compose.yml` opt-in.
  [`openplate`](../../bin/openplate)
  [`docker-compose.yml`](../../infra/docker-compose.yml)

**Container hardening**
- The non-root user + the `VOLUME` declaration + the nginx SPA config.
  [`Dockerfile`](../../infra/Dockerfile)
  [`nginx.conf`](../../infra/nginx.conf)
  [`.dockerignore`](../../.dockerignore)

**Documentation + smoke test**
- The user-facing quickstart + the CI smoke test.
  [`self-host.md`](../../docs/self-host.md)
  [`self-host-smoke.yml`](../../.github/workflows/self-host-smoke.yml)
  [`smoke_self_host.sh`](../../scripts/smoke_self_host.sh)

---

## Dev Agent Record

### Implementation Plan

To be filled by the dev agent.

### Completion Notes

To be filled by the dev agent.

### Debug Log

To be filled by the dev agent.

### File List

To be filled by the dev agent.

### Change Log

To be filled by the dev agent.

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items
