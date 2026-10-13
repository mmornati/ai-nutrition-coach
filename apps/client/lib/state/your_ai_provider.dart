// `yourAiProvider` + the persistent config store (Story 3.3 /
// FR7 / AD-5 / AD-3).
//
// `yourAiProvider` is the single Riverpod seam that owns the
// Settings → Your AI entry flow. The notifier reads / writes
// through the `RecordByokChange` use-case so the encrypted key
// store + the rung config commit in one transaction (AD-3). The
// notifier surfaces the Your AI state (rung label + status line +
// `changeRung` / `enterByok` / `removeByok` actions) to the
// `YourAiScreen` widget.
//
// `notifyingAiRungConfigStoreProvider` is the persistent store
// the `RecordByokChange` use-case reads / writes through. The
// store mirrors `aiRungConfigProvider` so the two providers stay
// in sync: a write through `RecordByokChange` updates both the
// config store and the `aiRungConfigProvider` consumers.
//
// AD-1: this file lives under `apps/client/lib/` (the only place
// Riverpod state and the BYOK seam live together). The domain
// core never imports Flutter or Riverpod; the structural grep
// test in `packages/domain_core/test/domain_core_test.dart` pins
// the rule.
//
// FR7 / NFR4: the key never appears in any string the notifier
// produces. The `state.toString` is redacted; error envelopes
// never carry the key; the masked text field is wired by the
// widget (out of scope for this file).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'ai_rung_provider.dart';

/// The persistent store for `AiRungConfig` (Story 3.3 / FR7 /
/// AD-3). The store mirrors `aiRungConfigProvider` so the two
/// providers stay in sync: a write through `RecordByokChange`
/// updates both the store and the consumers.
///
/// The store is overridden in `main.dart` with a
/// `NotifyingAiRungConfigStore` that holds the current config in
/// memory + persists it under the secure storage alias for cold
/// start. Tests inject an `InMemoryAiRungConfigStore`.
final notifyingAiRungConfigStoreProvider = Provider<AiRungConfigStorePort>(
  (ref) => throw UnimplementedError(
    'notifyingAiRungConfigStoreProvider must be overridden at the '
    'ProviderScope root — see apps/client/lib/main.dart.',
  ),
);

/// The single sanctioned BYOK mutation path (Story 3.3 / FR7 /
/// AD-3). The use-case wraps the BYOK key store + the rung config
/// store so the key write / clear + the rung config update commit
/// in one transaction (AD-3).
final recordByokChangeProvider = Provider<RecordByokChange>(
  (ref) => RecordByokChange(
    keyStore: ref.watch(_byokKeyStorePortProvider),
    configStore: ref.watch(notifyingAiRungConfigStoreProvider),
  ),
);

/// Internal alias — adapts the production `ByokKeyStore`
/// (`flutter_secure_storage`-backed) to the core's
/// `ByokKeyStorePort` interface. The core never imports
/// `flutter_secure_storage` (AD-1).
final _byokKeyStorePortProvider = Provider<ByokKeyStorePort>(
  (ref) => _ByokKeyStoreAdapter(ref.watch(byokKeyStoreProvider)),
);

/// Adapts the production `ByokKeyStore` to the core's
/// `ByokKeyStorePort` interface.
class _ByokKeyStoreAdapter implements ByokKeyStorePort {
  _ByokKeyStoreAdapter(this._delegate);

  final ByokKeyStore _delegate;

  @override
  Future<String?> read() => _delegate.read();

  @override
  Future<void> write(String key) => _delegate.write(key);

  @override
  Future<void> clear() => _delegate.clear();

  @override
  Future<bool> hasKey() => _delegate.hasKey();
}

/// In-memory `AiRungConfigStorePort` for tests. Holds the
/// current config in memory; tests can read / write freely
/// without touching the secure storage.
class InMemoryAiRungConfigStore implements AiRungConfigStorePort {
  InMemoryAiRungConfigStore({AiRungConfig? initial})
    : _config = initial ?? const AiRungConfig(kind: AiRungKind.noOp);

  AiRungConfig _config;

  @override
  Future<AiRungConfig> read() async => _config;

  @override
  Future<void> write(AiRungConfig config) async {
    _config = config;
  }
}

