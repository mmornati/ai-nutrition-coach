// `ByokAiRung` stub (Story 3.1 / AD-5 / FR7).
//
// Story 3.1 declares the `byok` rung slot behind the `AiRung` port
// so the provider graph compiles against all four kinds. The full
// implementation lands in Story 3.3 (`ByokKeyStore` wrapping
// `flutter_secure_storage`, `ByokOpenAiCompatibleProvider` transport
// adapter, `RecordByokChange` use-case, Settings → Your AI surface,
// previous-rung flip-back on key removal).
//
// This stub returns `RecognitionFailure('byok not yet wired (Story
// 3.3)')` so a v1 build that mistakenly selects `AiRungKind.byok`
// degrades honestly — the closest-matches + manual fallback surface
// renders the calm "Search isn't available right now" line and the
// user can still log the plate.
//
// AD-5: the port shape is the single contract. The core never
// branches on which rung is active; the UI never imports the
// concrete adapter type — it reads `aiRungProvider` and dispatches
// through `AiRung.recognize`. Story 3.3 swaps the body of this
// class without changing the port or the call sites.
//
// FR7: no key material is logged or reflected anywhere in this
// stub. Story 3.3 takes over the key-handling concern.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The `byok` rung stub (Story 3.1). The full implementation
/// lands in Story 3.3 (`ByokKeyStore` + `ByokOpenAiCompatibleProvider`
/// + `RecordByokChange` + Settings → Your AI surface).
///
/// The v1 default build never selects this rung — `AiRungConfig
/// .kind == AiRungKind.byok` is wired in Story 3.3. If a v1 build
/// accidentally does, this stub returns the documented
/// `RecognitionFailure` so the UI renders the calm failure line.
class ByokAiRung implements AiRung {
  const ByokAiRung();

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // Story 3.1 stub. Story 3.3 swaps this body for the
    // `ByokKeyStore.read()` + `ByokOpenAiCompatibleProvider.recognize()`
    // + `QuotaExhausted(resetAt)` + key-rejected `RecognitionFailure`
    // return shapes. The `photoBytes` are dropped on the floor by
    // design — the stub has no use for them, and persisting them
    // would violate FR13's no-identity-linkage guarantee.
    return const RecognitionFailure(
      'byok not yet wired (Story 3.3)',
    );
  }
}