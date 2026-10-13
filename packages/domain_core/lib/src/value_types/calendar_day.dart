// Calendar-day arithmetic for local days (security review F3).
//
// A local calendar day is not always 24 hours: across a daylight-saving
// transition it is 23 or 25. `start.add(Duration(days: 1))` therefore lands
// at 01:00 the next day (or 23:00 the same day) in those zones. Every
// "next day" / "N days later" boundary in the app goes through these
// functions, which use the `DateTime(y, m, d + n)` constructor — the
// platform normalises the overflowing day-of-month on the CALENDAR, and
// resolves the wall-clock time in the local zone.
//
// Pure functions of their arguments (no clock, no I/O) so they can be
// tested with explicit dates; the client reads "now" from `clockProvider`.

/// 00:00 local of the calendar day containing [moment].
DateTime startOfLocalDay(DateTime moment) =>
    DateTime(moment.year, moment.month, moment.day);

/// 00:00 local of the day [days] calendar days after the day containing
/// [moment] (negative [days] goes back). Never `add(Duration(days: n))`.
DateTime addCalendarDays(DateTime moment, int days) =>
    DateTime(moment.year, moment.month, moment.day + days);

/// 00:00 local of the day after the day containing [moment] — the exclusive
/// end of that day.
DateTime startOfNextLocalDay(DateTime moment) => addCalendarDays(moment, 1);

/// `true` when [a] and [b] fall on the same local calendar day.
bool isSameLocalDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// How long until the next local midnight after [now] (always > 0).
Duration untilNextLocalMidnight(DateTime now) =>
    startOfNextLocalDay(now).difference(now);
