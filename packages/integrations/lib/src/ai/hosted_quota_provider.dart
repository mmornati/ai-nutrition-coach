// Transport port for the configured free AI provider (Story 3.2 / FR6 / OQ-2).
//
// `HostedQuotaProvider` is the transport-agnostic seam the
// `HostedQuotaAiRung` reads through. The concrete provider
// (Cloudflare Workers AI by default; Gemini free tier as the OQ-2
// build-time swap) lives behind this port so the core and the rung
// never see the transport.
//
// The port is a `packages/integrations` concern — it is a
// transport port, not a domain port. The `AiRung` port in
// `packages/domain_core` is unaware of it; the rung stitches
// them together.
//
// FR13: no biometric identification. The transport takes raw
// photo bytes and returns foods (or a transport failure); no
// device fingerprint, no user identity.
//
// FR12 / NFR4: the transport never emits telemetry; the request
// URL never includes user-identifying material.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The outcome of a single `HostedQuotaProvider.recognize` call.
/// Exactly one of the three variants applies per call.
sealed class HostedQuotaOutcome {
  const HostedQuotaOutcome();
}

/// The provider recognized zero or more foods. An empty list is
/// *not* a transport failure — the rung should translate this to
/// `NoMatch()`.
class HostedQuotaRecognized extends HostedQuotaOutcome {
  const HostedQuotaRecognized(this.foods);

  final List<RecognizedFood> foods;
}

/// The provider saw no food on the plate. Distinct from an empty
/// `HostedQuotaRecognized` so the rung can distinguish "transport
/// failed" from "transport succeeded but matched nothing".
class HostedQuotaNoMatch extends HostedQuotaOutcome {
  const HostedQuotaNoMatch();
}

/// The transport failed (network down, malformed payload, etc.).
/// The rung translates this to `RecognitionFailure(cause)`; the UI
/// renders the calm failure line and still offers the closest-
/// matches + manual fallback. The rung never throws across the
/// `AiRung` port boundary — transport errors are wrapped here so
/// the UI can render a single calm message regardless of cause.
class HostedQuotaFailure extends HostedQuotaOutcome {
  const HostedQuotaFailure(this.cause);

  final Object cause;
}

/// The transport port the `HostedQuotaAiRung` reads through. The
/// concrete provider (Cloudflare Workers AI by default; Gemini free
/// tier as the OQ-2 build-time swap) implements this interface.
abstract interface class HostedQuotaProvider {
  /// Resolve the foods on a plate from raw photo bytes via the
  /// configured free provider.
  Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes});
}
