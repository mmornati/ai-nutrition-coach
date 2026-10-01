// `yourAiProvider` + the persistent config store (Story 3.3 /
// FR7 / AD-5 / AD-3).
//
// `yourAiProvider` is the single Riverpod seam that owns the
// Settings → Your AI entry flow. The notifier reads / writes
// through the `RecordByokChange` use-case so the encrypted key
// store + the rung config commit in one transaction (AD-3). The
// notifier surfaces the Your AI state (rung, key presence + last-four
// ending) and the `selectNoAi` / `saveByok` / `removeByok` /
// `testConnection` actions to the `YourAiScreen` widget.
//
// `notifyingAiRungConfigStoreProvider` is the config store the
// `RecordByokChange` use-case reads / writes through. It is a view over
// `aiSettingsProvider` (persisted + runtime-mutable), so a write through
// `RecordByokChange` reaches the `aiRungConfigProvider` consumers.
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
import 'ai_settings_provider.dart';

/// The `AiRungConfigStorePort` the `RecordByokChange` use-case reads and
/// writes through. It is a view over `aiSettingsProvider`: a write persists
/// (encrypted storage on mobile, memory on web) AND publishes, so
/// `aiRungConfigProvider` — and with it the photo path — changes at runtime
/// (AD-3 / AD-5). Tests may override it with `InMemoryAiRungConfigStore`.
final notifyingAiRungConfigStoreProvider = Provider<AiRungConfigStorePort>(
  (ref) => NotifyingAiRungConfigStore(ref),
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

/// In-memory `AiRungConfigStorePort` for tests. Holds the current config in
/// memory; tests can read / write freely.
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

/// Production `AiRungConfigStorePort`: delegates to `AiSettingsNotifier`,
/// which persists first and then publishes.
class NotifyingAiRungConfigStore implements AiRungConfigStorePort {
  NotifyingAiRungConfigStore(this._ref);

  final Ref _ref;

  @override
  Future<AiRungConfig> read() async => _ref.read(aiSettingsProvider).rung;

  @override
  Future<void> write(AiRungConfig config) =>
      _ref.read(aiSettingsProvider.notifier).setRung(config);
}

/// The Your AI sub-screen state (Story 3.3 / FR7).
class YourAiState {
  const YourAiState({
    required this.config,
    required this.hasKey,
    this.keyEnding,
  });

  /// The current rung config. The screen reads the rung label and
  /// the BYOK hint from this value.
  final AiRungConfig config;

  /// True if a BYOK key is stored. The screen reads the status
  /// line from this flag + the rung config.
  final bool hasKey;

  /// The last four characters of the saved key, only when the key is long
  /// enough for that to be safe (`byokKeyEndingHint`). Never more.
  final String? keyEnding;

  YourAiState copyWith({
    AiRungConfig? config,
    bool? hasKey,
    String? Function()? keyEnding,
  }) {
    return YourAiState(
      config: config ?? this.config,
      hasKey: hasKey ?? this.hasKey,
      keyEnding: keyEnding == null ? this.keyEnding : keyEnding(),
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! YourAiState) return false;
    return other.config == config &&
        other.hasKey == hasKey &&
        other.keyEnding == keyEnding;
  }

  @override
  int get hashCode => Object.hash(config, hasKey, keyEnding);

  /// Redacted: the key ending is not printed (FR7 / NFR4).
  @override
  String toString() =>
      'YourAiState(kind: ${config.kind.keyToken}, '
      'hasKey: $hasKey)';
}

/// Outcome of `YourAiNotifier.saveByok`. Sealed, like every result in the
/// codebase; the screen maps each to calm keyed copy.
sealed class SaveByokResult {
  const SaveByokResult();
}

final class SaveByokSaved extends SaveByokResult {
  const SaveByokSaved();
}

final class SaveByokEndpointInvalid extends SaveByokResult {
  const SaveByokEndpointInvalid(this.problem);

  final ByokEndpointProblem problem;
}

final class SaveByokModelMissing extends SaveByokResult {
  const SaveByokModelMissing();
}

/// The pasted key contains whitespace / control characters.
final class SaveByokKeyInvalid extends SaveByokResult {
  const SaveByokKeyInvalid();
}

/// Endpoint and model were saved, but there is no key (typed or stored) so
/// the rung stays where it was.
final class SaveByokKeyMissing extends SaveByokResult {
  const SaveByokKeyMissing();
}

/// A key is saved, but for another host than the one now being saved. The
/// key is NOT sent to the new host, and nothing was changed: paste the key
/// for the new endpoint to continue.
final class SaveByokKeyForOtherHost extends SaveByokResult {
  const SaveByokKeyForOtherHost({required this.savedFor});

  /// The host the stored key belongs to.
  final String savedFor;
}

final class SaveByokStorageFailed extends SaveByokResult {
  const SaveByokStorageFailed();
}

/// The single sanctioned Your AI entry flow (Story 3.3 / FR7).
/// Reads / writes through `RecordByokChange` so the key store +
/// the rung config commit in one transaction (AD-3).
class YourAiNotifier extends Notifier<YourAiState> {
  @override
  YourAiState build() {
    // Keep the rung in step with the settings (a change from anywhere —
    // this screen, the quota notice — shows up here).
    final config = ref.watch(aiRungConfigProvider);
    final previous = stateOrNull;
    return YourAiState(
      config: config,
      hasKey: previous?.hasKey ?? false,
      keyEnding: previous?.keyEnding,
    );
  }

  /// Refresh the key presence + ending from the key store. Call this
  /// from the screen on open and after any key change. The key itself is
  /// read into a local and dropped; only a 4-character ending survives.
  Future<void> refreshKeyPresence() async {
    final store = ref.read(byokKeyStoreProvider);
    final key = await store.read();
    final hasKey = key != null && key.isNotEmpty;
    state = state.copyWith(
      hasKey: hasKey,
      keyEnding: () => hasKey ? byokKeyEndingHint(key) : null,
    );
  }

  /// Choose "No AI". The saved key (if any) is kept; only the rung changes.
  Future<void> selectNoAi() => ref
      .read(aiSettingsProvider.notifier)
      .setRung(const AiRungConfig(kind: AiRungKind.noOp));

  /// Validate and save endpoint + model, store [newKey] when one was typed,
  /// and make "your key" the active rung when a key exists. The key never
  /// appears in the returned value or in any exception text.
  Future<SaveByokResult> saveByok({
    required String endpointUrl,
    required String model,
    String? newKey,
  }) async {
    final endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint is ByokEndpointInvalid) {
      return SaveByokEndpointInvalid(endpoint.problem);
    }
    if (model.trim().isEmpty) return const SaveByokModelMissing();
    final typedKey = newKey?.trim();
    if (typedKey != null &&
        typedKey.isNotEmpty &&
        RegExp(r'[\s\u0000-\u001F\u007F]').hasMatch(typedKey)) {
      return const SaveByokKeyInvalid();
    }

    final host = (endpoint as ByokEndpointValid).host.toLowerCase();
    try {
      final settings = ref.read(aiSettingsProvider.notifier);
      final current = ref.read(aiRungConfigProvider);
      final previousKind = current.kind == AiRungKind.byok
          ? current.previousRung?.previousKind ?? AiRungKind.noOp
          : current.kind;

      if (typedKey != null && typedKey.isNotEmpty) {
        await ref
            .read(recordByokChangeProvider)
            .enterByok(apiKey: typedKey, previousKind: previousKind);
        // The key is bound to the host it was entered for. If this commit
        // fails the binding stays unset, which reads as "key unusable"
        // (fail closed), never as "usable anywhere".
        await settings.setByokTarget(
          endpointUrl: endpointUrl,
          model: model,
          keyHost: host,
        );
      } else if (await ref.read(byokKeyStoreProvider).hasKey()) {
        final savedFor = ref.read(aiSettingsProvider).byokKeyHost;
        if (savedFor != host) {
          // Editing the endpoint must never redirect an existing key to a
          // server it was not given to: refuse until it is pasted again.
          return SaveByokKeyForOtherHost(savedFor: savedFor);
        }
        await settings.setByokTarget(endpointUrl: endpointUrl, model: model);
        await settings.setRung(
          AiRungConfig(
            kind: AiRungKind.byok,
            previousRung: ByokPreviousRung(previousKind: previousKind),
          ),
        );
      } else {
        await settings.setByokTarget(endpointUrl: endpointUrl, model: model);
        await refreshKeyPresence();
        return const SaveByokKeyMissing();
      }
    } on Object {
      return const SaveByokStorageFailed();
    }
    await refreshKeyPresence();
    return const SaveByokSaved();
  }

  /// Remove the BYOK key and flip the active rung back to the
  /// user's exact previous choice (FR7 — not always
  /// `AiRungKind.noOp`).
  Future<void> removeByok() async {
    await ref.read(recordByokChangeProvider).removeByok();
    final s = ref.read(aiSettingsProvider);
    await ref
        .read(aiSettingsProvider.notifier)
        .setByokTarget(
          endpointUrl: s.byokEndpointUrl,
          model: s.byokModel,
          keyHost: '',
        );
    await refreshKeyPresence();
  }

  /// "Test connection" with what is on the form. [typedKey] wins over the
  /// saved key; with neither, the result is "not configured". Nothing is
  /// persisted by a test.
  Future<ByokConnectionResult> testConnection({
    required String endpointUrl,
    required String model,
    String? typedKey,
  }) async {
    final typed = typedKey?.trim() ?? '';
    var key = typed;
    if (key.isEmpty) {
      final stored = await ref.read(byokKeyStoreProvider).read() ?? '';
      if (stored.isNotEmpty) {
        // The saved key is only for the host it was entered for.
        final endpoint = validateByokEndpoint(endpointUrl);
        if (endpoint is ByokEndpointValid &&
            endpoint.host.toLowerCase() !=
                ref.read(aiSettingsProvider).byokKeyHost) {
          return const ByokConnectionKeyForOtherHost();
        }
        key = stored;
      }
    }
    final tester = ref.read(byokConnectionTesterFactoryProvider)(
      endpointUrl: endpointUrl.trim(),
      model: model.trim(),
    );
    return tester.testConnection(apiKey: key);
  }
}

/// The `yourAiProvider` (Story 3.3 / FR7). The Your AI sub-screen
/// reads this notifier for the rung label + the status line + the
/// `saveByok` / `removeByok` / `testConnection` actions.
final yourAiProvider = NotifierProvider<YourAiNotifier, YourAiState>(
  YourAiNotifier.new,
);
