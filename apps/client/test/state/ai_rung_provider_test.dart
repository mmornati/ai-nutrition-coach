// `aiRungConfigProvider` + `aiRungProvider` tests (Story 3.1 / AD-5).
//
// Pins:
//   * `aiRungConfigProvider` is the single Riverpod seam that
//     holds the build-time `AiRungConfig`;
//   * `aiRungProvider` is config-driven: it reads the config and
//     returns the matching adapter — `NoopAiRung`,
//     `HostedQuotaAiRung`, `ByokAiRung`, or `LocalAiRung`;
//   * the `LocalAiRung` branch throws `UnsupportedError` on
//     `recognize` (FR8 v2 seam);
//   * the v1 default config is `AiRungKind.noOp` so the Story 1.8
//     path (closest-matches + manual fallback) keeps shipping.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/state/ai_rung_provider.dart';

/// Overrides every adapter seam with an in-memory double so any
/// `AiRungKind` can resolve (the seams have no default — see
/// `ai_rung_provider.dart`).
ProviderContainer _container({required AiRungConfig config}) {
  return ProviderContainer(
    overrides: [
      aiRungConfigProvider.overrideWithValue(config),
      quotaCounterProvider.overrideWithValue(
        InMemoryQuotaCounter(ceiling: 5),
      ),
      hostedQuotaProviderProvider.overrideWithValue(
        const CloudflareWorkersAiProvider(),
      ),
      byokKeyStoreProvider.overrideWithValue(InMemoryByokKeyStore()),
      byokOpenAiCompatibleProviderProvider.overrideWithValue(
        const OpenAiCompatibleByokProvider(),
      ),
    ],
  );
}

void main() {
  group('aiRungConfigProvider (Story 3.1 / AD-5)', () {
    test('throws UnimplementedError when not overridden (defensive seam)',
        () {
      // The seam has no default — production code must override it
      // at the ProviderScope root. This pins the error path so a
      // regression that silently defaults to a no-op is loud.
      // Riverpod 3.x wraps the provider's thrown error in a
      // `ProviderException`; the underlying `UnimplementedError`
      // carries the message we deliberately throw inside the
      // provider's factory.
      final container = ProviderContainer();
      addTearDown(container.dispose);

      Object? thrown;
      try {
        container.read(aiRungConfigProvider);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, isNotNull);
      expect(
        thrown.toString(),
        contains('aiRungConfigProvider must be overridden'),
      );
      expect(thrown.toString(), contains('UnimplementedError'));
    });

    test('production override resolves to the v1 default (noOp)', () {
      // Pin the convention used in `main.dart`: the v1 default is
      // `AiRungKind.noOp` (Story 1.8 carry-over).
      final container = _container(
        config: const AiRungConfig(kind: AiRungKind.noOp),
      );
      addTearDown(container.dispose);

      final config = container.read(aiRungConfigProvider);
      expect(config.kind, AiRungKind.noOp);
    });
  });

  group('aiRungProvider config-driven selection (Story 3.1 / AD-5)', () {
    test('noOp config → NoopAiRung (v1 default path)', () {
      final container = _container(
        config: const AiRungConfig(kind: AiRungKind.noOp),
      );
      addTearDown(container.dispose);

      final rung = container.read(aiRungProvider);
      expect(rung, isA<AiRung>());
      expect(rung, isA<NoopAiRung>());
    });

    test('hostedQuota config → HostedQuotaAiRung wired with quota '
        'counter + provider (Story 3.2)', () {
      final container = ProviderContainer(
        overrides: [
          aiRungConfigProvider.overrideWithValue(
            const AiRungConfig(kind: AiRungKind.hostedQuota),
          ),
          quotaCounterProvider.overrideWithValue(
            InMemoryQuotaCounter(ceiling: 5),
          ),
          hostedQuotaProviderProvider.overrideWithValue(
            const CloudflareWorkersAiProvider(),
          ),
        ],
      );
      addTearDown(container.dispose);

      final rung = container.read(aiRungProvider);
      expect(rung, isA<AiRung>());
      expect(rung, isA<HostedQuotaAiRung>());

      // The seam hands out `AiRung` (the interface) — not the
      // concrete adapter type — at the call site.
      final AiRung abstractRung = rung;
      expect(abstractRung, isA<AiRung>());
    });

    test('byok config → ByokAiRung stub (Story 3.3 fills the body)',
        () {
      final container = _container(
        config: const AiRungConfig(kind: AiRungKind.byok),
      );
      addTearDown(container.dispose);

      final rung = container.read(aiRungProvider);
      expect(rung, isA<AiRung>());
      expect(rung, isA<ByokAiRung>());
    });

    test('local config → LocalAiRung v2 seam (FR8 throws-on-use)',
        () async {
      final container = _container(
        config: const AiRungConfig(kind: AiRungKind.local),
      );
      addTearDown(container.dispose);

      final rung = container.read(aiRungProvider);
      expect(rung, isA<AiRung>());
      expect(rung, isA<LocalAiRung>());

      // The seam is honest — `recognize` throws `UnsupportedError`
      // because the local-model rung is a v2 seam (FR8).
      Object? thrown;
      try {
        await rung.recognize(Uint8List(0));
      } catch (e) {
        thrown = e;
      }
      expect(thrown, isA<UnsupportedError>());
      expect(thrown.toString(), contains('v2 seam'));
    });

    test('the seam hands out AiRung (the interface), never the '
        'concrete adapter type — except for the test-internal '
        'isA<X>() assertions, the providers return AiRung', () {
      for (final kind in AiRungKind.values) {
        final container = _container(
          config: AiRungConfig(kind: kind),
        );
        addTearDown(container.dispose);
        final AiRung rung = container.read(aiRungProvider);
        expect(rung, isA<AiRung>());
      }
    });
  });
}