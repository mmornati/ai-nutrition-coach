// `AiRung` config + adapter providers for the AI tier ladder
// (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// `aiRungConfigProvider` is the active `AiRungConfig`, derived from the
// persisted, runtime-mutable `aiSettingsProvider` (Phase 3). Exactly one
// rung is active at any time; the provider graph reads the config and
// constructs the matching adapter.
//
// `aiRungProvider` is the v1 seam the photo screen already reads
// (Story 1.8). With Story 3.1 the provider is config-driven: it
// reads `aiRungConfigProvider` and returns the matching adapter.
// Production callers override `aiRungConfigProvider` to flip the
// active rung without touching the screen.
//
// Story 3.2 extends `aiRungProvider` with the `hostedQuota` branch
// (constructs `HostedQuotaAiRung(quotaCounter, hostedQuotaProvider)`);
// Story 3.3 adds the `byok` branch (constructs
// `ByokAiRung(byokKeyStore, byokOpenAiCompatibleProvider)`).
//
// AD-1: this file lives under `apps/client/lib/` (the only place
// Riverpod state and the rung port seam live together). The domain
// core never imports Flutter or Riverpod; the structural grep test
// in `packages/domain_core/test/domain_core_test.dart` pins the
// rule.
//
// AD-5: the seam hands out `AiRung` (the interface), never the
// concrete `NoopAiRung` / `HostedQuotaAiRung` / `ByokAiRung` /
// `LocalAiRung` types. Tests inject a `FakeAiRung` (Story 1.8)
// that records `recognize` calls and returns configured results.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'ai_settings_provider.dart';

/// The active `AiRungConfig` — DERIVED from `aiSettingsProvider` (Phase 3),
/// so a change in Settings → Your AI takes effect on the next photo without
/// a restart. (It used to be a constant overridden once in `main.dart`.)
/// Tests that only care about the rung may still `overrideWithValue` it.
final aiRungConfigProvider = Provider<AiRungConfig>(
  (ref) => ref.watch(aiSettingsProvider.select((s) => s.rung)),
);

/// The `QuotaCounter` seam — overridden in `main.dart` with
/// `createQuotaCounter(ceiling: kHostedQuotaPerDay)` (secure storage on
/// mobile, memory on web; Story 3.2 / FR6). Tests inject an
/// `InMemoryQuotaCounter`.
final quotaCounterProvider = Provider<QuotaCounter>(
  (ref) => throw UnimplementedError(
    'quotaCounterProvider must be overridden at the ProviderScope root '
    'with the result of `createQuotaCounter(ceiling: '
    'kHostedQuotaPerDay)` — see apps/client/lib/main.dart.',
  ),
);

