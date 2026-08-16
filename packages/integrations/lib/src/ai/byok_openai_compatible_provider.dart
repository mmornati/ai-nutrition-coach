// Transport port for the BYOK provider (Story 3.3 / FR7).
//
// `ByokOpenAiCompatibleProvider` is the transport-agnostic seam the
// `ByokAiRung` reads through. The concrete provider (OpenAI-compatible
// endpoint with `Authorization: Bearer <key>`) lives behind this port
// so the core and the rung never see the transport.
//
// The port is a `packages/integrations` concern — it is a transport
// port, not a domain port. The `AiRung` port in `packages/domain_core`
// is unaware of it; the rung stitches them together with the
// `ByokKeyStore`.
//
// FR7 / NFR4: the key never appears in any string the adapter
// produces. The adapter sends the key via the `Authorization` header
// only — never in a URL query string, never in a body, never in a log
// or error envelope.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The outcome of a single `ByokOpenAiCompatibleProvider.recognize`
/// call. Same shape as `HostedQuotaOutcome`; the two transport
/// ports share the same per-day-quota / recognition-shape contract
/// (FR6 / FR7).
sealed class ByokOutcome {
  const ByokOutcome();
}

/// The provider recognized zero or more foods. An empty list is
/// *not* a transport failure — the rung translates this to
/// `RecognizedPlate(foods: foods)`.
class ByokRecognized extends ByokOutcome {
  const ByokRecognized(this.foods);

  final List<RecognizedFood> foods;
}

/// The provider saw no food on the plate.
class ByokNoMatch extends ByokOutcome {
  const ByokNoMatch();
}

/// The transport failed. Distinct variants for transport failures
/// vs auth-rejection vs quota-exhaustion so the rung can route
/// each to the right `RecognitionResult` shape (FR7 / FR6).
class ByokFailure extends ByokOutcome {
  const ByokFailure(this.cause);

  final Object cause;
}

/// The provider rejected the key (HTTP 401 / 403). The rung
/// translates this to a calm `RecognitionFailure('byok key
/// rejected by provider — check the key in Settings → Your AI')`
/// and surfaces the notice (FR7). The key is preserved on disk
/// (no auto-clear).
class ByokKeyRejected extends ByokOutcome {
  const ByokKeyRejected();
}

/// The provider's quota is exhausted. The rung translates this to
/// `QuotaExhausted(resetAt: ...)` (FR6 carry-over; FR7). The UI
/// surfaces the same calm 3-way choice as the hosted-quota rung.
class ByokQuotaExhausted extends ByokOutcome {
  const ByokQuotaExhausted({this.resetAt});

  final DateTime? resetAt;
}

/// The transport port the `ByokAiRung` reads through. The concrete
/// provider (OpenAI-compatible endpoint with `Authorization: Bearer
/// <key>`) implements this interface.
abstract interface class ByokOpenAiCompatibleProvider {
  /// Resolve the foods on a plate from raw photo bytes via the
  /// configured OpenAI-compatible endpoint, using the user-supplied
  /// BYOK key.
  ///
  /// The provider implementation reads the key from the caller-
  /// supplied `apiKey` parameter (the rung reads from `ByokKeyStore`
  /// and passes it here). The key never appears in any string the
  /// adapter produces — error envelopes, logs, telemetry, `toString`
  /// (FR7 / NFR4).
  Future<ByokOutcome> recognize({
    required Uint8List photoBytes,
    required String apiKey,
  });
}