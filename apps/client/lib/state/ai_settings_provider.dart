// The runtime home of the user's AI preferences (Phase 3 / F5).
//
// Until now the active rung was a constant overridden in `main.dart`, so a
// change in Settings could never take effect. `aiSettingsProvider` is the
// single mutable source: `aiRungConfigProvider`, the BYOK transport and the
// photo-consent check are all derived from it, so a write here changes the
// behaviour of the very next photo — no restart.
//
// Persistence goes through `AiSettingsStore` (secure storage on mobile,
// memory on web — see `ai_settings_store.dart` for the reasoning). A write
// is persisted FIRST and only then published to the UI, so the screen never
// claims a setting it failed to keep.
//
// AD-1: this file is the Riverpod side; the value types and the store live
// in `packages/integrations` / `domain_core`.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

/// The settings read at start-up — overridden in `main.dart` after
/// `AiSettingsStore.read()`. Tests override it with a literal.
final initialAiSettingsProvider = Provider<AiSettings>(
  (ref) => throw UnimplementedError(
    'initialAiSettingsProvider must be overridden at the ProviderScope '
    'root with the hydrated AiSettings — see apps/client/lib/main.dart.',
  ),
);

/// Where settings are persisted — overridden in `main.dart` with
/// `createAiSettingsStore()`. Tests use `InMemoryAiSettingsStore`.
final aiSettingsStoreProvider = Provider<AiSettingsStore>(
  (ref) => throw UnimplementedError(
    'aiSettingsStoreProvider must be overridden at the ProviderScope root '
    'with createAiSettingsStore() — see apps/client/lib/main.dart.',
  ),
);

class AiSettingsNotifier extends Notifier<AiSettings> {
  @override
  AiSettings build() => ref.watch(initialAiSettingsProvider);

  Future<void> _commit(AiSettings next) async {
    if (next == state) return;
    await ref.read(aiSettingsStoreProvider).write(next);
    state = next;
  }

  /// Switch the active rung (takes effect on the next `aiRungProvider`
  /// read).
  Future<void> setRung(AiRungConfig rung) =>
      _commit(state.copyWith(rung: rung));

  /// Save the BYOK endpoint and model exactly as validated by the caller.
  ///
  /// [keyHost], when given, records the host the stored key was entered for
  /// (`''` clears it). It is only ever passed together with a key write.
  Future<void> setByokTarget({
    required String endpointUrl,
    required String model,
    String? keyHost,
  }) => _commit(
    state.copyWith(
      byokEndpointUrl: endpointUrl.trim(),
      byokModel: model.trim(),
      byokKeyHost: keyHost?.toLowerCase(),
    ),
  );

  /// Remember that the user agreed to send photos to [host] (N1).
  Future<void> grantPhotoConsent(String host) => _commit(
    state.copyWith(
      photoConsentHosts: {...state.photoConsentHosts, host.toLowerCase()},
    ),
  );

  /// "Ask before every photo upload" (PV1): `true` = each photo needs its own
  /// yes; `false` = the per-host agreement applies.
  Future<void> setAskBeforeEveryPhoto(bool value) =>
      _commit(state.copyWith(askBeforeEveryPhoto: value));

  /// Forget the agreement for [host]; the next photo asks again.
  Future<void> revokePhotoConsent(String host) => _commit(
    state.copyWith(
      photoConsentHosts: {
        for (final h in state.photoConsentHosts)
          if (h != host.toLowerCase()) h,
      },
    ),
  );
}

final aiSettingsProvider = NotifierProvider<AiSettingsNotifier, AiSettings>(
  AiSettingsNotifier.new,
);

/// The host an upload would go to under the CURRENT settings, or `null`
/// when nothing would leave the device (no-AI, local seam, hosted stub, or a
/// BYOK endpoint that does not validate and so is never called). This is the
/// host the consent dialog names and the consent list is keyed by.
final photoUploadHostProvider = Provider<String?>((ref) {
  final settings = ref.watch(aiSettingsProvider);
  if (settings.rung.kind != AiRungKind.byok) return null;
  final endpoint = validateByokEndpoint(settings.byokEndpointUrl);
  return endpoint is ByokEndpointValid ? endpoint.host.toLowerCase() : null;
});

/// Whether the user has agreed to photos going to [host].
final photoConsentGrantedProvider = Provider.family<bool, String>(
  (ref, host) => ref.watch(aiSettingsProvider).hasConsentFor(host),
);
