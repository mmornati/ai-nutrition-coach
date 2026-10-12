import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _Store implements EncryptedStore {
  _Store(this.result, this.log);
  final DeletePlateResult result;
  final List<String> log;

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async {
    log.add('plate:$plateLogId');
    return result;
  }

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) => throw UnimplementedError();

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) => throw UnimplementedError();

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) =>
      throw UnimplementedError();

  @override
  Future<void> close() async {}
}

class _Notes implements CoachNoteStore {
  _Notes(this.result, this.log, {this.throws = false});
  final DeletePlateResult result;
  final List<String> log;
  final bool throws;

  @override
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async {
    log.add('notes:$plateLogId');
    if (throws) throw Exception('boom');
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

const _failure = StoreFailure(encryptedStoreError: StoreOperationFailure());

void main() {
  test(
    'deletes the plate (with its cascade) first, then the coach notes',
    () async {
      final log = <String>[];
      final result = await DeletePlate(
        store: _Store(const PlateDeleted(), log),
        coachNotes: _Notes(const PlateDeleted(), log),
      )(7);
      expect(result, isA<PlateDeleted>());
      expect(log, ['plate:7', 'notes:7']);
    },
  );

  test('a failed plate delete stops before the notes step', () async {
    final log = <String>[];
    final result = await DeletePlate(
      store: _Store(const PlateDeleteFailed(_failure), log),
      coachNotes: _Notes(const PlateDeleted(), log),
    )(7);
    expect(result, const PlateDeleteFailed(_failure));
    expect(log, ['plate:7']);
  });

  test('a failed notes cascade is reported', () async {
    final log = <String>[];
    final result = await DeletePlate(
      store: _Store(const PlateDeleted(), log),
      coachNotes: _Notes(const PlateDeleteFailed(_failure), log),
    )(7);
    expect(result, isA<PlateDeleteFailed>());
  });

  test('an adapter that throws is collapsed to a typed failure', () async {
    final log = <String>[];
    final result = await DeletePlate(
      store: _Store(const PlateDeleted(), log),
      coachNotes: _Notes(const PlateDeleted(), log, throws: true),
    )(7);
    expect(result, isA<PlateDeleteFailed>());
    expect(log, ['plate:7', 'notes:7']);
  });
}
