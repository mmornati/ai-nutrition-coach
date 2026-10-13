// Test helper: "every plate" as a range read / watch, now that the store
// port only offers date-ranged reads (security review F8).

import 'package:domain_core/domain_core.dart';

final DateTime _beginning = DateTime.utc(1970);
final DateTime _end = DateTime.utc(2200);

extension AllPlates on EncryptedStore {
  /// A watch over the whole timeline.
  Stream<List<PlateLog>> watchAll() => watchRange(from: _beginning, to: _end);

  /// A one-shot read of the whole timeline; throws on a typed failure.
  Future<List<PlateLog>> readAll() async {
    final result = await readRange();
    return switch (result) {
      PlatesRead(:final plates) => plates,
      PlatesReadFailed(:final failure) => throw StateError('$failure'),
    };
  }
}
