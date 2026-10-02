// When is a quiet export suggestion in order? (PWA durable-storage plan.)
//
// A browser may clear a site's storage when space runs low, and a phone can
// be lost, so the app suggests an export now and then. The rule is pure and
// deliberately gentle (docs/no-dark-patterns-standard.md):
//
//   * only when there IS something to lose (`hasData`);
//   * only when the last export is older than [kExportReminderAfter] (or
//     there never was one);
//   * and never again within [kExportReminderAfter] of the user dismissing
//     it — one "not now" is respected for the same stretch;
//   * it is a single quiet line on one screen: no badge, no count, no
//     modal, no streak, no push.

/// How old the last export may be before the suggestion appears, and how
/// long a dismissal keeps it quiet.
const Duration kExportReminderAfter = Duration(days: 14);

/// True when the Your data screen should show the one-line export
/// suggestion.
bool exportReminderDue({
  required DateTime now,
  required bool hasData,
  DateTime? lastExportAt,
  DateTime? dismissedAt,
}) {
  if (!hasData) return false;
  final last = lastExportAt;
  final stale = last == null || now.difference(last) > kExportReminderAfter;
  if (!stale) return false;
  final dismissed = dismissedAt;
  // A dismissal made before the latest export is history; after it, it
  // quiets the suggestion for another stretch.
  if (dismissed != null &&
      now.difference(dismissed) <= kExportReminderAfter &&
      (last == null || dismissed.isAfter(last))) {
    return false;
  }
  return true;
}
