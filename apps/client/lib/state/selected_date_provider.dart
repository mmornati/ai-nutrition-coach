// The user's selected local date on the Day Board (Story 1.4 / UX-DR8).
//
// `null` means "today" — the Day Board falls back to the
// `dayBoardProvider` derived view when this is null, and to
// `dayBoardForDateProvider(selected)` once the user taps a week-strip
// dot. The provider holds local-midnight `DateTime`s; the strip
// normalizes on tap so the value is always `00:00 local` of the
// selected day.
//
// The provider is intentionally tiny — the calendar / wheel picker is
// out of v1 scope. Strip is the only navigation affordance in this
// epic.
//
// Note: `StateProvider` lives in the riverpod 3.x `legacy.dart` export;
// the main `flutter_riverpod.dart` no longer surfaces it. The legacy
// shim is fine here — the selected date is a tiny ephemeral UI hint, not
// domain state, and rewriting it as a `NotifierProvider` for v1 would
// add ceremony without buying anything. Epic 2's coach-note flow will
// lean on `NotifierProvider` for actual domain state.

import 'package:flutter_riverpod/legacy.dart';

/// Holds the user's currently-selected local date on the Day Board.
/// `null` (the initial state) means "today"; a non-null value means
/// the user has tapped a week-strip dot and the Day Board should
/// re-render that day's plates (or its three open dents).
final selectedDateProvider = StateProvider<DateTime?>((_) => null);
