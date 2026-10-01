// `RecordPlate` post-commit guards (security review F7), quantity
// validation (F10) and secure op ids (F4).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _Store implements EncryptedStore {
  int calls = 0;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    calls++;
    return RecordPlateSuccess(
      PlateLog(
        id: 5,
        loggedAtUtc: DateTime.utc(2026, 8, 16, 12),
        entries: [
          for (var i = 0; i < entries.length; i++)
            FoodEntry(
              id: i + 1,
              plateLogId: 5,
              databaseFood: entries[i].databaseFood,
              quantity: entries[i].quantity,
            ),
        ],
      ),
    );
  }

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) => const Stream<List<PlateLog>>.empty();

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      const PlatesRead(<PlateLog>[]);

  @override
  Future<void> close() async {}
}

class _Coach implements Coach {
  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) => const CoachFound(
    CoachQuestion(
      key: 'post.resolve.vegLight',
      text: 'hello',
      anchor: CoachAnchor.postResolve,
      pattern: CompositionPattern.vegLight,
    ),
  );
}

class _NotesStore implements CoachNoteStore {
  _NotesStore({this.mode = 'ok'});

  /// `ok`, `fail` (typed append failure) or `throw`.
  final String mode;
  final List<CoachNote> appended = [];

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    if (mode == 'throw') throw Exception('boom');
    if (mode == 'fail') {
      return const CoachNoteAppendFailure(
        StoreFailure(encryptedStoreError: SecureKeyFailure()),
      );
    }
    appended.add(note.copyWith(id: appended.length + 1));
    return CoachNoteAppended(appended.last);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) =>
      const Stream<List<CoachNote>>.empty();

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async => const CoachInteractionRecorded(1);

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async =>
      const CoachInteractionRecorded(1);

  @override
  Stream<Set<String>> watchDismissals() => const Stream<Set<String>>.empty();
}

/// A notes store with a programming bug (an `Error`, not an `Exception`).
class _ErrorNotes extends _NotesStore {
  @override
  Future<CoachNoteAppendResult> append(CoachNote note) =>
      throw StateError('bug');
}

class _Queue implements SyncQueue {
  _Queue({this.throws = false, this.fails = false});

  final bool throws;
  final bool fails;
  final List<SyncOp> ops = [];

  @override
  Future<EnqueueResult> enqueue(SyncOp op) async {
    if (throws) throw Exception('queue exploded');
    if (fails) return const EnqueueFailed('disk');
    ops.add(op);
    return const Enqueued();
  }

  @override
  Future<List<SyncOp>> pending({int limit = 50}) async => ops;

  @override
  Stream<SyncQueueState> watchState() => const Stream.empty();

  @override
  Stream<List<SyncOpStatus>> watchPerPlate() => const Stream.empty();

  @override
  Future<MarkResult> markSynced(String opId) async => const Marked();

  @override
  Future<MarkResult> markFailed(String opId, {required String reason}) async =>
      const Marked();
}

FoodEntryDraft _draft({FoodGroup group = FoodGroup.protein}) => FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'manual:egg',
    displayName: 'Egg',
    source: SourceCatalog.manual,
    foodGroup: group,
  ),
  quantity: const QuantityRange(
    low: 1,
    high: 2,
    unit: 'piece',
    displayLabel: '~1-2',
  ),
);

RecordPlate _useCase(_NotesStore notes, _Queue queue) => RecordPlate(
  generator: CoachNoteGenerator(coach: _Coach(), store: notes),
  syncOpEnqueue: RecordSyncOp(queue: queue),
);

