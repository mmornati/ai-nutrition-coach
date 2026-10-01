// Cloudflare Workers AI — the v1 default free provider (Story 3.2 /
// FR6 / OQ-2).
//
// STUB. Hosted tiers MUST be served through a server-side relay (S5).
//
// A Cloudflare API token is a credential for the project's account. It must
// never be compiled into, or shipped with, the client: anything in a web
// bundle or an APK can be extracted and used by anyone, with no quota. The
// only acceptable shape is:
//
//     app  ──(photo, no credential)──►  OpenPlate relay  ──(token)──►  Cloudflare
//
// where the relay holds the token and enforces the per-day quota
// server-side (the on-device `QuotaCounter` is a courtesy, not a control).
// That relay does not exist yet, so this adapter deliberately has no token
// parameter and makes no request. See `docs/ai-tiers.md` ("Hosted tiers
// need a relay").
//
// PRD OQ-2: the concrete free provider (Cloudflare Workers AI vs
// Gemini free tier) is a build-time adapter choice behind
// `HostedQuotaProvider`. The v1 default ships this adapter; the
// Gemini adapter is a stub the build can swap in. The rung
// stitches the quota counter + the provider behind the same port.
//
// FR13: no biometric identification. The adapter takes raw photo
// bytes and returns foods; no device fingerprint, no user identity.
//
// FR12 / NFR4: the adapter never emits telemetry; the request
// URL never includes user-identifying material; the API token is
// never logged or reflected.

import 'dart:typed_data';

import 'hosted_quota_provider.dart';

/// The v1 default `HostedQuotaProvider` adapter. Calls Cloudflare
/// Workers AI's free vision model via `dio`. The v1 build wires
/// this adapter behind `HostedQuotaAiRung`; the OQ-2 build-time
/// swap replaces this with the Gemini stub (or a real Gemini
/// adapter) without touching the rung or the core.
class CloudflareWorkersAiProvider implements HostedQuotaProvider {
  const CloudflareWorkersAiProvider({
    this.relayUrl = '',
    this.model = '@cf/llava-1.5-7b-hf',
  });

  /// The URL of the OpenPlate relay that fronts Cloudflare (S5). Not a
  /// secret, and NOT a Cloudflare URL: the app never talks to Cloudflare
  /// directly and never holds its token. Empty until the relay exists.
  final String relayUrl;

  /// The Cloudflare Workers AI model id. Defaults to the LLaVA
  /// vision model (Cloudflare's free tier ships LLaVA + a small
  /// Whisper variant at zero cost; the LLaVA model is the food-
  /// recognition-friendly choice).
  final String model;

  @override
  Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes}) async {
    // OQ-2 stub body — the Cloudflare Workers AI integration is a
    // v1.1 effort (see the FR6 future-work note in
    // `docs/ai-tiers.md`). The v1 Story 3.2 build returns
    // `HostedQuotaFailure` so a build that accidentally selects
    // `AiRungKind.hostedQuota` with this default adapter degrades
    // honestly — the UI renders the calm "Search isn't available
    // right now" line and the user can still log the plate via
    // closest-matches + manual fallback.
    //
    // The actual call goes to the relay (`relayUrl`), which holds the
    // Cloudflare token and POSTs to Cloudflare's `ai/run/$model`. It is the
    // OQ-2 follow-up and needs the relay first (S5). The Story 3.2 ladder carries the quota
    // counter + the 3-way notice surface so the
    // OQ-2 transport swap is a one-file change.
    return const HostedQuotaFailure(
      'Cloudflare Workers AI integration is an OQ-2 follow-up — '
      'see docs/ai-tiers.md.',
    );
  }
}
