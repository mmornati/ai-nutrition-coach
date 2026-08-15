// The single convergent record for one logged meal. Every capture path in
// Epic 1 (manual/voice, barcode, photo — Stories 1.5/1.7/1.8) lands here
// via the same `RecordPlate` use-case (AD-3). `loggedAtUtc` is the
// authoritative moment of capture, stored as UTC ISO-8601 in the drift
// schema and rendered local by the UI.
//
// `entries` is the resolved list at commit time. The store guarantees
// the list is non-empty (validation refusal in `RecordPlate` makes an
// empty plate impossible), so callers may iterate without a guard.

import 'food_entry.dart';

class PlateLog {
  const PlateLog({
    required this.id,
    required this.loggedAtUtc,
    required this.entries,
  });

  final int id;
  final DateTime loggedAtUtc;
  final List<FoodEntry> entries;

  PlateLog copyWith({
    int? id,
    DateTime? loggedAtUtc,
    List<FoodEntry>? entries,
  }) {
    return PlateLog(
      id: id ?? this.id,
      loggedAtUtc: loggedAtUtc ?? this.loggedAtUtc,
      entries: entries ?? this.entries,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! PlateLog) return false;
    return other.id == id &&
        other.loggedAtUtc == loggedAtUtc &&
        _listEq(other.entries, entries);
  }

  @override
  int get hashCode => Object.hash(id, loggedAtUtc, Object.hashAll(entries));

  @override
  String toString() =>
      'PlateLog(id: $id, loggedAtUtc: $loggedAtUtc, entries: $entries)';
}

bool _listEq<T>(List<T> a, List<T> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
