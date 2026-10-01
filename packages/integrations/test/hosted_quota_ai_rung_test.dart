// `HostedQuotaAiRung` tests (Story 3.2 / FR6 / AD-5).
//
// Pins:
//   * quota exhaustion returns `QuotaExhausted(resetAt)` BEFORE
//     any transport call (FR6 — "zero pressure, no countdown");
//   * EVERY call attempt is counted (N9) — success, empty plate,
//     no-match and transport failure alike — and the slot is taken
//     BEFORE the transport call, so a failing provider cannot be
//     hammered without bound;
//   * `HostedQuotaRecognized(foods)` maps to `RecognizedPlate(foods)`;
//   * `HostedQuotaRecognized([])` maps to `RecognizedPlate(foods: [])`;
//   * `HostedQuotaNoMatch()` maps to `NoMatch()`;
//   * `HostedQuotaFailure(cause)` maps to `RecognitionFailure(cause)`;
//   * `resetAt` propagates from the counter to the result so the
//     UI can render the calm "wait for the quota to reset" copy.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('HostedQuotaAiRung (Story 3.2 / FR6)', () {
    test('quota exhaustion returns QuotaExhausted BEFORE any '
        'transport call (FR6)', () async {
      final counter = _FakeQuotaCounter(
        ceiling: 5,
        initialCalls: 5,
        resetAt: DateTime(2026, 8, 17),
      );
      var transportCalls = 0;
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) {
          transportCalls++;
          return const HostedQuotaNoMatch();
        },
      );
      final rung = HostedQuotaAiRung(quotaCounter: counter, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<QuotaExhausted>());
      expect(
        transportCalls,
        0,
        reason: 'transport must not be called on quota exhaustion',
      );
      final exhausted = result as QuotaExhausted;
      expect(exhausted.resetAt, isNotNull);
      expect(exhausted.resetAt, DateTime(2026, 8, 17));
    });

    test('HostedQuotaRecognized with foods maps to RecognizedPlate '
        'and counts the attempt (N9)', () async {
      final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
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
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) => HostedQuotaRecognized(foods),
      );
      final rung = HostedQuotaAiRung(quotaCounter: counter, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, foods);
      expect(counter.recordCallCount, 1);
    });

    test(
      'HostedQuotaRecognized with empty foods maps to '
      'RecognizedPlate(foods: []) and still counts the attempt (N9)',
      () async {
        final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
        final provider = _FakeHostedQuotaProvider(
          onRecognize: (_) => const HostedQuotaRecognized(<RecognizedFood>[]),
        );
        final rung = HostedQuotaAiRung(
          quotaCounter: counter,
          provider: provider,
        );

        final result = await rung.recognize(Uint8List(0));

        expect(result, isA<RecognizedPlate>());
        expect((result as RecognizedPlate).foods, isEmpty);
        expect(
          counter.recordCallCount,
          1,
          reason: 'every attempt counts, even an empty recognition',
        );
      },
    );

    test(
      'HostedQuotaNoMatch maps to NoMatch and counts the attempt (N9)',
      () async {
        final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
        final provider = _FakeHostedQuotaProvider(
          onRecognize: (_) => const HostedQuotaNoMatch(),
        );
        final rung = HostedQuotaAiRung(
          quotaCounter: counter,
          provider: provider,
        );

        final result = await rung.recognize(Uint8List(0));

        expect(result, isA<NoMatch>());
        expect(counter.recordCallCount, 1, reason: 'a no-match is an attempt');
      },
    );

    test('HostedQuotaFailure maps to RecognitionFailure and counts the '
        'attempt (N9)', () async {
      final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) => const HostedQuotaFailure('network down'),
      );
      final rung = HostedQuotaAiRung(quotaCounter: counter, provider: provider);

      final result = await rung.recognize(Uint8List(0));

      expect(result, isA<RecognitionFailure>());
      expect((result as RecognitionFailure).cause.toString(), 'network down');
      expect(
        counter.recordCallCount,
        1,
        reason: 'a failing provider must not be retried for free',
      );
    });

    test('the slot is taken BEFORE the transport call (N9)', () async {
      final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
      int? seenAtCallTime;
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) {
          seenAtCallTime = counter.recordCallCount;
          return const HostedQuotaNoMatch();
        },
      );
      await HostedQuotaAiRung(
        quotaCounter: counter,
        provider: provider,
      ).recognize(Uint8List(0));
      expect(seenAtCallTime, 1);
    });

    test('a failing counter is mapped to RecognitionFailure, not thrown, '
        'and the transport is not called', () async {
      final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0)
        ..failConsume = true;
      var calls = 0;
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) {
          calls++;
          return const HostedQuotaNoMatch();
        },
      );
      final result = await HostedQuotaAiRung(
        quotaCounter: counter,
        provider: provider,
      ).recognize(Uint8List(0));
      expect(result, isA<RecognitionFailure>());
      expect(calls, 0);
    });

    test('a call that throws still counts (N9)', () async {
      final counter = _FakeQuotaCounter(ceiling: 5, initialCalls: 0);
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) => throw StateError('boom'),
      );
      final rung = HostedQuotaAiRung(quotaCounter: counter, provider: provider);
      await expectLater(rung.recognize(Uint8List(0)), throwsStateError);
      expect(counter.recordCallCount, 1);
    });

    test('resetAt propagates from the counter to the result', () async {
      final counter = _FakeQuotaCounter(
        ceiling: 5,
        initialCalls: 5,
        resetAt: DateTime(2026, 8, 17, 0, 0),
      );
      final provider = _FakeHostedQuotaProvider(
        onRecognize: (_) => const HostedQuotaNoMatch(),
      );
      final rung = HostedQuotaAiRung(quotaCounter: counter, provider: provider);

      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<QuotaExhausted>());
      expect((result as QuotaExhausted).resetAt, DateTime(2026, 8, 17));
    });
  });
}

/// Fake `QuotaCounter` for tests — deterministic, no I/O, records
/// `recordCall` invocations so the test can assert the counter
/// semantics (NFR5 — empty recognition / no-match / transport
/// failure does not burn a quota slot).
class _FakeQuotaCounter implements QuotaCounter {
  _FakeQuotaCounter({
    required this.ceiling,
    required this.initialCalls,
    DateTime? resetAt,
  }) : _resetAt = resetAt,
       _calls = initialCalls;

  final int ceiling;
  final int initialCalls;
  final DateTime? _resetAt;
  int _calls;
  int recordCallCount = 0;

  @override
  Future<int> callsToday() async => _calls;

  bool failConsume = false;

  @override
  Future<void> recordCall() async {
    recordCallCount++;
    _calls++;
  }

  @override
  Future<bool> tryConsume() async {
    if (failConsume) throw StateError('keystore down');
    if (_calls >= ceiling) return false;
    recordCallCount++;
    _calls++;
    return true;
  }

  @override
  Future<DateTime?> resetAt() async => _resetAt;

  @override
  Future<bool> isExhausted() async => _calls >= ceiling;
}

/// Fake `HostedQuotaProvider` for tests — returns the configured
/// outcome from `onRecognize`. Lets the test suite exercise the
/// rung contract without ever touching the network or
/// `flutter_secure_storage`.
class _FakeHostedQuotaProvider implements HostedQuotaProvider {
  _FakeHostedQuotaProvider({required this.onRecognize});

  final HostedQuotaOutcome Function(Uint8List) onRecognize;

  @override
  Future<HostedQuotaOutcome> recognize({required Uint8List photoBytes}) async {
    return onRecognize(photoBytes);
  }
}
