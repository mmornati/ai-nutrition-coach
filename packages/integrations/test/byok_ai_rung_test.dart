// `ByokKeyStore` + `ByokAiRung` tests (Story 3.3 / FR7).
//
// Pins:
//   * the in-memory key store read/write/clear/hasKey;
//   * `toString` is redacted (`ByokKeyStore(hasKey: <bool>)`) —
//     never surfaces the key in any form (FR7 / NFR4);
//   * the BYOK rung returns `RecognitionFailure('byok key
//     missing — ...')` BEFORE any transport call when no key is
//     stored (FR7);
//   * `ByokRecognized(foods)` → `RecognizedPlate(foods)`;
//   * `ByokNoMatch` → `NoMatch()`;
//   * `ByokKeyRejected` → `RecognitionFailure('byok key
//     rejected by provider — ...')` (FR7 — key preserved on
//     disk, no auto-clear);
//   * `ByokQuotaExhausted(resetAt)` → `QuotaExhausted(resetAt)`
//     (FR6 carry-over; FR7);
//   * `ByokFailure(cause)` → `RecognitionFailure(cause)`;
//   * the BYOK rung never includes the key in any string it
//     produces (FR7 / NFR4).

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('InMemoryByokKeyStore (Story 3.3 / FR7)', () {
    test('starts with no key', () async {
      final store = InMemoryByokKeyStore();
      expect(await store.hasKey(), isFalse);
      expect(await store.read(), isNull);
    });

    test('write then read returns the key', () async {
      final store = InMemoryByokKeyStore();
      await store.write('sk-test-1234');
      expect(await store.hasKey(), isTrue);
      expect(await store.read(), 'sk-test-1234');
    });

    test('clear removes the key', () async {
      final store = InMemoryByokKeyStore();
      await store.write('sk-test-1234');
      await store.clear();
      expect(await store.hasKey(), isFalse);
      expect(await store.read(), isNull);
    });

    test('toString is redacted — never includes the key (FR7 / '
        'NFR4)', () async {
      final store = InMemoryByokKeyStore();
      await store.write('sk-secret-must-not-leak');
      expect(store.toString(), isNot(contains('sk-secret')));
      expect(store.toString(), contains('ByokKeyStore'));
    });
  });

  group('ByokAiRung (Story 3.3 / FR7)', () {
    test('no stored key → RecognitionFailure before any transport '
        'call (FR7)', () async {
      final store = InMemoryByokKeyStore();
      var transportCalls = 0;
      final provider = _FakeByokProvider(
        onRecognize: (_, __) {
          transportCalls++;
          return const ByokNoMatch();
        },
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognitionFailure>());
      expect(
        (result as RecognitionFailure).cause.toString(),
        contains('byok key missing'),
      );
      expect(transportCalls, 0,
          reason: 'transport must not be called when no key is stored');
    });

    test('ByokRecognized maps to RecognizedPlate', () async {
      final store = InMemoryByokKeyStore(seed: 'sk-test');
      final foods = <RecognizedFood>[
        const RecognizedFood(
          databaseFood: DatabaseFood(
            sourceRef: 'seed:apple',
            displayName: 'Apple',
            source: SourceCatalog.manual,
            foodGroup: FoodGroup.vegFruit,
          ),
          confidence: 0.85,
          quantity: QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1 piece',
          ),
        ),
      ];
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => ByokRecognized(foods),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, foods);
    });

    test('ByokNoMatch maps to NoMatch', () async {
      final store = InMemoryByokKeyStore(seed: 'sk-test');
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => const ByokNoMatch(),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<NoMatch>());
    });

    test('ByokKeyRejected maps to RecognitionFailure (key preserved '
        'on disk, no auto-clear — FR7)', () async {
      final store = InMemoryByokKeyStore(seed: 'sk-test');
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => const ByokKeyRejected(),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognitionFailure>());
      expect(
        (result as RecognitionFailure).cause.toString(),
        contains('byok key rejected'),
      );
      // The key is preserved — the user can fix it without re-
      // entering.
      expect(await store.hasKey(), isTrue);
      expect(await store.read(), 'sk-test');
    });

    test('ByokQuotaExhausted maps to QuotaExhausted (FR6 carry-over)',
        () async {
      final store = InMemoryByokKeyStore(seed: 'sk-test');
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => const ByokQuotaExhausted(
          resetAt: null,
        ),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<QuotaExhausted>());
      expect((result as QuotaExhausted).resetAt, isNull);
    });

    test('ByokFailure maps to RecognitionFailure', () async {
      final store = InMemoryByokKeyStore(seed: 'sk-test');
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => const ByokFailure('network down'),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognitionFailure>());
      expect(
        (result as RecognitionFailure).cause.toString(),
        'network down',
      );
    });

    test('the BYOK rung never includes the key in any string it '
        'produces (FR7 / NFR4)', () async {
      final store = InMemoryByokKeyStore(seed: 'sk-secret-must-not-leak');
      final provider = _FakeByokProvider(
        onRecognize: (_, __) => const ByokFailure('something happened'),
      );
      final rung = ByokAiRung(keyStore: store, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognitionFailure>());
      expect(
        (result as RecognitionFailure).cause.toString(),
        isNot(contains('sk-secret')),
      );
    });
  });
}

/// Fake `ByokOpenAiCompatibleProvider` for tests. Returns the
/// configured outcome from `onRecognize`. The fake records the
/// `apiKey` it received so tests can assert the BYOK rung passes
/// the key through without leaking it.
class _FakeByokProvider implements ByokOpenAiCompatibleProvider {
  _FakeByokProvider({required this.onRecognize});

  final ByokOutcome Function(Uint8List, String) onRecognize;
  final List<String> receivedKeys = <String>[];

  @override
  Future<ByokOutcome> recognize({
    required Uint8List photoBytes,
    required String apiKey,
  }) async {
    receivedKeys.add(apiKey);
    return onRecognize(photoBytes, apiKey);
  }
}