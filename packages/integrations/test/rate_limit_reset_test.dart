// N8 — rate-limit reset parsing: seconds vs ms vs epoch, duration strings.

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  final now = DateTime.utc(2026, 8, 16, 12);

  group('parseRateLimitReset', () {
    test('absent / blank / garbage -> null', () {
      expect(parseRateLimitReset(null, now: now), isNull);
      expect(parseRateLimitReset('', now: now), isNull);
      expect(parseRateLimitReset('   ', now: now), isNull);
      expect(parseRateLimitReset('soon', now: now), isNull);
      expect(parseRateLimitReset('6x', now: now), isNull);
      expect(parseRateLimitReset('-5', now: now), isNull);
      expect(parseRateLimitReset('NaN', now: now), isNull);
      expect(parseRateLimitReset('Infinity', now: now), isNull);
    });

    test('small numbers are a delta in SECONDS', () {
      expect(
        parseRateLimitReset('30', now: now),
        now.add(const Duration(seconds: 30)),
      );
      expect(
        parseRateLimitReset('1.5', now: now),
        now.add(const Duration(milliseconds: 1500)),
      );
      expect(parseRateLimitReset('0', now: now), now);
    });

    test('~1e9..1e11 is an epoch in SECONDS', () {
      final t = DateTime.utc(2026, 8, 16, 13);
      final secs = t.millisecondsSinceEpoch ~/ 1000;
      expect(parseRateLimitReset('$secs', now: now), t);
    });

    test('>= 1e11 is an epoch in MILLISECONDS', () {
      final t = DateTime.utc(2026, 8, 16, 13);
      expect(parseRateLimitReset('${t.millisecondsSinceEpoch}', now: now), t);
    });

    test('duration strings', () {
      expect(
        parseRateLimitReset('6m0s', now: now),
        now.add(const Duration(minutes: 6)),
      );
      expect(
        parseRateLimitReset('1.5s', now: now),
        now.add(const Duration(milliseconds: 1500)),
      );
      expect(
        parseRateLimitReset('20ms', now: now),
        now.add(const Duration(milliseconds: 20)),
      );
      expect(
        parseRateLimitReset('1h2m3s', now: now),
        now.add(const Duration(hours: 1, minutes: 2, seconds: 3)),
      );
      expect(
        parseRateLimitReset('2d', now: now),
        now.add(const Duration(days: 2)),
      );
      expect(
        parseRateLimitReset(' 6M0S ', now: now),
        now.add(const Duration(minutes: 6)),
        reason: 'case-insensitive, trimmed',
      );
    });

    test('a duration with junk around it is rejected', () {
      expect(parseRateLimitReset('about 6m', now: now), isNull);
      expect(parseRateLimitReset('6m later', now: now), isNull);
      expect(parseRateLimitReset('m6', now: now), isNull);
    });

    test(
      'clamped: beyond now+7 days, or huge, is null — never a RangeError',
      () {
        for (final raw in [
          '1e18',
          '1e300',
          '1e15',
          '9e15',
          '99999999999999h',
          '99999999999999999999d',
          '700000', // > 7 days in seconds
          '8d',
          '1e11', // epoch ms in 1973: in the past is fine, not null
        ]) {
          expect(
            () => parseRateLimitReset(raw, now: now),
            returnsNormally,
            reason: raw,
          );
        }
        for (final raw in [
          '1e18',
          '1e300',
          '1e15',
          '9e15',
          '99999999999999h',
          '99999999999999999999d',
          '700000',
          '8d',
        ]) {
          expect(parseRateLimitReset(raw, now: now), isNull, reason: raw);
        }
        expect(
          parseRateLimitReset('7d', now: now),
          now.add(const Duration(days: 7)),
          reason: 'exactly at the limit is kept',
        );
        // A far-future epoch (year 2100) is beyond the limit too.
        expect(parseRateLimitReset('4102444800', now: now), isNull);
      },
    );
  });
}
