// The export scope — visible day, the local week, or all history
// (Story 4.2 / AD-9 / FR-9 / NFR10).
//
// AD-1: the type lives in `domain_core`; pure-Dart.
//
// The scope is a sealed value type so the consumer pattern-matches
// the same shape the store reads (the Day Board classifies the
// visible day the same way; the exporter must match). Dates are
// passed in local time so the visible-day classifier the Day
// Board uses is the one the exporter uses.
//
// The `when` method lets the exporter branch on the variant
// without exposing the private subtypes.

sealed class ExportScope {
  const ExportScope._();

  /// The visible day: every plate whose `loggedAtUtc` falls on
  /// the same local calendar day as `day`.
  const factory ExportScope.visibleDay(DateTime day) = _VisibleDay;

  /// The week starting on `start` (inclusive) for seven local
  /// calendar days.
  const factory ExportScope.week(DateTime start) = _Week;

  /// Every plate in the store.
  const factory ExportScope.allHistory() = _AllHistory;

  /// Pattern-match the variant. The consumer provides a handler
  /// for each; the analyzer enforces exhaustiveness.
  T when<T>({
    required T Function(DateTime day) visibleDay,
    required T Function(DateTime start) week,
    required T Function() allHistory,
  }) {
    final self = this;
    if (self is _VisibleDay) return visibleDay(self.day);
    if (self is _Week) return week(self.start);
    if (self is _AllHistory) return allHistory();
    throw StateError('unreachable: sealed ExportScope variant');
  }
}

class _VisibleDay extends ExportScope {
  const _VisibleDay(this.day) : super._();
  final DateTime day;
}

class _Week extends ExportScope {
  const _Week(this.start) : super._();
  final DateTime start;
}

class _AllHistory extends ExportScope {
  const _AllHistory() : super._();
}
