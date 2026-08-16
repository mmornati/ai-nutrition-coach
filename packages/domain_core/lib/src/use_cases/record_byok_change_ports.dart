// Port interfaces for the `RecordByokChange` use-case (Story
// 3.3 / FR7 / AD-3).
//
// `ByokKeyStorePort` and `AiRungConfigStorePort` are the
// abstracted persistence seams the use-case reads / writes
// through. The concrete `flutter_secure_storage` adapter and the
// concrete config store live in `apps/client/` and
// `packages/integrations/`; the use-case is unaware of them
// (AD-1 — the core never imports Flutter / flutter_secure_storage).
//
// FR7 / NFR4: the port interfaces never log or reflect the key in
// any string they produce. The `toString` of the in-memory
// adapter in `packages/integrations/lib/src/ai/byok_key_store.dart`
// is redacted (`ByokKeyStore(hasKey: <bool>)`).

import '../value_types/ai_rung_config.dart';

/// The abstracted persistence seam for the BYOK key. The
/// concrete implementation in `packages/integrations/` wraps
/// `flutter_secure_storage`; tests inject an in-memory fake.
abstract interface class ByokKeyStorePort {
  Future<String?> read();
  Future<void> write(String key);
  Future<void> clear();
  Future<bool> hasKey();
}

/// The abstracted persistence seam for the active `AiRungConfig`.
/// The concrete implementation in `apps/client/` writes through
/// the `aiRungConfigProvider`'s `NotifyingAiRungConfigStore`; tests
/// inject an in-memory fake.
abstract interface class AiRungConfigStorePort {
  Future<AiRungConfig> read();
  Future<void> write(AiRungConfig config);
}