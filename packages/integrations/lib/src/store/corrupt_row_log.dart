// The production sink for rows the store skipped because they could not be
// mapped (a bad timestamp, an invalid quantity). Content-free by design: only
// the table-local row id and a short fixed reason ever reach it — never a
// stored value — so it is safe to print in a debug build and to count.
//
// Without a sink a corrupt row just vanishes from the Day Board with no trace
// (security review: wire `onCorruptRow` in production).

import 'package:flutter/foundation.dart';

/// How many corrupt rows have been skipped since the process started.
int get corruptRowsSkipped => _skipped;
int _skipped = 0;

/// The `CorruptRowReporter` the production adapters use.
void reportCorruptRow(int rowId, String reason) {
  _skipped++;
  if (kDebugMode) {
    debugPrint('openplate: skipped unreadable row #$rowId ($reason)');
  }
}

/// Reset the counter (tests).
@visibleForTesting
void resetCorruptRowCounter() => _skipped = 0;
