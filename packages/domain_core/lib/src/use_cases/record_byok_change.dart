// `RecordByokChange` use-case (Story 3.3 / FR7 / AD-3).
//
// The single sanctioned mutation path for BYOK key entry /
// removal. The use-case writes / clears the key via the supplied
// `ByokKeyStore` and returns the new `AiRungConfig` so the
// provider graph flips the active rung in the same commit (AD-3
// — the encrypted store + the rung config reflect the change
// before any UI re-renders).
//
// The file is pure-Dart: no Flutter / drift / dio / mobile_scanner
// / flutter_secure_storage imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.
// The `ByokKeyStore` is supplied as an injected interface so the
// core never depends on the concrete `flutter_secure_storage`
// adapter.
//
// FR7 / NFR4: the use-case never logs the key, never reflects it
// in any string it produces. The returned `AiRungConfig` carries
// the rung kind + the previous-rung hint — never the key.

import '../entities/byok_previous_rung.dart';
import '../value_types/ai_rung_config.dart';
import '../value_types/ai_rung_kind.dart';
import 'record_byok_change_ports.dart';

/// The single sanctioned BYOK mutation path (Story 3.3 / FR7 /
/// AD-3). Writes / clears the key via the supplied [ByokKeyStore]
/// and returns the new [AiRungConfig] so the provider graph flips
/// the active rung in the same commit (AD-3).
class RecordByokChange {
  const RecordByokChange({
    required ByokKeyStorePort keyStore,
    required AiRungConfigStorePort configStore,
  })  : _keyStore = keyStore,
        _configStore = configStore;

  final ByokKeyStorePort _keyStore;
  final AiRungConfigStorePort _configStore;

  /// Persist [apiKey] and flip the active rung to
  /// `AiRungKind.byok`. The previous rung (whatever was active
  /// before this call) is remembered so a key removal can flip
  /// back exactly (FR7).
  ///
  /// Returns the new [AiRungConfig] reflecting the change.
  Future<AiRungConfig> enterByok({
    required String apiKey,
    required AiRungKind previousKind,
  }) async {
    // Write the key (FR7 — encrypted at rest via the store's
    // `flutter_secure_storage` adapter).
    await _keyStore.write(apiKey);

    // Update the rung config (AD-3 — commits before any UI re-
    // renders). The previous rung is remembered so a key removal
    // can flip back exactly.
    final newConfig = AiRungConfig(
      kind: AiRungKind.byok,
      previousRung: ByokPreviousRung(previousKind: previousKind),
    );
    await _configStore.write(newConfig);
    return newConfig;
  }

  /// Clear the key and flip the active rung back to the user's
  /// exact previous choice (FR7 — not always `AiRungKind.noOp`).
  ///
  /// Returns the new [AiRungConfig] reflecting the change.
  Future<AiRungConfig> removeByok() async {
    // Read the current config to find the previous rung.
    final current = await _configStore.read();
    final previousKind = current.previousRung?.previousKind ??
        // Fallback: if the previous rung isn't recorded (which
        // should never happen for a real BYOK session), default
        // to `noOp` so the user is never stuck on a missing rung.
        AiRungKind.noOp;

    // Clear the key (FR7 — the key never leaves the device).
    await _keyStore.clear();

    // Update the rung config (AD-3).
    final newConfig = AiRungConfig(kind: previousKind);
    await _configStore.write(newConfig);
    return newConfig;
  }
}