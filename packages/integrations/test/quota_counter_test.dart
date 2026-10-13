// `QuotaCounter` tests (Story 3.2 / FR6 / AD-8).
//
// Pins:
//   * the in-memory counter increments on `recordCall()`;
//   * the counter rolls over at UTC midnight local (the next
//     `callsToday()` returns 0 when the local day changes);
//   * `isExhausted()` returns true once `calls >= ceiling`;
//   * `resetAt()` returns the next UTC midnight local.

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/memory_secure_storage.dart';

void main() {
  group('InMemoryQuotaCounter (Story 3.2 / FR6)', () {
    test('starts at zero', () async {
      final counter = InMemoryQuotaCounter(ceiling: 5);
      expect(await counter.callsToday(), 0);
      expect(await counter.isExhausted(), isFalse);
    });

    test('recordCall increments the counter', () async {
      final counter = InMemoryQuotaCounter(ceiling: 5);
      await counter.recordCall();
      expect(await counter.callsToday(), 1);
      await counter.recordCall();
      await counter.recordCall();
      expect(await counter.callsToday(), 3);
    });

    test('isExhausted returns true once calls >= ceiling', () async {
      final counter = InMemoryQuotaCounter(ceiling: 2);
      expect(await counter.isExhausted(), isFalse);
      await counter.recordCall();
      expect(await counter.isExhausted(), isFalse);
      await counter.recordCall();
      expect(await counter.isExhausted(), isTrue);
    });

    test('day rollover resets the counter to zero', () async {
      var fakeNow = DateTime(2026, 8, 16, 10, 0);
      final counter = InMemoryQuotaCounter(ceiling: 5, now: () => fakeNow);
      await counter.recordCall();
      await counter.recordCall();
      expect(await counter.callsToday(), 2);

      // Advance the clock past UTC midnight local.
      fakeNow = DateTime(2026, 8, 17, 0, 30);
      expect(await counter.callsToday(), 0);
      expect(await counter.isExhausted(), isFalse);
    });

    test('resetAt returns the next UTC midnight in local time', () async {
      final fakeNow = DateTime(2026, 8, 16, 10, 0);
      final counter = InMemoryQuotaCounter(ceiling: 5, now: () => fakeNow);
      final resetAt = await counter.resetAt();
      expect(resetAt, isNotNull);
      expect(resetAt!.year, 2026);
      expect(resetAt.month, 8);
      expect(resetAt.day, 17);
      expect(resetAt.hour, 0);
      expect(resetAt.minute, 0);
    });
  });

  group('SecureStorageQuotaCounter (Story 3.2 / FR6 / AD-8)', () {
    test('constructor accepts an injected FlutterSecureStorage', () {
      // The production adapter is constructible with the
      // default `FlutterSecureStorage()`; tests inject a fake
      // (see `flutter_secure_storage`'s test seam). This test
      // pins that the production wiring path exists.
      final counter = SecureStorageQuotaCounter(ceiling: 5);
      expect(counter.ceiling, 5);
    });

    test('tryConsume is atomic: 20 overlapping callers take exactly '
        '`ceiling` slots', () async {
      final counter = SecureStorageQuotaCounter(
        ceiling: 5,
        storage: MemorySecureStorage(),
        now: () => DateTime(2026, 8, 16, 12),
      );
      final results = await Future.wait([
        for (var i = 0; i < 20; i++) counter.tryConsume(),
      ]);
      expect(results.where((r) => r).length, 5);
      expect(await counter.callsToday(), 5);
      final mem = InMemoryQuotaCounter(ceiling: 3);
      final r2 = await Future.wait([
        for (var i = 0; i < 10; i++) mem.tryConsume(),
      ]);
      expect(r2.where((r) => r).length, 3);
    });

    test('counts calls and rolls over at local midnight', () async {
      final storage = MemorySecureStorage();
      var now = DateTime(2026, 8, 16, 23, 0);
      final counter = SecureStorageQuotaCounter(
        ceiling: 2,
        storage: storage,
        now: () => now,
      );
      expect(await counter.callsToday(), 0);
      await counter.recordCall();
      await counter.recordCall();
      expect(await counter.isExhausted(), isTrue);
      now = DateTime(2026, 8, 17, 0, 5);
      expect(await counter.callsToday(), 0);
      expect(await counter.isExhausted(), isFalse);
    });

    test('N9: overlapping recordCalls are serialised — none is lost', () async {
      final counter = SecureStorageQuotaCounter(
        ceiling: 100,
        storage: MemorySecureStorage(),
        now: () => DateTime(2026, 8, 16, 12),
      );
      await Future.wait([for (var i = 0; i < 10; i++) counter.recordCall()]);
      expect(await counter.callsToday(), 10);
    });

    for (final corrupt in <String>[
      'not json',
      '[]',
      '{}',
      '{"day": 5, "calls": 3}',
      '{"day": "2026-08-16", "calls": "many"}',
      '{"day": "2026-13-45", "calls": 1}',
      '{"day": "2026-08-16", "calls": -4}',
      '{"day": "garbage", "calls": 1}',
    ]) {
      test('N9: corrupt storage ($corrupt) is "no calls yet", never a '
          'crash', () async {
        final storage = MemorySecureStorage();
        storage.items[SecureStorageAliases.quotaHostedQuota] = corrupt;
        final counter = SecureStorageQuotaCounter(
          ceiling: 5,
          storage: storage,
          now: () => DateTime(2026, 8, 16, 12),
        );
        expect(await counter.callsToday(), 0);
        await counter.recordCall();
        expect(await counter.callsToday(), 1);
      });
    }

    test('N9: an unreadable keystore does not crash the counter', () async {
      final storage = MemorySecureStorage()..failReads = true;
      final counter = SecureStorageQuotaCounter(ceiling: 5, storage: storage);
      expect(await counter.callsToday(), 0);
    });

    test('resetAt is the next calendar midnight', () async {
      final counter = SecureStorageQuotaCounter(
        ceiling: 5,
        storage: MemorySecureStorage(),
        now: () => DateTime(2026, 3, 28, 13), // day before EU DST change
      );
      expect(await counter.resetAt(), DateTime(2026, 3, 29));
    });
  });
}
