// `ByokAiRung` — the BYOK rung (Story 3.3 / FR7 / AD-5).
//
// Fills in the Story 3.1 stub. The rung reads the user-supplied
// API key from `ByokKeyStore` (encrypted at rest via
// `flutter_secure_storage`) and sends it to the configured
// `ByokOpenAiCompatibleProvider` on the user's behalf. The five
// `ByokOutcome` variants map onto the `RecognitionResult` sealed
// hierarchy as:
//   * `ByokRecognized(foods)`     → `RecognizedPlate(foods)`
//   * `ByokNoMatch()`             → `NoMatch()`
//   * `ByokFailure(cause)`        → `RecognitionFailure(cause)`
//   * `ByokKeyRejected()`         → `RecognitionFailure('byok key
//                                    rejected by provider — check
//                                    the key in Settings → Your
//                                    AI')` (FR7)
//   * `ByokQuotaExhausted(resetAt)` → `QuotaExhausted(resetAt)`
//                                    (FR6 carry-over; FR7)
//
// On missing key (`ByokKeyStore.hasKey()` returns `false`), the
// rung returns `RecognitionFailure('byok key missing — open
// Settings → Your AI to enter your key')` BEFORE any transport
// call (FR7 — the UI surfaces the calm notice).
//
// AD-5: the core never branches on whether the rung is `byok` vs
// `hostedQuota` vs `noOp`. The active rung is selected by config
// and reads through `aiRungProvider`; the user-driven rung flip
// from the BYOK entry screen updates the config (Story 3.3 owns
// the Your AI surface via `RecordByokChange`).
//
// FR7 / NFR4: the key never appears in any string the rung
// produces. The failure messages are redacted; the error
// envelopes never carry the key; the `toString` is redacted.
//
// FR13: no biometric identification in the BYOK path.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

import 'byok_key_store.dart';
import 'byok_openai_compatible_provider.dart';

/// The v1 active rung for the `byok` slot (Story 3.3 / FR7).
/// Reads through the [ByokKeyStore] for the encrypted on-device
/// key and through the [ByokOpenAiCompatibleProvider] for the
/// transport. Returns the five `RecognitionResult` variants per
/// the I/O matrix in
/// `spec-3-3-byok-bring-your-own-api-key.md`.
class ByokAiRung implements AiRung {
  const ByokAiRung({
    required this._keyStore,
    required this._provider,
  });

  final ByokKeyStore _keyStore;
  final ByokOpenAiCompatibleProvider _provider;

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // Key check first — if no key is stored, return the calm
    // "key missing" failure BEFORE any transport call (FR7).
    final hasKey = await _keyStore.hasKey();
    if (!hasKey) {
      return const RecognitionFailure(
        'byok key missing — open Settings → Your AI to enter your key',
      );
    }

    final apiKey = await _keyStore.read();
    if (apiKey == null || apiKey.isEmpty) {
      // Defensive — `hasKey()` said true but `read()` returned
      // empty. Return the calm "key missing" failure; the user
      // can re-enter the key on the Your AI surface.
      return const RecognitionFailure(
        'byok key missing — open Settings → Your AI to enter your key',
      );
    }

    // Make the transport call — wrap outcomes in the sealed
    // `RecognitionResult` hierarchy. The rung never throws across
    // the `AiRung` port boundary; transport errors are wrapped in
    // `RecognitionFailure` so the UI renders a single calm message
    // regardless of cause.
    final outcome = await _provider.recognize(
      photoBytes: photoBytes,
      apiKey: apiKey,
    );

    switch (outcome) {
      case ByokRecognized(:final foods):
        return RecognizedPlate(foods: foods);

      case ByokNoMatch():
        return const NoMatch();

      case ByokKeyRejected():
        // FR7: provider rejected the key (HTTP 401 / 403). The
        // key is preserved on disk (no auto-clear) so the user
        // can fix it without re-entering. The error envelope
        // never carries the key.
        return const RecognitionFailure(
          'byok key rejected by provider — check the key in '
          'Settings → Your AI',
        );

      case ByokQuotaExhausted(:final resetAt):
        // FR6 carry-over; FR7 — provider quota is exhausted, the
        // UI surfaces the same calm 3-way choice as the hosted-
        // quota rung.
        return QuotaExhausted(resetAt: resetAt);

      case ByokFailure(:final cause):
        return RecognitionFailure(cause);
    }
  }
}