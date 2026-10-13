// `EraseLocalData` use case (Phase 2A / D8 / AD-8).
//
// The single entry point the "Erase all local data" affordance calls.
// It delegates to the `LocalDataEraser` port and guarantees the
// never-throws contract: an adapter that throws anyway is collapsed to a
// typed `EraseLocalDataFailure` naming every step as unconfirmed, so the
// UI renders the calm "couldn't finish erasing" line instead of an
// uncaught async error.
//
// AD-1: pure Dart.

import '../ports/local_data_eraser.dart';
import '../results/erase_failure.dart';

class EraseLocalData {
  const EraseLocalData(this._eraser);

  final LocalDataEraser _eraser;

  Future<EraseLocalDataResult> call() async {
    try {
      return await _eraser.eraseAll();
    } on Object {
      return EraseLocalDataFailure(EraseStep.values);
    }
  }
}
