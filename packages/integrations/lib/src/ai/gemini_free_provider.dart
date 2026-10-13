// Gemini free tier — the OQ-2 alternative free provider (Story 3.2
// / FR6 / OQ-2).
//
// The v1 Story 3.2 default ships the Cloudflare Workers AI
// adapter; this is the OQ-2 build-time swap. The adapter is a
// stub — the actual Gemini integration is a v1.1 effort (see
// `docs/ai-tiers.md` for the future-work note).
//
// PRD OQ-2: the concrete free provider is a build-time adapter
// choice behind `HostedQuotaProvider`. The v1 default ships
// `CloudflareWorkersAiProvider`; this stub is what the OQ-2 build
// plugs in behind the same port.
//
// FR13: no biometric identification. The adapter takes raw photo
// bytes and returns foods (or a transport failure); no device
// fingerprint, no user identity.
//
// FR12 / NFR4: the adapter never emits telemetry; the API key is
// never logged or reflected in `toString`.

import 'dart:typed_data';

import 'hosted_quota_provider.dart';

/// The OQ-2 alternative `HostedQuotaProvider` adapter (Gemini free
/// tier). The v1 Story 3.2 build wires Cloudflare Workers AI; the
/// OQ-2 swap replaces that wiring with this adapter without
/// touching the rung or the core.
///
/// The v1 Story 3.2 stub returns `HostedQuotaFailure` so a build
/// that accidentally selects `AiRungKind.hostedQuota` with this
/// adapter degrades honestly. The Gemini integration is a v1.1
/// effort (see `docs/ai-tiers.md`).
class GeminiFreeProvider implements HostedQuotaProvider {
  const GeminiFreeProvider({this.apiKey = ''});

  /// The Gemini API key. A build-time configuration value (read
  /// from `--dart-define=GEMINI_API_KEY=...` or equivalent).
  /// Empty in tests. The key is never logged or reflected in
  /// `toString` (FR7 / NFR4).
  final String apiKey;

  @override
  Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes}) async {
    // OQ-2 stub body — the Gemini integration is a v1.1 effort.
    return const HostedQuotaFailure('gemini free tier not yet wired (OQ-2)');
  }
}
