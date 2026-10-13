// The quiet export suggestion rule (web durable-storage plan).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  final now = DateTime.utc(2026, 10, 2, 12);
  DateTime daysAgo(int d) => now.subtract(Duration(days: d));

  test('never suggests when there is nothing to lose', () {
    expect(exportReminderDue(now: now, hasData: false), isFalse);
  });

  test('suggests when there is data and no export ever', () {
    expect(exportReminderDue(now: now, hasData: true), isTrue);
  });

  test('is quiet for 14 days after an export, then speaks once', () {
    expect(
      exportReminderDue(now: now, hasData: true, lastExportAt: daysAgo(14)),
      isFalse,
    );
    expect(
      exportReminderDue(now: now, hasData: true, lastExportAt: daysAgo(15)),
      isTrue,
    );
  });

  test('a dismissal quiets it for another 14 days', () {
    expect(
      exportReminderDue(
        now: now,
        hasData: true,
        lastExportAt: daysAgo(40),
        dismissedAt: daysAgo(3),
      ),
      isFalse,
    );
    expect(
      exportReminderDue(
        now: now,
        hasData: true,
        lastExportAt: daysAgo(40),
        dismissedAt: daysAgo(15),
      ),
      isTrue,
    );
    expect(
      exportReminderDue(now: now, hasData: true, dismissedAt: daysAgo(1)),
      isFalse,
    );
  });

  test('a dismissal older than the last export does not count', () {
    expect(
      exportReminderDue(
        now: now,
        hasData: true,
        lastExportAt: daysAgo(20),
        dismissedAt: daysAgo(30),
      ),
      isTrue,
    );
  });
}
