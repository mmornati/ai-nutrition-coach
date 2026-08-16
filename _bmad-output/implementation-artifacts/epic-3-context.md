# Epic 3 Context: Your AI, your rules (the AI tier ladder)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Use the free quota by default, plug in your own API key, and keep a reserved seam for a fully local model. The core stays complete and undegraded on every rung — no-AI is a first-class posture, not a fallback, and switching rungs never branches the core code.

## Stories

- Story 3.1: AiRung port with swappable implementations (config-selected rung; quota-exhausted variant; `local` v2 seam throws-on-use)
- Story 3.2: Hosted-quota rung with honest 3-way quota exhaustion (FR6)
- Story 3.3: BYOK — bring your own API key (FR7)

## Requirements & Constraints

- Exactly one `AiRung` implementation is active at any time; selection is a build-time config choice, never a runtime core branch (AD-5).
- The no-AI core is complete and undegraded: a tracker who never enables AI logs plates, gets coach whispers (Epic 2), and sees the same Day Board surface — there is no "AI mode" pill, no premium tier in the UI (FR6 / UJ-4 / SM-4).
- The free quota is disclosed in-app and in docs; on exhaustion the user gets a plain-language 3-way choice — keep logging without AI / bring your own key / wait for the quota to reset — with zero pressure, no countdown, no "Don't show again" easter egg as a coercion pattern (FR6 / FR15 / UJ-4 / UX-DR10).
- BYOK keys persist encrypted via Keychain/Keystore on mobile and equivalent on web, never leave the device, and never appear in logs, telemetry, or UI plaintext; removing a key returns the app cleanly to the previous rung with no stale state (FR7 / AD-8 / NFR4).
- All rung-specific copy lives in the localization key store (AD-7); no string interpolation in widgets; named NDP reviewer signs off every rung copy.
- The `local` rung is a declared v2 seam — declared in the type system and provider wiring, but throws-on-use in v1 (FR8 / OQ resolved by AD-5); the seam never crashes the core.
- The 3-way quota choice and rung copy never optimises engagement via streaks, badges, or countdowns (FR15 / SM-C2); telemetry stays off by default across all rungs (FR12).
- No biometric identification anywhere in the rung path (FR13); rungs that need network access (hosted-quota, BYOK) declare their transport explicitly and never leak the transport code into the core.

## Technical Decisions

- Hexagonal ports-and-adapters with a pure-Dart domain core (`packages/domain_core`, no Flutter/SQLite/HTTP imports); rung implementations live in `packages/integrations` behind the existing `AiRung` port (AD-1 / AD-5).
- The `AiRung` port gains a fourth sealed result variant — `QuotaExhausted` — alongside the existing `RecognizedPlate | NoMatch | RecognitionFailure` (conventions.md typed results). The variant carries a single `resetAt: DateTime?` so the UI can render the "wait for the quota to reset" path with an honest, optional timestamp; no spinner, no countdown.
- Exactly four implementations exist behind the port: `NoopAiRung` (existing, v1 default), `HostedQuotaAiRung` (Story 3.2), `ByokAiRung` (Story 3.3), `LocalAiRung` (v2 seam, throws `UnsupportedError` on `recognize`). Selection is a build-time `AiRungConfig` value resolved once in `apps/client/lib/main.dart` and overridden into the existing `aiRungProvider` (AD-5; never branchy).
- The provider graph reads `aiRungConfigProvider` (a `Provider<AiRungConfig>` that resolves the active rung by config) and feeds `aiRungProvider`; tests inject any of the four implementations without touching the UI (AD-5 seam).
- Quota bookkeeping for Story 3.2 lives in `packages/integrations/lib/src/ai/quota_counter.dart` — a pure-Dart in-memory counter plus an opaque persisted counter under `flutter_secure_storage` (Keychain/Keystore on mobile, session-only on web); the counter is never part of the core, and never leaves the device.
- BYOK key storage (Story 3.3) reuses `flutter_secure_storage` via a new `ByokKeyStore` adapter; the key is opaque to the core, never logged, never reflected in `toString()`, never serialized to disk outside the secure storage (AD-8 / FR7 / NFR4).
- The Settings → Your AI sub-screen (Story 3.3) is the only surface where the user changes the active rung or enters a BYOK key; rung status (active rung, quota remaining, BYOK key present / masked) is rendered as calm mono status text — never a pill that competes with the coach voice.
- Transport selection for hosted-quota (Cloudflare Workers AI vs Gemini free tier — PRD OQ-2) is a build-time adapter choice behind `HostedQuotaAiRung`; the core never sees the transport; the resolution path lives in `packages/integrations/lib/src/ai/hosted_quota/` (AD-5 / OQ-2).
- Stack pins unchanged from Epic 1/2: Flutter 3.47.0, Dart ^3.13.0, flutter_riverpod 3.4.2, drift 2.34.3, flutter_secure_storage 11.0.0, dio 5.11.0; conventions carry over (kebab-case files, snake_case packages, typed domain results, no raw exceptions crossing ports).

