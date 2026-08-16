# OpenPlate — AI Tiers

This document describes the v1 AI tier ladder: the four rungs the
`AiRung` port exposes, how they are configured, and how the
photo-recognition path behaves when each rung is active. It is the
canonical reference for FR6 (free quota honesty), FR7 (BYOK key
on-device), and FR8 (local-model v2 seam).

> Source of truth: the architecture spine (`ARCHITECTURE-SPINE.md`
> §AD-5 — AI tier ladder) and the story specs in
> `_bmad-output/implementation-artifacts/spec-3-1-…`,
> `spec-3-2-…`, and `spec-3-3-…`. This doc is the user-facing
> translation; the specs are the contract.

## The four rungs

Exactly one rung is active at any time. The active rung is
selected by `AiRungConfig` (a build-time value resolved once at
app start) and reads through `aiRungProvider`.

| Rung            | `AiRungKind`     | v1 status                          | Story    |
|-----------------|------------------|-------------------------------------|----------|
| Offline (no AI) | `noOp`           | Default; always available            | 1.8, 3.1 |
| Free model      | `hostedQuota`    | Active; per-day quota; 3-way notice  | 3.2      |
| Your key        | `byok`           | Active; encrypted on-device          | 3.3      |
| Local model     | `local`          | v2 seam — not implemented in v1      | 3.1      |

The v2 `local` rung exists in the type system and the provider
wiring (`LocalAiRung` implements `AiRung`); the v1 adapter throws
`UnsupportedError` on `recognize` so the seam is declared without
crashing the core.

## Free model — quota honesty (FR6)

The hosted-quota rung calls the configured free provider
(Cloudflare Workers AI by default — OQ-2) within a per-day
quota. The v1 quota is **`kHostedQuotaPerDay = 50`** calls per
local day. The quota resets at UTC midnight in the local
timezone.

When the quota is exhausted, the rung returns
`QuotaExhausted(resetAt: <next UTC midnight local>)`. The UI
renders a quiet plain-language 3-way choice with **zero
pressure, no countdown, no "Don't show again" easter egg**:

1. **keep logging without AI** — the rung flips to
   `AiRungKind.noOp` instantly; the photo path resolves via the
   closest-matches + manual fallback.
2. **bring your own key** — opens the BYOK entry surface (Story
   3.3).
3. **wait for the quota to reset** — the status line surfaces
   the reset timestamp as a calm human-readable local string
   (e.g. "tomorrow at 7:00 AM"); the rung stays `hostedQuota`
   until the next reset.

A successful recognition (non-empty foods) increments the
counter. An empty recognition (`RecognizedPlate(foods: [])`), a
`NoMatch()`, and a transport `RecognitionFailure` do **not**
burn a quota slot — the rung is honest about what counts as a
"call" (NFR5).

## BYOK — bring your own key (FR7)

The BYOK rung reads a user-supplied OpenAI-compatible API key
from on-device encrypted storage (`flutter_secure_storage`,
Keychain on iOS / macOS, EncryptedSharedPreferences on Android).
The key is sent to the configured provider on the user's behalf
via `Authorization: Bearer <key>`.

The key **never leaves the device** except as the
`Authorization` header on the user's own request. The key is:

- **Never** transmitted to any OpenPlate-owned server.
- **Never** logged in any form (plaintext, masked, base64, hash).
- **Never** reflected in UI plaintext (the masked text field
  uses `obscureText: true`; no character count; no key-shape
  preview).
- **Never** serialized to disk outside `flutter_secure_storage`.

Removing the key returns the app cleanly to the previous rung
(the one that was active before the key was entered). The
previous rung is remembered in `AiRungConfig.previousRung` so
the user gets back exactly what they had — not always
`noOp`.

### Web honesty (AD-8)

On web, the BYOK key is **session-only** — `flutter_secure_storage`
falls back to session storage on web (no OS keystore). The key
disappears on reload; the active rung flips back to the
previous rung on the next provider read. This is documented as
weaker than mobile, never asserted as equivalent (AD-8 honest-
difference story).

The hosted-quota counter follows the same honesty rule — on web
the counter is session-only; a reload resets it to zero.

## Telemetry off (FR12)

No telemetry is emitted on any rung. The free provider is called
via the configured adapter without an analytics wrapper. The
BYOK provider is called without an analytics wrapper. The
quota counter, the BYOK key store, and the rung config are
never wrapped in an analytics call.

## v2 local-model seam (FR8)

The `local` rung is reserved for v2. The v1 adapter
(`LocalAiRung`) throws `UnsupportedError` on `recognize`; the
seam is declared in the type system and provider wiring so a
future v2 implementation drops in behind the same port without
touching the core or the UI.

## Related docs

- `ARCHITECTURE-SPINE.md` — §AD-5 (AI tier ladder) and §AD-8
  (at-rest encryption honest-difference story).
- `_bmad-output/specs/spec-openplate/SPEC.md` — CAP-6 (AI tier
  ladder), FR6 / FR7 / FR8.
- `_bmad-output/implementation-artifacts/spec-3-2-…` — hosted-
  quota story spec.
- `_bmad-output/implementation-artifacts/spec-3-3-…` — BYOK
  story spec.