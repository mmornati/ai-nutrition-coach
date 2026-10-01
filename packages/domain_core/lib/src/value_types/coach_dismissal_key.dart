// Keys of the durable "quiet" markers (security review F6).
//
// Dismissing a whisper ("ask later", dismiss) or an open-plate hint must
// survive a restart — otherwise the coach nags again on the next launch,
// which is exactly what the calm contract forbids. The marker is one row
// in the dismissal table, identified by one of these keys:
//
//   * `note:<id>`                       — a post-resolve whisper.
//   * `openPlate:<yyyy-MM-dd>:<slot>`   — the open-plate hint of one meal
//     slot on one local day (a new day asks again; today stays quiet).
//
// No synthetic `CoachNote` rows are written for hints any more (the old
// `plateLogId: 0` sentinel is gone).

/// The dismissal key of the whisper of the coach note with [noteId].
String coachNoteDismissalKey(int noteId) => 'note:$noteId';

/// The dismissal key of the open-plate hint of [slotName] (a meal slot's
/// `name`) on the local calendar day [day].
String openPlateDismissalKey({
  required DateTime day,
  required String slotName,
}) {
  final y = day.year.toString().padLeft(4, '0');
  final m = day.month.toString().padLeft(2, '0');
  final d = day.day.toString().padLeft(2, '0');
  return 'openPlate:$y-$m-$d:$slotName';
}
