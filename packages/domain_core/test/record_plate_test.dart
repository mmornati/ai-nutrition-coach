// `RecordPlate` use-case contract — locks the AD-3 invariant that every
// mutation flows through the use-case, with validation refusal at the
// domain boundary before any port call, and the post-resolve coach note
// fires AFTER the store commit (best-effort).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _FakeEncryptedStore implements EncryptedStore {
  _FakeEncryptedStore({
    RecordPlateResult? recordResult,
    Stream<List<PlateLog>>? watchStream,
  }) : _recordResult = recordResult,
       _watchStream = watchStream;

  final RecordPlateResult? _recordResult;
  final Stream<List<PlateLog>>? _watchStream;
  int recordCalls = 0;
  List<FoodEntryDraft>? lastEntries;
  DateTime? lastLoggedAtUtc;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    recordCalls++;
    lastEntries = entries;
    lastLoggedAtUtc = loggedAtUtc;
    return _recordResult ??
        RecordPlateSuccess(
          PlateLog(
            id: 0,
            loggedAtUtc: DateTime.utc(2026),
            entries: const <FoodEntry>[],
          ),
        );
  }

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) {
    return _watchStream ?? const Stream<List<PlateLog>>.empty();
  }

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      const PlatesRead(<PlateLog>[]);

  @override
  Future<void> close() async {}
}

/// Inert `Coach` — never consulted; the use-case test does not exercise
/// the coach dispatch path. Each test that does need the coach path
/// wires its own fakes (Story 2.2's `coach_note_generator_test.dart`).
class _StubCoach implements Coach {
  const _StubCoach();
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('not used');
}

/// Inert `CoachNoteStore` — never consulted by these tests.
class _StubCoachNoteStore implements CoachNoteStore {
  const _StubCoachNoteStore();
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('not used');
}

void main() {
  group('RecordPlate use-case', () {
    final generator = CoachNoteGenerator(
      coach: const _StubCoach(),
      store: const _StubCoachNoteStore(),
    );
    final useCase = RecordPlate(generator: generator);

    test(
      'happy path: delegates to the store with entries + loggedAtUtc',
      () async {
        final draft = FoodEntryDraft(
          databaseFood: const DatabaseFood(
            sourceRef: 'manual:apple',
            displayName: 'Apple',
            source: SourceCatalog.manual,
          ),
          quantity: const QuantityRange(
            low: 1,
            high: 2,
            unit: 'piece',
            displayLabel: '~1–2 pieces',
          ),
        );
        final committedAt = DateTime.utc(2026, 8, 15, 12);
        final expected = RecordPlateSuccess(
          PlateLog(
            id: 7,
            loggedAtUtc: committedAt,
            entries: const [
              FoodEntry(
                id: 11,
                plateLogId: 7,
                databaseFood: DatabaseFood(
                  sourceRef: 'manual:apple',
                  displayName: 'Apple',
                  source: SourceCatalog.manual,
                ),
                quantity: QuantityRange(
                  low: 1,
                  high: 2,
                  unit: 'piece',
                  displayLabel: '~1–2 pieces',
                ),
              ),
            ],
          ),
        );
        final store = _FakeEncryptedStore(recordResult: expected);

        final result = await useCase(
          entries: [draft],
          store: store,
          loggedAtUtc: committedAt,
        );

        expect(result, expected);
        expect(store.recordCalls, 1);
        expect(store.lastEntries, [draft]);
        expect(store.lastLoggedAtUtc, committedAt);
      },
    );

    test(
      'empty entries: returns EmptyPlateFailure and never calls the store',
      () async {
        final store = _FakeEncryptedStore();

        final result = await useCase(
          entries: const <FoodEntryDraft>[],
          store: store,
        );

        expect(result, isA<StoreFailure>());
        final failure = result as StoreFailure;
        expect(failure.validationError, isA<EmptyPlateFailure>());
        expect(failure.platformError, isNull);
        expect(failure.encryptedStoreError, isNull);
        expect(
          store.recordCalls,
          0,
          reason: 'use-case must refuse before reaching the port',
        );
      },
    );

    test(
      'store failure (UnsupportedPlatformFailure) propagates typed',
      () async {
        final store = _FakeEncryptedStore(
          recordResult: const StoreFailure(
            platformError: UnsupportedPlatformFailure(),
          ),
        );
        final draft = FoodEntryDraft(
          databaseFood: const DatabaseFood(
            sourceRef: 'x',
            displayName: 'X',
            source: SourceCatalog.manual,
          ),
          quantity: const QuantityRange(
            low: 0,
            high: 0,
            unit: 'g',
            displayLabel: '~0 g',
          ),
        );

        final result = await useCase(entries: [draft], store: store);

        expect(result, isA<StoreFailure>());
        final failure = result as StoreFailure;
        expect(failure.platformError, isA<UnsupportedPlatformFailure>());
        expect(failure.validationError, isNull);
        expect(failure.encryptedStoreError, isNull);
      },
    );

    test('store failure (SecureKeyFailure) propagates typed', () async {
      final store = _FakeEncryptedStore(
        recordResult: const StoreFailure(
          encryptedStoreError: SecureKeyFailure(),
        ),
      );
      final draft = FoodEntryDraft(
        databaseFood: const DatabaseFood(
          sourceRef: 'x',
          displayName: 'X',
          source: SourceCatalog.manual,
        ),
        quantity: const QuantityRange(
          low: 0,
          high: 0,
          unit: 'g',
          displayLabel: '~0 g',
        ),
      );

      final result = await useCase(entries: [draft], store: store);

      expect(result, isA<StoreFailure>());
      final failure = result as StoreFailure;
      expect(failure.encryptedStoreError, isA<SecureKeyFailure>());
      expect(failure.validationError, isNull);
      expect(failure.platformError, isNull);
    });
  });
}
