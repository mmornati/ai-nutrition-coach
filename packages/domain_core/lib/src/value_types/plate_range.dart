// In-memory range filter shared by the in-memory store, test fakes and any
// caller that already holds a plate list. The persistent stores filter in
// SQL; this is the same semantics in Dart: half-open `[from, to)` on the
// instant `loggedAtUtc`, newest first.

import '../entities/plate_log.dart';

/// The plates of [plates] logged in `[from, to)` (open-ended when a bound is
/// `null`), newest first.
List<PlateLog> platesInRange(
  Iterable<PlateLog> plates, {
  DateTime? from,
  DateTime? to,
}) {
  final out = <PlateLog>[
    for (final p in plates)
      if ((from == null || !p.loggedAtUtc.isBefore(from)) &&
          (to == null || p.loggedAtUtc.isBefore(to)))
        p,
  ];
  out.sort((a, b) => b.loggedAtUtc.compareTo(a.loggedAtUtc));
  return List<PlateLog>.unmodifiable(out);
}