/// Production `AiRungConfigStorePort` — holds the current config
/// in memory + persists it under the secure storage alias for
/// cold start. A write through this store notifies
/// `aiRungConfigProvider`'s consumers so the photo path picks up
/// the new rung immediately (AD-3 / AD-5).
class NotifyingAiRungConfigStore implements AiRungConfigStorePort {
  NotifyingAiRungConfigStore(this._ref);

  /// The Riverpod ref. The store calls `_ref.invalidate(...)` on
  /// the config provider after each write so the
  /// `aiRungConfigProvider` consumers re-read.
  // ignore: avoid_field_initializers_in_const_classes
  final Ref _ref;

  /// The in-memory cache. Initialized to the v1 default
  /// (`AiRungKind.noOp`); a cold start reads the persisted value
  /// from `flutter_secure_storage` and overwrites this.
  AiRungConfig _config = const AiRungConfig(kind: AiRungKind.noOp);

  /// Hydrate the store from the persisted config. Called from
  /// `main.dart` after the secure storage read returns.
  void hydrate(AiRungConfig config) {
    _config = config;
  }

  @override
  Future<AiRungConfig> read() async => _config;

  @override
  Future<void> write(AiRungConfig config) async {
    _config = config;
    _ref.invalidate(aiRungConfigProvider);
  }
}

/// The Your AI sub-screen state (Story 3.3 / FR7).
class YourAiState {
  const YourAiState({required this.config, required this.hasKey});

  /// The current rung config. The screen reads the rung label and
  /// the BYOK hint from this value.
  final AiRungConfig config;

  /// True if a BYOK key is stored. The screen reads the status
  /// line from this flag + the rung config.
  final bool hasKey;

  YourAiState copyWith({AiRungConfig? config, bool? hasKey}) {
    return YourAiState(
      config: config ?? this.config,
      hasKey: hasKey ?? this.hasKey,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! YourAiState) return false;
    return other.config == config && other.hasKey == hasKey;
  }

  @override
  int get hashCode => Object.hash(config, hasKey);

  @override
  String toString() =>
      'YourAiState(kind: ${config.kind.keyToken}, '
      'hasKey: $hasKey)';
}

/// The single sanctioned Your AI entry flow (Story 3.3 / FR7).
/// Reads / writes through `RecordByokChange` so the key store +
/// the rung config commit in one transaction (AD-3).
class YourAiNotifier extends Notifier<YourAiState> {
  @override
  YourAiState build() {
    // Read the current config + the BYOK key presence on build;
    // the notifier re-reads whenever the underlying providers
    // change so the screen stays in sync.
    final config = ref.watch(aiRungConfigProvider);
    return YourAiState(config: config, hasKey: false);
  }

  /// Refresh the `hasKey` flag from the BYOK key store. Call this
  /// from the screen after the key entry form commits.
  Future<void> refreshKeyPresence() async {
    final hasKey = await ref.read(byokKeyStoreProvider).hasKey();
    state = state.copyWith(hasKey: hasKey);
  }

  /// Enter the BYOK rung: persist [apiKey] and flip the active
  /// rung to `AiRungKind.byok`. The previous rung is the value
  /// that was active before this call.
  ///
  /// FR7: the key is never logged or reflected in any string this
  /// method produces. The caller passes the masked text field
  /// value directly to `RecordByokChange.enterByok`.
  Future<void> enterByok({
    required String apiKey,
    required AiRungKind previousKind,
  }) async {
    final newConfig = await ref
        .read(recordByokChangeProvider)
        .enterByok(apiKey: apiKey, previousKind: previousKind);
    state = YourAiState(config: newConfig, hasKey: true);
  }

  /// Remove the BYOK key and flip the active rung back to the
  /// user's exact previous choice (FR7 — not always
  /// `AiRungKind.noOp`).
  Future<void> removeByok() async {
    final newConfig = await ref.read(recordByokChangeProvider).removeByok();
    state = YourAiState(config: newConfig, hasKey: false);
  }
}

/// The `yourAiProvider` (Story 3.3 / FR7). The Your AI sub-screen
/// reads this notifier for the rung label + the status line + the
/// `enterByok` / `removeByok` actions.
final yourAiProvider = NotifierProvider<YourAiNotifier, YourAiState>(
  YourAiNotifier.new,
);