/// The `HostedQuotaProvider` transport seam — overridden in `main.dart`
/// with the `CloudflareWorkersAiProvider` STUB (Story 3.2 / FR6 / OQ-2).
/// The hosted tier is not available in this build (it needs a server-side
/// relay, S5 / `docs/ai-tiers.md`), the rung is not selectable, and the
/// stub makes no request. Tests inject a fake provider.
final hostedQuotaProviderProvider = Provider<HostedQuotaProvider>(
  (ref) => throw UnimplementedError(
    'hostedQuotaProviderProvider must be overridden at the ProviderScope '
    'root with the result of `CloudflareWorkersAiProvider(...)` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The BYOK key store seam (Story 3.3 / FR7). Overridden in `main.dart`
/// with `createByokKeyStore()`: the OS keystore on mobile (Keychain /
/// EncryptedSharedPreferences), MEMORY ONLY on web (S4 — the key is gone
/// when the web store locks, because the provider scope restarts). Tests
/// inject an `InMemoryByokKeyStore`.
final byokKeyStoreProvider = Provider<ByokKeyStore>(
  (ref) => throw UnimplementedError(
    'byokKeyStoreProvider must be overridden at the ProviderScope root '
    'with the result of `createByokKeyStore()` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The BYOK transport (Story 3.3 / FR7), built from the user's saved
/// endpoint and model. Derived, so saving a new endpoint in Your AI is
/// picked up immediately. Tests inject a fake provider.
final byokOpenAiCompatibleProviderProvider =
    Provider<ByokOpenAiCompatibleProvider>((ref) {
      final settings = ref.watch(aiSettingsProvider);
      return OpenAiCompatibleByokProvider(
        endpointUrl: settings.byokEndpointUrl,
        model: settings.byokModel,
      );
    });

/// Builds the "Test connection" transport for the endpoint / model the user
/// has TYPED (possibly not saved yet). Tests override with a fake factory.
typedef ByokConnectionTesterFactory =
    ByokConnectionTester Function({
      required String endpointUrl,
      required String model,
    });

final byokConnectionTesterFactoryProvider =
    Provider<ByokConnectionTesterFactory>(
      (ref) =>
          ({required endpointUrl, required model}) =>
              OpenAiCompatibleByokProvider(
                endpointUrl: endpointUrl,
                model: model,
              ),
    );

/// A one-shot "yes, send THIS photo to THIS host" (privacy audit PV1). The
/// capture screen grants it after the person said yes to the dialog for the
/// photo in hand; `ConsentGatedAiRung` consumes it. It is bound to the host
/// the dialog named and to the SHA-256 of the photo bytes, so it can authorise
/// exactly that upload: a second photo (a retake while the first is still
/// being recognised), another host or any other code path finds it unusable.
class PhotoUploadPermit {
  ({String host, String digest})? _grant;

  /// The person agreed to send [bytes] to [host].
  void grant({required String host, required Uint8List bytes}) =>
      _grant = (host: host.toLowerCase(), digest: photoDigest(bytes));

  /// Spend the permit: `true` once after a matching [grant], `false` for any
  /// other photo or host (a mismatch leaves the permit unspent for the right
  /// photo; [revoke] drops it).
  bool consume({required String host, required Uint8List bytes}) {
    final g = _grant;
    if (g == null) return false;
    if (g.host != host.toLowerCase() || g.digest != photoDigest(bytes)) {
      return false;
    }
    _grant = null;
    return true;
  }

  /// Drop an unspent permit (the photo was not sent after all).
  void revoke() => _grant = null;

  @override
  String toString() => 'PhotoUploadPermit()';
}

/// The permit the capture screen grants and the consent-gated rung spends.
final photoUploadPermitProvider = Provider<PhotoUploadPermit>(
  (ref) => PhotoUploadPermit(),
);

/// Refuses to recognise (and so never uploads) unless the user has agreed to
/// photos going to [host] (N1). The capture screen asks first; this guard
/// makes the rule hold even if some other path reaches the rung.
///
/// With "Ask before every photo upload" on ([askEveryPhoto], the default) the
/// per-host agreement is not enough: each photo needs its own one-shot
/// [permit], granted by the capture screen after the person said yes for
/// that photo.
class ConsentGatedAiRung implements AiRung {
  const ConsentGatedAiRung({
    required this.inner,
    required this.hasConsent,
    this.askEveryPhoto,
    this.permit,
    this.host = '',
  });

  final AiRung inner;

  /// Evaluated at call time, so a revoke takes effect immediately.
  final bool Function() hasConsent;

  /// Evaluated at call time. `null` means "no per-photo mode".
  final bool Function()? askEveryPhoto;

  /// The one-shot permit spent in per-photo mode.
  final PhotoUploadPermit? permit;

  /// The host the permit must have been granted for.
  final String host;

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    final perPhoto = askEveryPhoto?.call() ?? false;
    final allowed = perPhoto
        ? (permit?.consume(host: host, bytes: photoBytes) ?? false)
        : hasConsent();
    if (!allowed) {
      return const RecognitionFailure(
        'photo upload has not been agreed yet — see Settings → Your AI',
      );
    }
    return inner.recognize(photoBytes);
  }
}

/// The config-driven `AiRung` adapter selection. Reads
/// `aiRungConfigProvider` and constructs the matching adapter:
///
///   * `AiRungKind.noOp`         → `NoopAiRung()` (Story 1.8,
///     v1 default)
///   * `AiRungKind.hostedQuota`  → `HostedQuotaAiRung(quotaCounter,
///     hostedQuotaProvider)` (Story 3.2 / FR6)
///   * `AiRungKind.byok`         → `ByokAiRung(byokKeyStore,
///     byokProvider)` (Story 3.3 / FR7)
///   * `AiRungKind.local`        → `LocalAiRung()` (FR8 v2 seam;
///
///     throws `UnsupportedError` on `recognize`)
///
/// The seam hands out `AiRung` (the interface), never the concrete
/// adapter type. Tests inject a `FakeAiRung` (Story 1.8) that
/// records `recognize` calls and returns configured results; the
/// config-driven branch is for production wiring only.
final aiRungProvider = Provider<AiRung>((ref) {
  final config = ref.watch(aiRungConfigProvider);
  switch (config.kind) {
    case AiRungKind.noOp:
      return const NoopAiRung();
    case AiRungKind.hostedQuota:
      return HostedQuotaAiRung(
        quotaCounter: ref.watch(quotaCounterProvider),
        provider: ref.watch(hostedQuotaProviderProvider),
      );
    case AiRungKind.byok:
      final host = ref.watch(photoUploadHostProvider);
      // The stored key is only released for the host it was entered for.
      final byok = ByokAiRung(
        keyStore: HostBoundByokKeyStore(
          inner: ref.watch(byokKeyStoreProvider),
          boundHost: ref.watch(aiSettingsProvider.select((s) => s.byokKeyHost)),
          endpointHost: host ?? '',
        ),
        provider: ref.watch(byokOpenAiCompatibleProviderProvider),
      );
      if (host == null) return byok; // endpoint invalid: nothing is sent
      return ConsentGatedAiRung(
        inner: byok,
        hasConsent: () => ref.read(aiSettingsProvider).hasConsentFor(host),
        askEveryPhoto: () => ref.read(aiSettingsProvider).askBeforeEveryPhoto,
        permit: ref.read(photoUploadPermitProvider),
        host: host,
      );
    case AiRungKind.local:
      return const LocalAiRung();
  }
});
