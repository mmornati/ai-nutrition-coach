// OpenAI-compatible BYOK provider (Story 3.3 / FR7).
//
// The v1 default BYOK provider calls an OpenAI-compatible endpoint
// (the URL is build-time configuration; defaults to an empty value
// for v1 — the OQ-2 follow-up selects the concrete provider URL).
// The adapter sends the user-supplied BYOK key in the
// `Authorization: Bearer <key>` header.
//
// FR7 / NFR4: the key never appears in any string the adapter
// produces. The `toString` is redacted; error envelopes, logs, and
// telemetry never carry the key (the provider implementation
// reads the key only to send it as the `Authorization` header).
//
// FR13: no biometric identification in the BYOK path.
//
// The Story 3.3 body returns `ByokFailure` stubs — the actual
// OpenAI-compatible HTTP integration is an OQ-2 v1.1 effort
// documented in `docs/ai-tiers.md`. The ladder carries the key
// store + the previous-rung flip-back + the Your AI surface so
// the OQ-2 transport swap is a one-file change.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

import 'byok_openai_compatible_provider.dart';

/// The v1 default `ByokOpenAiCompatibleProvider` adapter. Sends the
/// user-supplied BYOK key in the `Authorization: Bearer <key>`
/// header to the configured OpenAI-compatible endpoint.
///
/// The v1 build wires this adapter behind `ByokAiRung`; the OQ-2
/// build-time swap replaces the body with a real HTTP integration
/// (OpenAI vs Azure OpenAI vs a self-hosted OpenAI-compatible
/// endpoint) without touching the rung or the core.
class OpenAiCompatibleByokProvider implements ByokOpenAiCompatibleProvider {
  const OpenAiCompatibleByokProvider({
    this.endpointUrl = '',
  });

  /// The OpenAI-compatible endpoint URL. A build-time configuration
  /// value (read from `--dart-define=BYOK_OPENAI_ENDPOINT=...` or
  /// equivalent). Empty in tests. The URL never carries the key
  /// (FR7 — no key in URL query strings).
  final String endpointUrl;

  @override
  Future<ByokOutcome> recognize({
    required Uint8List photoBytes,
    required String apiKey,
  }) async {
    // OQ-2 stub body — the OpenAI-compatible HTTP integration is a
    // v1.1 effort (see the FR7 future-work note in
    // `docs/ai-tiers.md`). The v1 Story 3.3 build returns
    // `ByokFailure` so a build that accidentally selects
    // `AiRungKind.byok` with this default adapter degrades honestly.
    //
    // The actual HTTP call (a POST to `$endpointUrl/v1/chat/completions`
    // with the photo bytes encoded as a user message and
    // `Authorization: Bearer <apiKey>`) is the OQ-2 follow-up. The
    // Story 3.3 ladder carries the key store + the previous-rung
    // flip-back + the Your AI surface so the OQ-2 transport swap is
    // a one-file change.
    //
    // The key (`apiKey`) is deliberately NOT included in the
    // failure message — FR7 / NFR4 invariant.
    return const ByokFailure(
      'OpenAI-compatible BYOK integration is an OQ-2 follow-up — '
      'see docs/ai-tiers.md.',
    );
  }

  /// Redacted `toString` (FR7 / NFR4) — never include the
  /// endpoint URL either, since a URL may carry query-string
  /// material in future.
  @override
  String toString() => 'OpenAiCompatibleByokProvider(endpointUrl: redacted)';
}