## UX & Interaction Patterns

- Settings → Your AI: one calm list (rung label + short mono status line). No toggles compete with the coach voice; the only interactive affordance is "change rung" → opens the rung choice sub-screen; "enter key" → BYOK key entry with masked input (FR7).
- Quota exhaustion notice (Story 3.2): quiet plain-language copy, three calm paths ("keep logging without AI / bring your own key / wait for the quota to reset"). The current rung chips down to `· local` posture on continuation; the photo path still resolves via the no-op rung (FR6 / UJ-4). No countdown, no spinner, no "Don't show again" easter egg.
- BYOK key entry: masked text field (`obscureText: true`), placeholder copy explains on-device encryption, the "save" affordance is a single quiet outline pill; no key-shaped preview, no character count, no plaintext echo, no toast on save (FR7 / NFR4 / UX-DR9).
- Your AI status surface: rung name + honest short status ("free model — 8 calls left today" / "your key — 1 model" / "offline (no AI)"). Status lines render in `AppTypography.mono` and never compete with `AppTypography.serifItalic` (the coach voice) or `AppTypography.ui` (the primary UI voice).
- Accessibility floor: 48px touch targets on every rung choice + BYOK entry affordance; screen reader announces the rung label and the status line by name (not by color); reduce-motion collapses the rung-flip transition to a fade; color is never the sole signal; dynamic type honored without truncation at the largest setting.
- No rung change triggers a spinner, countdown, or "Hang tight…" copy — the switch is immediate and quiet; a calm `arcnote` confirms "Your AI: <rung name>" on return (UX-DR6 carries over from Epic 1).
- Quota reset is described as "the quota resets at <human-readable local time>" when `resetAt` is known, or "the quota resets tomorrow" when it isn't — never a countdown timer (FR6 / UX-DR10).

## Cross-Story Dependencies

- Story 3.1 extends the `AiRung` port from Story 1.8 (which shipped the `no-op` rung as the v1 default). The port shape gains a `QuotaExhausted` variant; the existing `NoopAiRung` is unchanged. 3.1 lands first.
- Story 3.2 depends on the `QuotaExhausted` variant from Story 3.1; the `HostedQuotaAiRung` returns it when the per-day quota is exhausted and dispatches to the configured free provider otherwise.
- Story 3.3 depends on the port and config plumbing from Story 3.1 (the BYOK rung slots in behind the same `AiRungConfig` enum); Story 3.2's "bring your own key" path is the only Settings → Your AI affordance that opens 3.3's BYOK entry screen.
- Story 3.3's `ByokKeyStore` reuses `flutter_secure_storage` (the same dependency Story 1.2 used for the DB key); no new package import.
- The `local` v2 seam (FR8) is declared in Story 3.1 and never implemented in v1 — it throws-on-use so the type system and provider wiring are honest about the seam.
- Epic 4 (data ownership & self-host) will not touch the rung plumbing; the rung never persists logs (Epic 1's `RecordPlate` use-case owns the write path). Epic 5 (No-Dark-Patterns QA gate) signs off the rung copy at review time.
- Coach whisper (Epic 2) reads the active rung through `aiRungProvider` only when AI-on; when `no-op` is active the coach resolves to template-based copy with no rung call. The rung plumbing change in 3.1 must not change Epic 2's path.