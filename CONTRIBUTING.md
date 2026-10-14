# Contributing to AI Nutrition Coach

AI Nutrition Coach is a quiet, offline-first plate-logging app: log what you
ate via photo, barcode, or voice/typing, and it lands on your Day
Board as one honest row per meal. No streaks, no scores, no
false-exact calories. The project is open-source (MIT — see
[`LICENSE`](./LICENSE)) and the no-pressure UX promise is
enforceable through a named-reviewer QA gate (FR-15 / AD-7 — see
[`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md)).

This page is the contributor path. It documents the build, the
test, and the smoke commands, plus the contribution expectations
the release pipeline enforces.

## Build

```sh
pnpm install
```

Installs the pnpm workspace: `apps/web` (the React PWA) and `packages/core` (the pure-TypeScript
domain core). Requires:

| Tool    | Version                                                      |
| ------- | ------------------------------------------------------------ |
| Node.js | >= 24                                                        |
| pnpm    | 11.14.0 (`packageManager` in `package.json`; use corepack)   |
| Docker  | 24+ (self-host image and smokes only)                        |

Every dependency is pinned to an exact version (no `^` or `~`) and must be at least two weeks old.

## Verify (the one gate)

```sh
pnpm verify
```

Runs, in order: Prettier check, ESLint (warnings are errors) and `tsc` in every package, the unit
tests (including the self-tests of the gates below), the same tests re-run under
`TZ=Europe/Paris` (the DST cases do not skip there), the release-posture gates
(`pnpm gates`), the scanner self-tests, the release build, the secrets scan and the third-party
host scan of `apps/web/dist`, and the build guards (no gallery, no dev store in the bundle).
CI must see exit 0 before a change counts as verified. `scripts/verify.sh` is a thin wrapper.

Optional pre-commit guard: `ln -sf ../../scripts/git-hooks/pre-commit .git/hooks/pre-commit`

## Test

```sh
pnpm test          # Vitest in apps/web (dom, storage and tools projects) and packages/core
pnpm test:dst      # the same suites re-run under TZ=Europe/Paris with REQUIRE_DST=1
pnpm e2e           # Playwright against the built preview (Chromium; PW_WEBKIT=1 adds WebKit)
```

`packages/core` is pure: an ESLint rule set (AD-1) and `packages/core/test/ad1-lint.test.ts` keep
frameworks, DOM and network globals out of it.

## Static analysis

```sh
pnpm lint          # ESLint, --max-warnings 0 (includes the i18n-literal gate and the telemetry import ban)
pnpm typecheck     # tsc
pnpm format        # Prettier (write); pnpm format:check is what verify runs
```

## Web app (PWA): build, run, browser smoke

The web build is an installable, offline-capable PWA (ADR-0003, [`docs/pwa.md`](./docs/pwa.md)):

```sh
pnpm dev                                                  # Vite dev server (fetches the pinned wasm assets first)
pnpm build                                                # release bundle -> apps/web/dist, with sw.js and precache-manifest.json
docker build -f infra/Dockerfile -t ai-nutrition-coach:dev .   # the production image (nginx)
bin/ai-nutrition-coach up                                 # http://localhost:8080 (a secure context)
bin/ai-nutrition-coach up --traefik                       # behind your Traefik, no published port (docs/pwa.md)
scripts/smoke_self_host.sh                                # container smoke: headers, CSP, non-root, no egress
scripts/webkit_smoke.sh                                   # opt-in: WebKit + Chromium smoke of the image (needs Docker + network)
```

The fetch scripts (`scripts/fetch_web_sqlite3mc.sh`, `scripts/fetch_web_zxing_pwa.sh`) pin versions
and SHA-256s and fail closed; the fetched files are git-ignored.

## Self-host smoke

```sh
scripts/smoke_self_host.sh
```

End-to-end test of the `bin/ai-nutrition-coach up` flow: builds the multi-stage `infra/Dockerfile`,
starts the container, curls the app shell, asserts the base images are digest-pinned, the security
headers/CSP on html/js/wasm, a non-root read-only container, that it serves on a network with no
egress, and that the bundle has no third-party hosts. Budget is `<5 min` on a standard CI runner
(NFR9 / FR-11).

## Release posture gates

`pnpm verify` runs all of them; each is a Node script under `tools/` with a self-test suite under
`tools/gates/` that proves it fails on violating fixtures and passes on clean ones.

| Gate                                      | What it asserts                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`            | No ESLint warning, no type error; no user-facing string literal bypasses `apps/web/src/i18n` (the i18n-literal gate); no telemetry SDK import.                                                                                                                    |
| `pnpm test` / `pnpm test:dst`             | All unit tests, the AD-1 purity test, the gate self-tests; then the calendar-day / Day Board tests re-run under `TZ=Europe/Paris`, where the DST assertions do not skip.                                                                                           |
| `pnpm check:telemetry`                    | Import-based (TypeScript AST): only the allow-listed adapter files use `fetch` / XHR / WebSocket / EventSource / `sendBeacon` / script injection / a runtime `import()`; no analytics or crash SDK in any `package.json` or the lockfile; docs claiming "no telemetry" name the gate. |
| `pnpm check:log-hygiene`                  | No `console.*` call carries content; no tear-off (`.forEach(console.log)`); an interpolating log needs a reviewed `// log-hygiene: content-free` marker and only allow-listed identifiers (ids, enums, counts, fixed reasons).                                      |
| `pnpm check:adults-only`                  | No biometric API or package, no `childProfile` / `under13` / `ageGate` / `birthDate` machinery in shipped code (comments stripped; `ManagedOversightSeam` is the only marker).                                                                                      |
| `pnpm check:a11y`                         | Every screen component is exercised by an axe test.                                                                                                                                                                                                              |
| `pnpm check:release-posture`              | `LICENSE` is MIT; `CONTRIBUTING.md` documents build / test / smoke; the No-Dark-Patterns banned list is unchanged; every row of the README trust table names proof test files that exist and contain a real, un-skipped test; `pnpm verify` still chains every gate; with `AI_NUTRITION_COACH_BUILD=selfhost\|release`, a real `AI_NUTRITION_COACH_PROJECT_URL`. |
| `pnpm build` then `pnpm scan:bundle`      | Release bundle builds; no key-shaped string and no third-party host in `apps/web/dist`.                                                                                                                                                                          |
| CI: `self-host-smoke`, `browser-smoke`    | The container smoke and the real-browser smoke of the production image.                                                                                                                                                                                          |

A regression on any gate fails the build.

## Making and proving a trust claim

The README "Trust posture" table is the project's list of promises. Each row has a `Proof` column
naming the test file(s) that fail if the promise breaks. **If you add or reword a promise (in the
README, `docs/`, or in-app copy), add or point it at a test**; `pnpm check:release-posture`
rejects a row with no proof, a missing file, or a file with no real test in it. A promise you
cannot test belongs in the review document's "remaining items", not in the table.

## Accessibility and translations

- **Accessibility.** Every screen component under `apps/web/src/screens/` must be exercised by a
  test that runs axe (`vitest-axe`) and asserts no violations; `pnpm check:a11y` fails on a screen
  without one. The dev gallery is also checked in a real browser (`apps/web/e2e/gallery.spec.ts`).
- **Strings.** User-facing copy lives in `apps/web/src/i18n` and is read through the i18n helpers,
  never written in a `.tsx` file; `pnpm lint` fails on a string literal handed to JSX text,
  `aria-label`, `title`, `placeholder`, `alt` or a setter. Coach copy stays keyed.

## Contribution expectations

- **One PR per change.** Bundled changes are hard to review and
  hard to revert. A small PR with one intent is the canonical
  shape.
- **No AI-generated copy without a named reviewer sign-off.**
  Every user-facing coach string lives in
  `apps/web/src/i18n` and `packages/core/src/coach`; the
  No-Dark-Patterns Standard ([`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md))
  lists the banned-everywhere patterns a reviewer ticks off.
- **No new external dependency without a reason.** `packages/core` must stay pure (the AD-1 lint
  rules and `ad1-lint.test.ts` fail on a framework, DOM or network import); a dependency in
  `apps/web` is pinned to an exact version at least two weeks old.
- **No telemetry, no analytics, no crash reporting.** The
  privacy posture is enforced by
  [`docs/telemetry-posture.md`](./docs/telemetry-posture.md). A
  PR that introduces a third-party SDK will fail
  `pnpm check:telemetry`.
- **No dark patterns.** The banned-everywhere list in
  [`docs/no-dark-patterns-standard.md`](./docs/no-dark-patterns-standard.md)
  is non-negotiable. The named reviewer signs off every PR that
  touches user-facing copy.

## Where things live

```
apps/web/                the React PWA (Vite, Vitest, Playwright)
packages/core/           pure-TypeScript domain core (no React / DOM / storage / network imports)
infra/                   Docker + nginx self-host definition
docs/                    user-facing docs (your-data, self-host, ai-tiers,
                         telemetry-posture, no-dark-patterns-standard)
_bmad-output/            planning / implementation artifacts, NOT product docs
                         (see _bmad-output/README.md)
tools/                   repo-level gates (check_telemetry_claims, check_log_hygiene,
                         check_adults_only, check_release_posture, check_accessibility_floor, ...)
                         and their self-tests (tools/gates, tools/pwa)
scripts/                 verify.sh (wrapper for pnpm verify), fetch_*, smokes, local web
```

## Reporting vulnerabilities

Please do not open public issues for security problems; follow
[`SECURITY.md`](SECURITY.md).

## Community

AI Nutrition Coach is yours to run and yours to shape. The release pipeline
is intentionally lightweight — one PR per change, one named
reviewer sign-off, three CI gates — so a single contributor can
ship a meaningful change in a single sitting.

The project is also intentionally **not** forking or hosting a
proprietary backend. The trust mechanic is architecture, not
policy; if you find a way to ship the same UX with a smaller
dependency surface, that's the right PR.
