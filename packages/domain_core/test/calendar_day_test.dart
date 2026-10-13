// Calendar-day arithmetic (security review F3), including DST.
//
// The pure-function cases use explicit dates and pass in any zone. The DST
// group is only meaningful in a zone with a daylight-saving transition;
// `scripts/verify.sh` re-runs this file under `TZ=Europe/Paris`, where
// 2026-03-29 has 23 hours and 2026-10-25 has 25.

import 'dart:io' show Platform;

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('calendar arithmetic', () {
    test('startOfLocalDay drops the time', () {
      expect(
        startOfLocalDay(DateTime(2026, 8, 15, 23, 59, 59)),
        DateTime(2026, 8, 15),
      );
    });

    test('startOfNextLocalDay rolls month and year', () {
      expect(startOfNextLocalDay(DateTime(2026, 8, 31, 18)), DateTime(2026, 9));
      expect(startOfNextLocalDay(DateTime(2026, 12, 31)), DateTime(2027));
      expect(startOfNextLocalDay(DateTime(2028, 2, 28)), DateTime(2028, 2, 29));
    });

    test('addCalendarDays goes both ways', () {
      expect(
        addCalendarDays(DateTime(2026, 3, 1, 9), -1),
        DateTime(2026, 2, 28),
      );
      expect(addCalendarDays(DateTime(2026, 8, 15), 7), DateTime(2026, 8, 22));
    });

    test('isSameLocalDay', () {
      expect(
        isSameLocalDay(DateTime(2026, 8, 15, 0), DateTime(2026, 8, 15, 23)),
        isTrue,
      );
      expect(
        isSameLocalDay(DateTime(2026, 8, 15, 23), DateTime(2026, 8, 16, 0)),
        isFalse,
      );
    });

    test('untilNextLocalMidnight is positive and lands on midnight', () {
      final now = DateTime(2026, 8, 15, 23, 30);
      final d = untilNextLocalMidnight(now);
      expect(d, const Duration(minutes: 30));
      expect(now.add(d), DateTime(2026, 8, 16));
      // Exactly at midnight: a full day away, never zero.
      expect(
        untilNextLocalMidnight(DateTime(2026, 8, 15)) > Duration.zero,
        isTrue,
      );
    });
  });

  group('across a DST transition', () {
    final isDstZone =
        DateTime(2026, 7, 1).timeZoneOffset !=
        DateTime(2026, 1, 1).timeZoneOffset;
    final skip = isDstZone
        ? false
        : 'local zone has no DST (run with TZ=Europe/Paris)';

    test(
      'AI_NUTRITION_COACH_REQUIRE_DST=1 means the zone MUST have DST (never a '
      'silent skip)',
      () {
        if (Platform.environment['AI_NUTRITION_COACH_REQUIRE_DST'] == '1') {
          expect(
            isDstZone,
            isTrue,
            reason:
                'test:dst must run in a daylight-saving zone (TZ is '
                '${Platform.environment['TZ']}); the DST assertions would '
                'otherwise be skipped',
          );
        }
      },
    );

    test('spring forward: the day is 23h but the next day is the 30th', () {
      final start = DateTime(2026, 3, 29);
      final next = startOfNextLocalDay(start);
      expect(next, DateTime(2026, 3, 30));
      expect(next.difference(start), const Duration(hours: 23));
      // The bug this prevents: add(Duration(days: 1)) lands at 01:00 on the 30th.
      expect(start.add(const Duration(days: 1)), isNot(next));
    }, skip: skip);

    test('fall back: the day is 25h but the next day is the 26th', () {
      final start = DateTime(2026, 10, 25);
      final next = startOfNextLocalDay(start);
      expect(next, DateTime(2026, 10, 26));
      expect(next.difference(start), const Duration(hours: 25));
      expect(start.add(const Duration(days: 1)), isNot(next));
    }, skip: skip);

    test('a plate at 23:30 on the spring-forward day stays in that day', () {
      final day = DateTime(2026, 3, 29);
      final plate = DateTime(2026, 3, 29, 23, 30);
      expect(plate.isBefore(startOfNextLocalDay(day)), isTrue);
      expect(!plate.isBefore(startOfLocalDay(day)), isTrue);
    }, skip: skip);

    test('a plate at 00:30 on the day after fall-back is not in that day', () {
      final day = DateTime(2026, 10, 25);
      final nextDay = DateTime(2026, 10, 26, 0, 30);
      expect(nextDay.isBefore(startOfNextLocalDay(day)), isFalse);
    }, skip: skip);

    test('the week export range is 7 calendar days across the change', () {
      final range = ExportScope.week(DateTime(2026, 3, 25)).range;
      expect(range.from, DateTime(2026, 3, 25));
      expect(range.to, DateTime(2026, 4, 1));
    }, skip: skip);

    test('midnight timer lands exactly on the next local midnight', () {
      final now = DateTime(2026, 3, 29, 12);
      expect(now.add(untilNextLocalMidnight(now)), DateTime(2026, 3, 30));
    }, skip: skip);
  });

  group('export scope range', () {
    test('visibleDay', () {
      final r = ExportScope.visibleDay(DateTime(2026, 8, 15, 14)).range;
      expect(r.from, DateTime(2026, 8, 15));
      expect(r.to, DateTime(2026, 8, 16));
    });

    test('allHistory is open on both ends', () {
      final r = const ExportScope.allHistory().range;
      expect(r.from, isNull);
      expect(r.to, isNull);
    });
  });
}
