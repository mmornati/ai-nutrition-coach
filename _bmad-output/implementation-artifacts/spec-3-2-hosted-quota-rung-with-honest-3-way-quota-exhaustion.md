---
title: 'Story 3.2 — Hosted-quota rung with honest 3-way quota exhaustion (FR6)'
type: 'feature'
created: '2026-08-16'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'e6708b2'
context:
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/spec-3-1-ai-rung-port-with-swappable-implementations.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.1 declared the `hosted-quota` rung slot behind the `AiRung` port. To honour FR6 the active rung, when configured as `hostedQuota`, must call a configured free provider (Cloudflare Workers AI or Gemini free tier — PRD OQ-2) within a per-day quota, return `RecognizedPlate(foods: [...])` for successful recognitions, return `RecognitionFailure` for transport failures, and — on quota exhaustion — return `QuotaExhausted(resetAt: ...)` so the UI can render the calm 3-way choice (keep logging without AI / bring your own key / wait for reset). The quota is disclosed in-app and in docs; choosing to continue downgrades the active rung to `noOp` instantly with a `· local` posture and no dead-end.

**Approach:** Fill in the `HostedQuotaAiRung` stub from Story 3.1. Add a `QuotaCounter` in `packages/integrations/lib/src/ai/quota_counter.dart` — a pure-Dart in-memory counter plus an opaque persisted counter under `flutter_secure_storage` (Keychain/Keystore on mobile, session-only on web); the counter is never part of the core. Add a `HostedQuotaProvider` port + adapter selecting the configured free provider behind a single seam (PRD OQ-2 resolved at build time). The adapter calls the provider within the per-day quota; on exhaustion returns `QuotaExhausted(resetAt)` carrying the configured reset window (UTC midnight local time, or the provider-documented reset time). The UI handler for `QuotaExhausted` opens the Settings → Your AI quota notice (Story 3.3 owns the Your AI surface), which renders the 3-way calm choice; choosing "keep logging without AI" instantly flips the active rung to `noOp` (a one-line config update — no core branch, AD-5).

## Boundaries & Constraints