void main() {
  group('post-commit guards (F7)', () {
    test('clean run: success with no warnings, note + op written', () async {
      final notes = _NotesStore();
      final queue = _Queue();
      final result = await _useCase(notes, queue)(
        entries: [_draft()],
        store: _Store(),
      );
      expect(result, isA<RecordPlateSuccess>());
      expect((result as RecordPlateSuccess).warnings, isEmpty);
      expect(notes.appended, hasLength(1));
      expect(queue.ops, hasLength(1));
    });

    test(
      'a THROWING coach store is a success with a coachNote warning',
      () async {
        final result = await _useCase(_NotesStore(mode: 'throw'), _Queue())(
          entries: [_draft()],
          store: _Store(),
        );
        expect(result, isA<RecordPlateSuccess>());
        expect((result as RecordPlateSuccess).warnings, [
          const PostCommitWarning(PostCommitStep.coachNote),
        ]);
      },
    );

    test('a typed note-append failure is a coachNote warning', () async {
      final result = await _useCase(_NotesStore(mode: 'fail'), _Queue())(
        entries: [_draft()],
        store: _Store(),
      );
      expect((result as RecordPlateSuccess).warnings, [
        const PostCommitWarning(PostCommitStep.coachNote),
      ]);
    });

    test('a THROWING queue is a success with a syncEnqueue warning', () async {
      final result = await _useCase(_NotesStore(), _Queue(throws: true))(
        entries: [_draft()],
        store: _Store(),
      );
      expect(result, isA<RecordPlateSuccess>());
      expect((result as RecordPlateSuccess).warnings, [
        const PostCommitWarning(PostCommitStep.syncEnqueue),
      ]);
    });

    test('both steps failing yields both warnings, still success', () async {
      final result = await _useCase(
        _NotesStore(mode: 'throw'),
        _Queue(fails: true),
      )(entries: [_draft()], store: _Store());
      expect((result as RecordPlateSuccess).warnings.map((w) => w.step), [
        PostCommitStep.coachNote,
        PostCommitStep.syncEnqueue,
      ]);
    });

    test(
      'a plate with no resolvable group is NOT a warning (nothing to say)',
      () async {
        final result = await _useCase(_NotesStore(), _Queue())(
          entries: [_draft(group: FoodGroup.other)],
          store: _Store(),
        );
        expect((result as RecordPlateSuccess).warnings, isEmpty);
      },
    );
  });

  group('only Exceptions are absorbed; warnings reach the sink', () {
    test(
      'an Error from a post-commit step PROPAGATES (a bug, not a warning)',
      () async {
        final useCase = RecordPlate(
          generator: CoachNoteGenerator(coach: _Coach(), store: _ErrorNotes()),
        );
        await expectLater(
          useCase(entries: [_draft()], store: _Store()),
          throwsA(isA<StateError>()),
        );
      },
    );

    test('onWarning is told about every warning', () async {
      final seen = <PostCommitWarning>[];
      final useCase = RecordPlate(
        generator: CoachNoteGenerator(
          coach: _Coach(),
          store: _NotesStore(mode: 'throw'),
        ),
        syncOpEnqueue: RecordSyncOp(queue: _Queue(fails: true)),
        onWarning: seen.add,
      );
      await useCase(entries: [_draft()], store: _Store());
      expect(seen.map((w) => w.step), [
        PostCommitStep.coachNote,
        PostCommitStep.syncEnqueue,
      ]);
    });

    test('a throwing sink cannot undo a committed plate', () async {
      final useCase = RecordPlate(
        generator: CoachNoteGenerator(
          coach: _Coach(),
          store: _NotesStore(mode: 'throw'),
        ),
        onWarning: (_) => throw Exception('sink down'),
      );
      expect(
        await useCase(entries: [_draft()], store: _Store()),
        isA<RecordPlateSuccess>(),
      );
    });
  });

  group('op ids (F4)', () {
    test('ops carry a random UUID v4, not a plate-derived id', () async {
      final queue = _Queue();
      final useCase = _useCase(_NotesStore(), queue);
      await useCase(entries: [_draft()], store: _Store());
      await useCase(entries: [_draft()], store: _Store());
      final ids = queue.ops.map((o) => o.opId).toList();
      expect(ids, hasLength(2));
      expect(ids.first, isNot(ids.last));
      for (final id in ids) {
        expect(
          id,
          matches(
            RegExp(
              r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ),
          ),
        );
        expect(id, isNot(startsWith('plate-')));
      }
    });

    test('an injected generator is used', () async {
      final queue = _Queue();
      final useCase = RecordPlate(
        generator: CoachNoteGenerator(coach: _Coach(), store: _NotesStore()),
        syncOpEnqueue: RecordSyncOp(queue: queue),
        opIdGenerator: () => 'fixed-id',
      );
      await useCase(entries: [_draft()], store: _Store());
      expect(queue.ops.single.opId, 'fixed-id');
    });
  });

  group('quantity validation (F10)', () {
    test(
      'QuantityRange.isValidRange rejects NaN / inf / negative / inverted',
      () {
        expect(QuantityRange.isValidRange(1, 2), isTrue);
        expect(QuantityRange.isValidRange(0, 0), isTrue);
        expect(QuantityRange.isValidRange(2, 1), isFalse);
        expect(QuantityRange.isValidRange(-1, 1), isFalse);
        expect(QuantityRange.isValidRange(double.nan, 1), isFalse);
        expect(QuantityRange.isValidRange(1, double.infinity), isFalse);
        expect(
          const QuantityRange(
            low: 1,
            high: 2,
            unit: 'g',
            displayLabel: 'x',
          ).isValid,
          isTrue,
        );
      },
    );

    test(
      'RecordPlate refuses an invalid quantity before the store',
      () async {
        final store = _Store();
        final result = await _useCase(_NotesStore(), _Queue())(
          entries: [
            FoodEntryDraft(
              databaseFood: _draft().databaseFood,
              // Built at runtime: the const constructor asserts in debug.
              quantity: QuantityRange(
                low: double.nan,
                high: 1,
                unit: 'g',
                displayLabel: 'x',
              ),
            ),
          ],
          store: store,
        );
        // (In debug the assert fires first; reaching here means asserts are off.)
        expect(result, isA<StoreFailure>());
        expect(
          (result as StoreFailure).validationError,
          isA<InvalidQuantityFailure>(),
        );
        expect(store.calls, 0);
      },
      skip: _assertsOn ? 'asserts enabled: constructor throws first' : false,
    );

    test('the constructor asserts the invariant in debug', () {
      expect(
        () => QuantityRange(low: 3, high: 1, unit: 'g', displayLabel: 'x'),
        throwsA(isA<AssertionError>()),
        skip: _assertsOn ? false : 'asserts disabled',
      );
    });

    test('PlateLog.entries is unmodifiable', () {
      final plate = PlateLog(
        id: 1,
        loggedAtUtc: DateTime.utc(2026),
        entries: [],
      );
      expect(
        () => plate.entries.add(
          FoodEntry(
            id: 1,
            plateLogId: 1,
            databaseFood: _draft().databaseFood,
            quantity: _draft().quantity,
          ),
        ),
        throwsUnsupportedError,
      );
    });
  });
}

final bool _assertsOn = () {
  var on = false;
  assert(on = true);
  return on;
}();
