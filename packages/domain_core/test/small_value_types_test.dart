// UUID v4, balance coverage, FoodGroup.tryParse, platesInRange and the
// DrainSyncQueue loop (security review F2 / F4 / F9).

import 'dart:math';

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _Adapter implements SyncAdapter {
  _Adapter(this.hasTransport, this.results);

  @override
  final bool hasTransport;
  final List<DrainResult> results;
  int calls = 0;

  @override
  Future<DrainResult> drain(SyncOp op) async => results[calls++];
}

class _Queue implements SyncQueue {
  _Queue(int n)
    : ops = [
        for (var i = 0; i < n; i++)
          SyncOp(
            opId: 'op$i',
            plateLogId: i,
            enqueuedAtUtc: DateTime.utc(2026),
            kind: SyncOpKind.plateLogCreated,
          ),
      ];

  final List<SyncOp> ops;
  final List<String> synced = [];
  final List<String> failed = [];
  int pendingReads = 0;

  @override
  Future<List<SyncOp>> pending({int limit = 50}) async {
    pendingReads++;
    return ops;
  }

  @override
  Future<MarkResult> markSynced(String opId) async {
    synced.add(opId);
    return const Marked();
  }

  @override
  Future<MarkResult> markFailed(String opId, {required String reason}) async {
    failed.add(opId);
    return const Marked();
  }

  @override
  Future<EnqueueResult> enqueue(SyncOp op) async => const Enqueued();

  @override
  Stream<SyncQueueState> watchState() => const Stream.empty();

  @override
  Stream<List<SyncOpStatus>> watchPerPlate() => const Stream.empty();
}

void main() {
  quantityRangeCheckedTests();
  test('generateUuidV4: shape, version, variant, uniqueness', () {
    final ids = {for (var i = 0; i < 200; i++) generateUuidV4()};
    expect(ids, hasLength(200));
    for (final id in ids) {
      expect(id.length, 36);
      expect(id[14], '4');
      expect('89ab'.contains(id[19]), isTrue);
    }
  });

  test('generateUuidV4 is deterministic for a seeded Random (injectable)', () {
    expect(generateUuidV4(Random(1)), generateUuidV4(Random(1)));
  });

  test('balanceCoverage reflects the groups present, in arc order', () {
    expect(balanceCoverage(const []), [false, false, false, false]);
    expect(balanceCoverage([FoodGroup.vegFruit, FoodGroup.dairy]), [
      true,
      false,
      false,
      true,
    ]);
    expect(balanceCoverage([FoodGroup.other]), [false, false, false, false]);
    expect(
      balanceCoverage([
        FoodGroup.vegFruit,
        FoodGroup.protein,
        FoodGroup.starch,
        FoodGroup.dairy,
      ]),
      [true, true, true, true],
    );
  });

  test('FoodGroup.tryParse accepts only exact closed-enum names', () {
    expect(FoodGroup.tryParse('vegFruit'), FoodGroup.vegFruit);
    expect(FoodGroup.tryParse(' protein '), FoodGroup.protein);
    expect(FoodGroup.tryParse('Protein'), isNull);
    expect(FoodGroup.tryParse('veg'), isNull);
    expect(FoodGroup.tryParse(3), isNull);
    expect(FoodGroup.tryParse(null), isNull);
  });

  test('platesInRange is half-open [from, to) and newest first', () {
    PlateLog at(int id, DateTime t) =>
        PlateLog(id: id, loggedAtUtc: t.toUtc(), entries: const []);
    final a = at(1, DateTime.utc(2026, 8, 15, 0));
    final b = at(2, DateTime.utc(2026, 8, 15, 12));
    final c = at(3, DateTime.utc(2026, 8, 16, 0));
    final r = platesInRange(
      [a, b, c],
      from: DateTime.utc(2026, 8, 15),
      to: DateTime.utc(2026, 8, 16),
    );
    expect(r.map((p) => p.id), [2, 1]);
    expect(platesInRange([a, b, c]).map((p) => p.id), [3, 2, 1]);
  });

  group('DrainSyncQueue (F4)', () {
    test(
      'no transport: nothing read, nothing marked, never "drained"',
      () async {
        final queue = _Queue(2);
        final adapter = _Adapter(false, const []);
        final summary = await DrainSyncQueue(queue: queue, adapter: adapter)();
        expect(summary.noTransport, isTrue);
        expect(summary.drained, 0);
        expect(queue.pendingReads, 0);
        expect(queue.synced, isEmpty);
        expect(adapter.calls, 0);
      },
    );

    test('Drained marks synced; permanent marks failed; in order', () async {
      final queue = _Queue(2);
      final adapter = _Adapter(true, const [
        Drained(),
        DrainFailedPermanent('schema'),
      ]);
      final summary = await DrainSyncQueue(queue: queue, adapter: adapter)();
      expect(queue.synced, ['op0']);
      expect(queue.failed, ['op1']);
      expect(summary.drained, 1);
      expect(summary.failed, 1);
    });

    test(
      'a retryable failure stops the pass and leaves the rest pending',
      () async {
        final queue = _Queue(3);
        final adapter = _Adapter(true, const [
          Drained(),
          DrainFailedRetryable('5xx'),
          Drained(),
        ]);
        final summary = await DrainSyncQueue(queue: queue, adapter: adapter)();
        expect(queue.synced, ['op0']);
        expect(summary.deferred, 2);
        expect(adapter.calls, 2);
      },
    );

    test('DrainSkippedNoTransport from the adapter marks nothing', () async {
      final queue = _Queue(2);
      final adapter = _Adapter(true, const [DrainSkippedNoTransport()]);
      final summary = await DrainSyncQueue(queue: queue, adapter: adapter)();
      expect(summary.noTransport, isTrue);
      expect(queue.synced, isEmpty);
      expect(queue.failed, isEmpty);
    });

    test('an adapter that throws is a retryable failure', () async {
      final queue = _Queue(1);
      final adapter = _ThrowingAdapter();
      final summary = await DrainSyncQueue(queue: queue, adapter: adapter)();
      expect(summary.deferred, 1);
      expect(queue.synced, isEmpty);
    });
  });
}

class _ThrowingAdapter implements SyncAdapter {
  @override
  bool get hasTransport => true;

  @override
  Future<DrainResult> drain(SyncOp op) async => throw StateError('x');
}

void quantityRangeCheckedTests() {
  group('QuantityRange.checked (validates in every build mode)', () {
    test('accepts a valid range', () {
      final q = QuantityRange.checked(
        low: 1,
        high: 2,
        unit: 'cup',
        displayLabel: '~1-2 cups',
      );
      expect(q.high, 2);
    });

    for (final bad in <(num, num)>[
      (-1, 1),
      (2, 1),
      (double.nan, 1),
      (0, double.infinity),
    ]) {
      test('rejects ${bad.$1}..${bad.$2} with ArgumentError', () {
        expect(
          () => QuantityRange.checked(
            low: bad.$1,
            high: bad.$2,
            unit: 'x',
            displayLabel: 'x',
          ),
          throwsArgumentError,
        );
      });
    }

    test('copyWith cannot produce an invalid range', () {
      const q = QuantityRange(low: 1, high: 2, unit: 'x', displayLabel: 'x');
      expect(() => q.copyWith(low: 5), throwsArgumentError);
    });
  });
}