**Always:**
- AD-1: `QuotaCounter` lives in `packages/integrations`; the core never imports it. `HostedQuotaProvider` port lives in `packages/integrations` (it's a transport port — not a domain port).
- AD-5: the core never branches on whether the rung is `hostedQuota` vs `noOp`. The active rung is selected by config and reads through `aiRungProvider`; a quota notice from `QuotaExhausted` triggers a config update on the user-driven path (Story 3.3 owns the Settings surface).
- AD-7: every rung copy (the quota notice, the 3-way choice, the "quota resets at <time>" line) lives in the localization key store at `packages/integrations/lib/src/l10n/coach_strings.dart` (extended by Story 3.2); no string interpolation in widgets.
- FR6 / UX-DR10: the 3-way choice copy is calm, plain-language, zero pressure, no countdown, no spinner, no "Don't show again" easter egg.
- FR6: quota is disclosed in-app (Settings → Your AI status line) and in docs (`README` + a new `docs/ai-tiers.md`).
- FR12: telemetry off by default in all shipped builds — `HostedQuotaAiRung` never emits telemetry; the free provider is called via the configured adapter, no analytics wrapper.
- FR13: no biometric identification in the quota path. The rung never fingerprints the device or the user; the counter is keyed by `(providerKind, localDay)` only.
- NFR4: the quota counter key, the reset timestamp, and the active rung kind are never logged or reflected in UI plaintext beyond the calm mono status line.
- AD-8 (mobile): the quota counter persists via `flutter_secure_storage` (Keychain/Keystore); on web the counter is session-only and never persists (documented as weaker).
- PRD OQ-2: the concrete free provider (Cloudflare Workers AI vs Gemini free tier) is a build-time adapter choice behind `HostedQuotaProvider`; the core never sees the transport. The v1 default ships the Cloudflare Workers AI adapter; the Gemini adapter is a stub the build can swap in.

**Ask First:**
- Whether the per-day quota is configured at build time (`const int kHostedQuotaPerDay = 50`) or read from the free provider's response — the spec ships the build-time constant as the v1 default (FR6 discloses it in-app and in docs); the counter resets at UTC midnight in the local timezone.
- Whether the quota notice surfaces inline on the photo capture screen after a `QuotaExhausted` returns, or only in Settings → Your AI — the spec ships both: a one-line mono notice on the capture screen ("the free quota is done — choose what you'd like to do") that links to Settings; the full 3-way choice lives in Settings.

**Never:**
- No countdown timer anywhere in the UI; no "X calls remaining" pill that updates in real time.
- No "Don't show again" easter egg on the quota notice (that's a quota gate pattern, not a coach pattern — FR15).
- No telemetry; no logs that include the photo bytes, the provider URL, or the API key (the byok story is 3.3; this story never touches a key).
- No spinner on the quota notice; the notice is calm mono status copy.
- No quota exhaustion that blocks the log: the user always has "keep logging without AI" as one of the three calm paths (FR6 / UJ-4).
- No branching on the active rung in the core; the 3-way choice flips the config and the provider graph does the rest.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_RECOGNIZE | `HostedQuotaAiRung.recognize(bytes)` with counter < quota and provider returns recognized foods | Returns `RecognizedPlate(foods: [...])`; counter increments by 1 | N/A |
| HAPPY_PATH_NO_MATCH | Provider returns no foods | Returns `NoMatch()`; counter does not increment (no recognition happened) | N/A |
| HAPPY_PATH_QUOTA_LEFT_STATUS | Settings → Your AI opens with counter < quota | Status line reads `free model — N calls left today` in `AppTypography.mono` | N/A |
| QUOTA_EXHAUSTED | Counter reaches `kHostedQuotaPerDay`; next `recognize` call | Returns `QuotaExhausted(resetAt: <next UTC midnight local>)`; UI renders the 3-way choice | Typed result; UI is responsible for surfacing the notice |
| PROVIDER_DOWN | Provider adapter throws a transport error | Returns `RecognitionFailure(cause)`; counter does not increment | Typed result; UI renders the calm failure line |
| QUOTA_RESET | Local day rolls over (UTC midnight local) | Counter resets to 0; next `recognize` call returns `RecognizedPlate(...)` as usual; no log entry, no event | N/A |
| KEEP_LOGGING_WITHOUT_AI | User picks the first calm path on the 3-way choice | Active rung flips to `AiRungKind.noOp`; `aiRungProvider` returns `NoopAiRung`; status line reads `offline (no AI)`; photo path continues to resolve via closest-matches + manual | N/A |
| BRING_YOUR_OWN_KEY | User picks the second calm path | Story 3.3 owns this path — opens the BYOK entry screen | N/A |
| WAIT_FOR_RESET | User picks the third calm path | Notice closes; status line reads `free model — resets at <human-readable local time>`; the rung stays `hostedQuota` until the next reset | N/A |
| WEB_SESSION_RESET | Web client reloads without persisting the counter | Counter starts at 0; quota is per-session (AD-8 consequence, documented in `docs/ai-tiers.md`) | N/A |
| DARK_MODE | UI rendered with `AppPalette.dark` | Quota notice and status line use existing palette tokens; no color tokens in rung copy | N/A |
| REDUCED_MOTION | OS reduce-motion enabled | Quota notice enters via fade (handled by Story 3.3's settings surface, not this story) | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/value_types/ai_rung_kind.dart` -- unchanged from Story 3.1; `AiRungKind.hostedQuota` is the slot this story fills
- `packages/domain_core/lib/src/results/recognition_failure.dart` -- unchanged from Story 3.1; `QuotaExhausted` is the variant this story returns
- `packages/integrations/lib/src/ai/quota_counter.dart` -- new; `class QuotaCounter` with `Future<int> callsToday()`, `Future<void> recordCall()`, `Future<DateTime?> resetAt()`; persistence via `flutter_secure_storage` under a typed `QuotaCounterKey` (mobile: Keychain/Keystore; web: session-only); the counter is keyed by `(providerKind, localDay)` and never leaves the device
- `packages/integrations/lib/src/ai/hosted_quota_provider.dart` -- new; `abstract interface class HostedQuotaProvider { Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes}); }` -- the transport port; `HostedQuotaOutcome = HostedQuotaRecognized(List<RecognizedFood>) | HostedQuotaNoMatch | HostedQuotaFailure(Object cause)`
- `packages/integrations/lib/src/ai/cloudflare_workers_ai_provider.dart` -- new; the v1 default `HostedQuotaProvider` adapter; calls Cloudflare Workers AI's free vision model; returns the typed outcome; no key material is logged or reflected
- `packages/integrations/lib/src/ai/gemini_free_provider.dart` -- new; stub adapter returning `HostedQuotaFailure('gemini free tier not yet wired (OQ-2)')`; the OQ-2 selection is a build-time swap
- `packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart` -- fill in the stub from Story 3.1; constructor takes `QuotaCounter` + `HostedQuotaProvider`; `recognize` returns `RecognizedPlate(foods: [...])` / `NoMatch` / `RecognitionFailure` / `QuotaExhausted(resetAt: ...)` per the I/O matrix
- `packages/integrations/lib/src/l10n/coach_strings.dart` -- extend with rung copy: `quota.notice.short`, `quota.notice.long`, `quota.choice.keepLogging`, `quota.choice.byok`, `quota.choice.wait`, `quota.status.freeModelRemaining`, `quota.status.offlineNoAi`, `quota.status.resetAt` -- each entry is a calm non-judgmental sentence, no countdown vocabulary
- `packages/integrations/lib/integrations.dart` -- barrel update
- `packages/integrations/test/hosted_quota_ai_rung_test.dart` -- new; pins the four outcomes against a fake `QuotaCounter` + `HostedQuotaProvider`
- `packages/integrations/test/quota_counter_test.dart` -- new; pins the day rollover, the persistence path, and the web-session semantics
- `packages/integrations/test/hosted_quota_provider_test.dart` -- new; pins the `CloudflareWorkersAiProvider` outcome shape via a fake HTTP client; pins the Gemini stub failure shape
- `apps/client/lib/state/quota_notice_provider.dart` -- new; `quotaNoticeProvider` (a `StateProvider<QuotaNotice?>`) that the capture screen watches; resets on rung flip or after the 3-way choice resolves
- `apps/client/lib/state/ai_rung_provider.dart` -- extend `aiRungProvider` to read the config + construct the `HostedQuotaAiRung` when `AiRungKind.hostedQuota` is selected; Story 3.3 adds the `byok` branch
- `apps/client/lib/main.dart` -- override `aiRungConfigProvider` with `const AiRungConfig(kind: AiRungKind.hostedQuota)` (or leave as `noOp` for Story 3.1 default; the override is opt-in by config); instantiate the `QuotaCounter` + `CloudflareWorkersAiProvider` + `HostedQuotaAiRung` and override `aiRungProvider` accordingly
- `apps/client/test/state/quota_notice_provider_test.dart` -- new; pins the notice lifecycle (set on `QuotaExhausted`, cleared on user choice)
- `apps/client/test/state/ai_rung_provider_test.dart` -- extend with the `hostedQuota` branch
- `apps/client/lib/screens/capture_photo_screen.dart` -- watch `quotaNoticeProvider`; render the calm mono one-liner when the notice is set; tapping the line opens Settings → Your AI (Story 3.3 owns the full surface)
- `docs/ai-tiers.md` -- new; documents the three rungs, the per-day quota, the reset window, the 3-way choice, the BYOK path, the v2 local-model seam; the doc carries the FR6 quota disclosure + the "no telemetry" guarantee

## Tasks & Acceptance

**Execution:**
- [ ] `packages/integrations/lib/src/ai/quota_counter.dart` -- `QuotaCounter` with `callsToday()`, `recordCall()`, `resetAt()`, persistence under `flutter_secure_storage`; mobile persists, web session-only; counter key = `(providerKind, localDay)`
- [ ] `packages/integrations/lib/src/ai/hosted_quota_provider.dart` -- `HostedQuotaProvider` port + sealed outcome; pure transport port; the core never sees it
- [ ] `packages/integrations/lib/src/ai/cloudflare_workers_ai_provider.dart` -- the v1 default adapter; calls the configured free vision model; returns the typed outcome; no key material is logged
- [ ] `packages/integrations/lib/src/ai/gemini_free_provider.dart` -- stub adapter (OQ-2 selection; build-time swap)
- [ ] `packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart` -- fill in the Story 3.1 stub; constructor takes `QuotaCounter` + `HostedQuotaProvider`; returns the four outcomes per the I/O matrix
- [ ] `packages/integrations/lib/src/l10n/coach_strings.dart` -- extend with the eight rung copy entries; named NDP reviewer sign-off in one file
- [ ] `packages/integrations/lib/integrations.dart` -- barrel update
- [ ] `packages/integrations/test/hosted_quota_ai_rung_test.dart` -- pins the four outcomes against fakes
- [ ] `packages/integrations/test/quota_counter_test.dart` -- pins the day rollover + persistence + web-session semantics
- [ ] `packages/integrations/test/hosted_quota_provider_test.dart` -- pins the adapter outcome shape via a fake HTTP client
- [ ] `apps/client/lib/state/quota_notice_provider.dart` -- `quotaNoticeProvider` lifecycle
- [ ] `apps/client/lib/state/ai_rung_provider.dart` -- extend with the `hostedQuota` branch
- [ ] `apps/client/lib/main.dart` -- wire the `QuotaCounter` + `CloudflareWorkersAiProvider` + `HostedQuotaAiRung` overrides
- [ ] `apps/client/test/state/quota_notice_provider_test.dart` -- pin the notice lifecycle
- [ ] `apps/client/test/state/ai_rung_provider_test.dart` -- extend with the `hostedQuota` branch
- [ ] `apps/client/lib/screens/capture_photo_screen.dart` -- render the calm mono one-liner on `quotaNoticeProvider` change; tap opens Settings → Your AI
- [ ] `docs/ai-tiers.md` -- document the three rungs, the quota, the reset, the 3-way choice, the BYOK path, the v2 seam; FR6 quota disclosure

**Acceptance Criteria:**
- Given the default AI rung is `hostedQuota`, when a photo needs estimation, then the rung calls the configured free provider within the per-day quota (FR6).
- Given the per-day quota is exhausted, when a photo needs estimation, then `QuotaExhausted(resetAt: <next UTC midnight local>)` is returned and the UI surfaces the calm 3-way choice with zero pressure, no countdown (FR6 / UJ-4 / UX-DR10).
- Given the user picks "keep logging without AI", when the choice resolves, then the active rung flips to `AiRungKind.noOp` instantly and the photo path resolves via `NoopAiRung` with `· local` posture; no dead-end (FR6 / AD-5).
- Given the quota resets at UTC midnight local, when the user picks "wait for reset", then the status line reads `free model — resets at <human-readable local time>` and the rung stays `hostedQuota` until the next reset (FR6).
- Given the AD-1 invariant, when `melos run test` runs, then `packages/domain_core/lib/` remains free of Flutter/drift/dio/image_picker/mobile_scanner/flutter_secure_storage imports (QuotaCounter lives in `packages/integrations`).
- Given the AD-7 invariant, when the quota notice renders, then every string resolves by key from the `en` key store; no string interpolation in widgets; named NDP reviewer signs off in one file.
- Given the FR13 invariant, when the rung runs, then no biometric identification happens; the counter is keyed by `(providerKind, localDay)` only.
- Given `docs/ai-tiers.md`, when a tracker reads the docs, then the per-day quota, the reset window, the 3-way choice, and the BYOK path are all disclosed in plain language (FR6).

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `hosted_quota_ai_rung_test.dart` + `quota_counter_test.dart` + `hosted_quota_provider_test.dart` pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/state/ai_rung_provider_test.dart test/state/quota_notice_provider_test.dart"` -- expected: provider config-driven selection passes for the `hostedQuota` branch; notice lifecycle passes
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `QuotaCounter` persists via `flutter_secure_storage` on mobile and is session-only on web -- the AD-8 honest-difference story is documented in `docs/ai-tiers.md`.
- Confirm the 3-way choice copy resolves by key from `coach_strings.dart`; no hardcoded copy in `apps/client/lib`; no countdown vocabulary in any entry.
- Confirm the quota notice never triggers a spinner, countdown, or "Don't show again" easter egg; the user always has "keep logging without AI" as a calm path.
- Confirm `QuotaExhausted` returns `resetAt` for the next UTC midnight in local time; the UI renders the timestamp as a human-readable string (e.g. "tomorrow at 7:00 AM"), never a countdown.

## Suggested Review Order

**Quota counter (NFR4, AD-8)**
- Day-keyed counter, persisted on mobile, session-only on web.
  [`quota_counter.dart`](../../packages/integrations/lib/src/ai/quota_counter.dart)

**Hosted quota transport port**
- The provider-agnostic transport seam; core never sees the transport.
  [`hosted_quota_provider.dart`](../../packages/integrations/lib/src/ai/hosted_quota_provider.dart)

**Default provider adapter**
- Cloudflare Workers AI as the v1 default; OQ-2 build-time swap.
  [`cloudflare_workers_ai_provider.dart`](../../packages/integrations/lib/src/ai/cloudflare_workers_ai_provider.dart)

**Hosted-quota rung**
- Returns the four outcomes per the I/O matrix; quota exhaustion surfaces the calm 3-way choice.
  [`hosted_quota_ai_rung.dart`](../../packages/integrations/lib/src/ai/hosted_quota_ai_rung.dart)

**Rung copy (AD-7, NFR3)**
- Eight calm non-judgmental entries in the `en` key store; named NDP reviewer sign-off.
  [`coach_strings.dart`](../../packages/integrations/lib/src/l10n/coach_strings.dart)

**Notice lifecycle (FR6, UX-DR10)**
- Capture screen renders the calm mono one-liner; tap opens Settings → Your AI.
  [`quota_notice_provider.dart`](../../apps/client/lib/state/quota_notice_provider.dart)

**Docs (FR6)**
- The quota, the reset, the 3-way choice, the BYOK path, the v2 seam -- disclosed in plain language.
  [`docs/ai-tiers.md`](../../docs/ai-tiers.md)

---

## Dev Agent Record

### Implementation Plan

(To be populated by the dev agent on completion.)

### Completion Notes

(To be populated by the dev agent on completion.)

### Debug Log

(To be populated by the dev agent on completion.)

### File List

(To be populated by the dev agent on completion.)

### Change Log

(To be populated by the dev agent on completion.)

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items