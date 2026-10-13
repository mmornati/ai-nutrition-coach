// `AiRung` adapter tests (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// Pins:
//   * all four rungs (`NoopAiRung`, `HostedQuotaAiRung`,
//     `ByokAiRung`, `LocalAiRung`) implement the `AiRung` interface;
//   * `LocalAiRung.recognize` throws `UnsupportedError` (FR8 v2 seam);
//   * `HostedQuotaAiRung.recognize` returns `QuotaExhausted` before
//     any transport call when the quota is spent (Story 3.2);
//   * `ByokAiRung.recognize` returns the calm key-missing
//     `RecognitionFailure` before any transport call (Story 3.3);
//   * `NoopAiRung.recognize` continues to ship the empty
//     `RecognizedPlate` shape (Story 1.8 carry-over — no regression).

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('AiRung adapters (Story 3.1 / AD-5)', () {
    test('NoopAiRung implements AiRung and returns the empty '
        'RecognizedPlate shape (Story 1.8 carry-over)', () async {
      const AiRung rung = NoopAiRung();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, isEmpty);
    });

    test('HostedQuotaAiRung implements AiRung and short-circuits to '
        'QuotaExhausted before any transport call (Story 3.2)', () async {
      final AiRung rung = HostedQuotaAiRung(
        quotaCounter: InMemoryQuotaCounter(ceiling: 0),
        provider: const CloudflareWorkersAiProvider(),
      );
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<QuotaExhausted>());
    });

    test('ByokAiRung implements AiRung and returns the calm key-missing '
        'RecognitionFailure before any transport call (Story 3.3)', () async {
      final AiRung rung = ByokAiRung(
        keyStore: InMemoryByokKeyStore(),
        provider: const OpenAiCompatibleByokProvider(),
      );
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
        HostedQuotaAiRung(
          quotaCounter: InMemoryQuotaCounter(ceiling: 5),
          provider: const CloudflareWorkersAiProvider(),
        ),
        ByokAiRung(
          keyStore: InMemoryByokKeyStore(),
          provider: const OpenAiCompatibleByokProvider(),
        ),
        const LocalAiRung(),
      ];
      expect(rungs, hasLength(4));
      for (final rung in rungs) {
        expect(rung, isA<AiRung>());
      }
    });
  });
}
