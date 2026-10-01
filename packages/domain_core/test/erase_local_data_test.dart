// `EraseLocalData` use-case pins (Phase 2A / D8).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _FakeEraser implements LocalDataEraser {
  _FakeEraser(this._behaviour);

  final Future<EraseLocalDataResult> Function() _behaviour;
  int calls = 0;

  @override
  Future<EraseLocalDataResult> eraseAll() {
    calls++;
    return _behaviour();
  }
}

void main() {
  group('EraseLocalData', () {
    test('delegates to the port and returns its success', () async {
      final eraser = _FakeEraser(() async => const EraseLocalDataSuccess());
      final result = await EraseLocalData(eraser)();
      expect(result, isA<EraseLocalDataSuccess>());
      expect(eraser.calls, 1);
    });

    test('passes a typed failure through untouched', () async {
      final eraser = _FakeEraser(
        () async => EraseLocalDataFailure([EraseStep.secureStorage]),
      );
      final result = await EraseLocalData(eraser)();
      expect(
        result,
        isA<EraseLocalDataFailure>().having(
          (f) => f.failedSteps,
          'failedSteps',
          [EraseStep.secureStorage],
        ),
      );
    });

    test('an adapter that throws is collapsed to a typed failure', () async {
      final eraser = _FakeEraser(() async => throw StateError('boom'));
      final result = await EraseLocalData(eraser)();
      expect(result, isA<EraseLocalDataFailure>());
      expect(
        (result as EraseLocalDataFailure).failedSteps,
        containsAll(EraseStep.values),
      );
    });

    test('failure equality ignores step order', () {
      expect(
        EraseLocalDataFailure([EraseStep.closeStore, EraseStep.exportFiles]),
        EraseLocalDataFailure([EraseStep.exportFiles, EraseStep.closeStore]),
      );
    });
  });

  group('new EncryptedStoreFailure variants (Phase 2A)', () {
    test('KeyLostFailure / StoreOperationFailure ride StoreFailure', () {
      const lost = StoreFailure(encryptedStoreError: KeyLostFailure());
      const op = StoreFailure(encryptedStoreError: StoreOperationFailure());
      expect(lost.encryptedStoreError, isA<KeyLostFailure>());
      expect(op.encryptedStoreError, isA<StoreOperationFailure>());
      expect(lost, isNot(equals(op)));
      expect(const KeyLostFailure(), const KeyLostFailure());
    });

    test('StoreStreamException wraps a typed failure only', () {
      const e = StoreStreamException(
        StoreFailure(encryptedStoreError: StoreOperationFailure()),
      );
      expect(e.toString(), contains('StoreOperationFailure'));
    });
  });
}
