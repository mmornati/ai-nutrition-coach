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
    required this._quotaCounter,
    required this._provider,
  });

  final QuotaCounter _quotaCounter;
  final HostedQuotaProvider _provider;

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // Quota check first — if exhausted, return `QuotaExhausted`
    // before any transport call (FR6 — "zero pressure, no
    // countdown"; the user sees the calm 3-way choice instead of
    // a network round-trip that would fail anyway).
    final exhausted = await _quotaCounter.isExhausted();
    if (exhausted) {
      final resetAt = await _quotaCounter.resetAt();
      return QuotaExhausted(resetAt: resetAt);
    }

    // Make the transport call — wrap outcomes in the sealed
    // `RecognitionResult` hierarchy. The rung never throws across
    // the `AiRung` port boundary; transport errors are wrapped in
    // `RecognitionFailure` so the UI renders a single calm message
    // regardless of cause.
    final outcome = await _provider.recognize(photoBytes: photoBytes);

    switch (outcome) {
      case HostedQuotaRecognized(:final foods):
        // Count the successful recognition (not the no-match —
        // no recognition happened on no-match; NFR5 honesty).
        if (foods.isNotEmpty) {
          await _quotaCounter.recordCall();
        }
        return RecognizedPlate(foods: foods);

      case HostedQuotaNoMatch():
        // No recognition happened — no quota call to record
        // (NFR5 honesty; the user didn't burn a quota slot on a
        // non-match).
        return const NoMatch();

      case HostedQuotaFailure(:final cause):
        // Transport failure — the counter does not increment
        // (NFR5 honesty; the user didn't burn a quota slot on a
        // transport failure).
        return RecognitionFailure(cause);
    }
  }
}
