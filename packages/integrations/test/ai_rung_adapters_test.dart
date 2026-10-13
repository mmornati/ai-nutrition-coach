// `AiRung` adapter tests (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// Pins:
//   * all four rungs (`NoopAiRung`, `HostedQuotaAiRung`,
//     `ByokAiRung`, `LocalAiRung`) implement the `AiRung` interface;
//   * `LocalAiRung.recognize` throws `UnsupportedError` (FR8 v2 seam);
//   * `HostedQuotaAiRung` / `ByokAiRung` are wired through their ports
//     (Stories 3.2 / 3.3 — behaviour is pinned in their own suites; this
//     file only pins interface conformance + the no-key / no-match edges);
//   * `NoopAiRung.recognize` continues to ship the empty
//     `RecognizedPlate` shape (Story 1.8 carry-over — no regression).

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _NoMatchHostedProvider implements HostedQuotaProvider {
  const _NoMatchHostedProvider();

  @override
  Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes}) async =>
      const HostedQuotaNoMatch();
}

class _NeverCalledByokProvider implements ByokOpenAiCompatibleProvider {
  const _NeverCalledByokProvider();

  @override
  Future<ByokOutcome> recognize({
    required Uint8List photoBytes,
    required String apiKey,
  }) async => throw StateError('provider must not be called without a key');
}

HostedQuotaAiRung _hosted() => HostedQuotaAiRung(
  quotaCounter: InMemoryQuotaCounter(ceiling: 1),
  provider: const _NoMatchHostedProvider(),
);

ByokAiRung _byok() => ByokAiRung(
  keyStore: InMemoryByokKeyStore(),
  provider: const _NeverCalledByokProvider(),
);

void main() {
  group('AiRung adapters (Story 3.1 / AD-5)', () {
    test('NoopAiRung implements AiRung and returns the empty '
        'RecognizedPlate shape (Story 1.8 carry-over)', () async {
      const AiRung rung = NoopAiRung();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, isEmpty);
    });

    test('HostedQuotaAiRung implements AiRung and maps a provider '
        'no-match to NoMatch (Story 3.2)', () async {
      final AiRung rung = _hosted();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<NoMatch>());
    });

    test('ByokAiRung implements AiRung and returns the calm key-missing '
        'RecognitionFailure when no key is stored (Story 3.3)', () async {
      final AiRung rung = _byok();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<RecognitionFailure>());
      expect(
        (result as RecognitionFailure).cause.toString(),
        contains('byok key missing'),
      );
    });

    test('LocalAiRung implements AiRung and throws UnsupportedError '
        '(FR8 v2 seam)', () async {
      const AiRung rung = LocalAiRung();
      Object? thrown;
      try {
        await rung.recognize(Uint8List(0));
      } catch (e) {
        thrown = e;
      }
      expect(thrown, isA<UnsupportedError>());
      expect(thrown.toString(), contains('v2 seam'));
      expect(thrown.toString(), contains('FR8'));
    });

    test('all four rungs are interface-conformant: a List<AiRung> '
        'holds one of each', () {
      final rungs = <AiRung>[
        const NoopAiRung(),
        _hosted(),
        _byok(),
        const LocalAiRung(),
      ];
      expect(rungs, hasLength(4));
      for (final rung in rungs) {
        expect(rung, isA<AiRung>());
      }
    });
  });
}
