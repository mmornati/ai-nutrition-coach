// `HostedQuotaAiRung` — the hosted-quota rung (Story 3.2 / FR6 / AD-5).
//
// Fills in the Story 3.1 stub. The rung reads through the
// `QuotaCounter` for the per-day quota bookkeeping and through the
// `HostedQuotaProvider` for the transport. The four outcomes map
// onto the `RecognitionResult` sealed hierarchy as:
//   * `HostedQuotaRecognized(foods)` → `RecognizedPlate(foods: foods)`
//   * `HostedQuotaNoMatch()`          → `NoMatch()`
//   * `HostedQuotaFailure(cause)`     → `RecognitionFailure(cause)`
//
// On quota exhaustion (counter reaches `ceiling`), the rung
// returns `QuotaExhausted(resetAt: <next UTC midnight local>)` so
// the UI can render the calm 3-way choice (FR6). The rung never
// throws across the `AiRung` port boundary — transport failures
// are wrapped in `RecognitionFailure` so the UI renders a single
// calm message regardless of cause. The v1 quota ceiling is
// `kHostedQuotaPerDay = 50` (FR6 disclosed in-app and in docs).
//
// AD-5: the core never branches on whether the rung is
// `hostedQuota` vs `noOp`. The active rung is selected by config
// and reads through `aiRungProvider`; a quota notice from
// `QuotaExhausted` triggers a config update on the user-driven
// path (Story 3.3 owns the Settings surface).
//
// FR6: the quota is disclosed in-app (Settings → Your AI status
// line) and in docs (`docs/ai-tiers.md`).
//
// FR13: no biometric identification. The rung takes raw photo
// bytes and returns foods; no device fingerprint, no user identity.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

import 'hosted_quota_provider.dart';
import 'quota_counter.dart';

/// The per-day quota ceiling (FR6). Disclosed in-app (Settings →
/// Your AI status line) and in docs (`docs/ai-tiers.md`).
const int kHostedQuotaPerDay = 50;

/// The v1 active rung for the `hostedQuota` slot (Story 3.2 / FR6).
/// Reads through the [QuotaCounter] for quota bookkeeping and
/// through the [HostedQuotaProvider] for the transport. Returns
/// the four `RecognitionResult` variants per the I/O matrix in
/// `spec-3-2-hosted-quota-rung-with-honest-3-way-quota-exhaustion.md`.
class HostedQuotaAiRung implements AiRung {
  const HostedQuotaAiRung({
    required QuotaCounter quotaCounter,
    required HostedQuotaProvider provider,
  }) : _quotaCounter = quotaCounter,
       _provider = provider;

  final QuotaCounter _quotaCounter;
  final HostedQuotaProvider _provider;

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // N9: ONE atomic step checks the ceiling and takes the slot — so an
    // exhausted quota never reaches the transport (FR6: the user sees the
    // calm 3-way choice instead of a round-trip that would fail anyway), two
    // overlapping calls cannot both take the last slot, and every attempt
    // counts, successful or not. The slot is taken BEFORE the call, so a
    // provider that errors or times out cannot be hammered without bound.
    // A failing counter is reported, not thrown across the port.
    try {
      if (!await _quotaCounter.tryConsume()) {
        return QuotaExhausted(resetAt: await _quotaCounter.resetAt());
      }
    } on Object {
      return const RecognitionFailure('the usage counter is unavailable');
    }

    // Make the transport call — wrap outcomes in the sealed
    // `RecognitionResult` hierarchy. The rung never throws across
    // the `AiRung` port boundary; transport errors are wrapped in
    // `RecognitionFailure` so the UI renders a single calm message
    // regardless of cause.
    final outcome = await _provider.recognize(photoBytes: photoBytes);

    switch (outcome) {
      case HostedQuotaRecognized(:final foods):
        return RecognizedPlate(foods: foods);

      case HostedQuotaNoMatch():
        return const NoMatch();

      case HostedQuotaFailure(:final cause):
        return RecognitionFailure(cause);
    }
  }
}
