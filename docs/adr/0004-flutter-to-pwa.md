# ADR 0004: Replace the Flutter client with a React PWA

Status: accepted, pending the Phase 0 device spike (iOS Safari + Android Chrome over HTTPS) · 2026-10-13
Supersedes: AD-2 ("One responsive Flutter codebase for all three targets") and the Flutter-specific parts of AD-8 (at-rest encryption), both in `_bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md`. Also retires the PRD's Flutter `[ASSUMPTION]`.
Numbering note: the older ADR-0001..0003 (mobile cipher, web encrypted store, PWA distribution) live under `_bmad-output/planning-artifacts/architecture/` and are referenced by their full names below; this record continues that numbering as 0004 and is the first in the `docs/adr/` series.

## Context

- The project will not ship on the Apple App Store or Google Play. Without the stores, Flutter's main advantages (native keystore, native scanner plugin, store distribution) mostly disappear, and iOS has no sane sideload path (7-day free signing, or a paid developer account).
- A PWA installs from a link (Safari: Share, Add to Home Screen; Chrome: Install) and updates itself. Camera, barcode and photo capture work over HTTPS (`getUserMedia`, `<input capture>`, `BarcodeDetector`, with a WASM fallback for iOS).
- The Flutter web build was already the primary target in practice (ADR-0003 PWA distribution). It carries costs the PWA does not need: CanvasKit (large, needs `'wasm-unsafe-eval'`), a canvas-rendered UI with a hand-built accessibility layer, Flutter's inline `<style>` (forcing `style-src 'unsafe-inline'`), a custom bootstrap with locale and glyph-fallback workarounds, and a browser smoke that has to drive the app by pixel coordinates.
- Flutter was never evaluated against alternatives; the PRD recorded it as an assumption.
- The product is still in full build. There are no users and no stored data to migrate, so no backward compatibility or data migration from the Flutter app is required.

## Decision

Build the client as a **React 19 + Vite + TypeScript + Tailwind v4 PWA** with `vite-plugin-pwa`, in a **pnpm workspace**:

- `apps/web`: the PWA (UI, platform adapters, service worker).
- `packages/core`: the pure TypeScript domain (entities, use-cases, ports, coach taxonomy), ported from `packages/domain_core`. Adapters from `packages/integrations` land in `apps/web` (or a later `packages/adapters`), behind the same ports.

Tooling: Vitest + Testing Library, Playwright (e2e + axe), ESLint with `no-restricted-imports` to enforce AD-1, Prettier. The target interface is "Food Lines" (see `docs/design/food-lines/` and `DESIGN.md`). The migration is phased in `docs/pwa-refactor-plan.md`; the list of behaviours that must survive is `docs/migration/parity-checklist.md`.

The Flutter code (`apps/client`, `packages/domain_core`, `packages/integrations`, melos, the Flutter toolchain image) is deleted at the end of the migration (plan phase 9), not kept in parallel.

## Consequences

Accepted trade-offs:

- **Web key is passphrase-derived, not OS-keystore-derived.** AD-8 already said so for web; it now applies to every install. The passphrase is asked on every open and after idle/hidden lock, and a forgotten passphrase cannot be recovered. Docs must keep saying this plainly and never claim equivalence with a hardware keystore (`docs/your-data.md`).
- **Barcode scanning on iOS uses a WASM decoder** (`zxing-wasm`, self-hosted, SHA-256 pinned) because Safari has no `BarcodeDetector`. It is slower than a native scanner but needs no third-party host.
- **No store presence.** If the stores are ever wanted, wrap the PWA with Capacitor; that is a new decision, not a rewrite.
- **Encrypted storage must be rebuilt in JS.** The proven design (SQLite3MultipleCiphers ChaCha20-Poly1305, PBKDF2-HMAC-SHA256 600k iterations, per-store salt, Web Locks single-tab, header copy, idle/hidden auto-lock) is specified in `_bmad-output/.../ADR-0002-web-encrypted-store.md`. The wasm binary used today is built for the Dart `sqlite3` bindings and cannot be reused from JS; plan phase 4 must pick a JS-side route (sqlite3mc JS build, or SQLite plus an AES-GCM layer) and re-pin it with a hash.
- **Everything not in the web bundle goes away:** Android/iOS signing, store metadata, native secure storage, ML Kit, `image_picker` temp-file cleanup, native export destinations.
- **CSP can get stricter.** Without Flutter's inline styles and CanvasKit, `style-src` can likely drop `'unsafe-inline'` (React `style=` attributes need care). `'wasm-unsafe-eval'` stays for SQLite and zxing.
- **The release gates must be rewritten** in JS/shell (a11y floor, i18n literals, log hygiene, telemetry import scan, README proofs). They were Dart AST tools; the parity checklist lists each one.

## What stays unchanged

- **AD-1 pure core:** no framework, storage or HTTP imports in `packages/core`; UI reaches the outside only through ports. Enforced by lint and a structural test instead of the Dart grep test.
- **AD-3 / AD-4 / AD-5 / AD-6 / AD-7 / AD-9:** single mutation path through use-cases, one `FoodCatalog` port, AI as a swappable tier behind `AiRung`, local-first writes with an outbox seam, coach copy in a reviewed key store, read-only export port.
- **No-Dark-Patterns Standard** (`docs/no-dark-patterns-standard.md`): no streaks, countdowns, badges, celebratory pop-ups, push re-engagement, card sprawl, red-guilt states or resolve spinners; named-reviewer sign-off.
- **Zero telemetry** by default; only user-initiated network paths (Open Food Facts barcode lookup, the user's own BYOK endpoint). Pinned by an import-based gate and a built-bundle host scan.
- **Adults-only, no biometrics, no under-13 profiles.**
- **Honest quantities** (`QuantityRange`, never false-exact kcal).
- **Self-host first:** one command, hardened static nginx container, strict CSP, no server-side user data, HTTPS via Caddy or Traefik.

## Alternatives considered

- **Stay on Flutter and polish the web build.** Rejected: keeps CanvasKit, the accessibility and testing friction, and the store-oriented native code that will never ship.
- **Flutter plus Capacitor or a hosted native shell now.** Rejected: pays the native cost with no store to ship to.
- **Svelte or Solid instead of React.** Not rejected on merit; React 19 was chosen to match the maintainer's other app (ai-finance-coach) and its ecosystem for testing and a11y tooling.
