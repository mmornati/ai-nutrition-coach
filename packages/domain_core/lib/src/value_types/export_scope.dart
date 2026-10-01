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
// `range` resolves the scope to the half-open instant range the store reads
// (`EncryptedStore.readRange`): the boundaries are LOCAL calendar days, built
// with `DateTime(y, m, d + n)` — never `add(Duration(days: n))`, which is
// wrong across a daylight-saving change (security review F3).
//
// The `when` method lets the exporter branch on the variant
// without exposing the private subtypes.

import 'calendar_day.dart';

sealed class ExportScope {
  const ExportScope();

  /// The visible day: every plate whose `loggedAtUtc` falls on
  /// the same local calendar day as `day`.
  const factory ExportScope.visibleDay(DateTime day) = _VisibleDay;

  /// The week starting on `start` (inclusive) for seven local
  /// calendar days.
  const factory ExportScope.week(DateTime start) = _Week;

  /// Every plate in the store.
  const factory ExportScope.allHistory() = _AllHistory;

  /// The half-open range `[from, to)` this scope covers; both `null` for
  /// all history.
  ({DateTime? from, DateTime? to}) get range => when(
    visibleDay: (day) =>
        (from: startOfLocalDay(day), to: startOfNextLocalDay(day)),
    week: (start) =>
        (from: startOfLocalDay(start), to: addCalendarDays(start, 7)),
    allHistory: () => (from: null, to: null),
  );

  /// Pattern-match the variant. The consumer provides a handler
  /// for each; the analyzer enforces exhaustiveness.
  T when<T>({
    required T Function(DateTime day) visibleDay,
    required T Function(DateTime start) week,
    required T Function() allHistory,
  }) {
    final self = this;
    return switch (self) {
      _VisibleDay() => visibleDay(self.day),
      _Week() => week(self.start),
      _AllHistory() => allHistory(),
    };
  }
}

final class _VisibleDay extends ExportScope {
  const _VisibleDay(this.day);
  final DateTime day;
}

final class _Week extends ExportScope {
  const _Week(this.start);
  final DateTime start;
}

final class _AllHistory extends ExportScope {
  const _AllHistory();
}
