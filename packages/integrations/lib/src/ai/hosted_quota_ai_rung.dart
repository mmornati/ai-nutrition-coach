// `HostedQuotaAiRung` stub (Story 3.1 / AD-5 / FR6).
//
// Story 3.1 declares the `hostedQuota` rung slot behind the `AiRung`
// port so the provider graph compiles against all four kinds. The
// full implementation lands in Story 3.2 (per-day quota counter,
// configured free provider, `QuotaExhausted(resetAt)` return shape,
// Settings → Your AI 3-way choice surface).
//
// This stub returns `RecognitionFailure('hosted-quota not yet wired
// (Story 3.2)')` so a v1 build that mistakenly selects
// `AiRungKind.hostedQuota` degrades honestly — the closest-matches
// + manual fallback surface renders the calm "Search isn't
// available right now" line and the user can still log the plate.
//
// AD-5: the port shape is the single contract. The core never
// branches on which rung is active; the UI never imports the
// concrete adapter type — it reads `aiRungProvider` and dispatches
// through `AiRung.recognize`. Story 3.2 swaps the body of this
// class without changing the port or the call sites.
//
// FR13: no biometric identification in this path.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The `hostedQuota` rung stub (Story 3.1). The full implementation
/// lands in Story 3.2 (per-day quota counter + configured free
/// provider + `QuotaExhausted(resetAt)` return shape).
///
/// The v1 default build never selects this rung — `AiRungConfig
/// .kind == AiRungKind.hostedQuota` is wired in Story 3.2. If a
/// v1 build accidentally does, this stub returns the documented
/// `RecognitionFailure` so the UI renders the calm failure line.
class HostedQuotaAiRung implements AiRung {
  const HostedQuotaAiRung();

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // Story 3.1 stub. Story 3.2 swaps this body for the
    // per-day-quota + free-provider + `QuotaExhausted(resetAt)`
    // return shape. The `photoBytes` are dropped on the floor by
    // design — the stub has no use for them, and persisting them
    // would violate FR13's no-identity-linkage guarantee.
    return const RecognitionFailure(
      'hosted-quota not yet wired (Story 3.2)',
    );
  }
}