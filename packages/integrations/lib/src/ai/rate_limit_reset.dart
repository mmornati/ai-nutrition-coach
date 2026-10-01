// Parsing of "when does my rate limit reset" headers (N8).
//
// Providers disagree on the shape of `x-ratelimit-reset` / `retry-after`:
//
//   * a delta in seconds           `30`, `1.5`
//   * a unix timestamp in seconds  `1767225600`
//   * a unix timestamp in ms       `1767225600000`
//   * a duration string            `6m0s`, `1.5s`, `20ms`, `1h2m3s`
//
// Numbers are told apart by magnitude: >= 1e11 is epoch milliseconds,
// >= 1e9 is epoch seconds (that is September 2001), anything smaller is a
// delta in seconds. Anything unparsable (including HTTP-date, which would
// need `dart:io`) is `null`, and the caller renders the calm
// "resets tomorrow" copy.
//
// The value comes from a server we do not control, so it is clamped: a reset
// more than seven days away (or so large it would overflow `DateTime` /
// `Duration`) is treated as unknown (`null`), never as an exception.

/// The farthest-away reset we believe.
const Duration kMaxRateLimitReset = Duration(days: 7);

final RegExp _durationPart = RegExp(r'(\d+(?:\.\d+)?)(ms|h|m|s|d)');

/// The instant the limit resets, or `null` when [raw] is absent / unusable.
/// [now] is injectable for tests.
DateTime? parseRateLimitReset(String? raw, {DateTime? now}) {
  final text = raw?.trim().toLowerCase();
  if (text == null || text.isEmpty) return null;
  final clock = (now ?? DateTime.now()).toUtc();

  final number = double.tryParse(text);
  if (number != null) {
    if (!number.isFinite || number < 0) return null;
    final DateTime? at;
    if (number >= 1e11) {
      // Epoch milliseconds. DateTime's range is about +/-8.64e15 ms.
      at = number > 8e15
          ? null
          : DateTime.fromMillisecondsSinceEpoch(number.round(), isUtc: true);
    } else if (number >= 1e9) {
      at = DateTime.fromMillisecondsSinceEpoch(
        (number * 1000).round(),
        isUtc: true,
      );
    } else {
      at = number > kMaxRateLimitReset.inSeconds
          ? null
          : clock.add(Duration(milliseconds: (number * 1000).round()));
    }
    return _withinLimit(at, clock);
  }

  final duration = parseDurationString(text);
  return duration == null ? null : _withinLimit(clock.add(duration), clock);
}

DateTime? _withinLimit(DateTime? at, DateTime clock) =>
    at == null || at.isAfter(clock.add(kMaxRateLimitReset)) ? null : at;

/// `6m0s` -> 6 minutes; `1.5s`; `20ms`; `1h2m3s`. `null` unless the WHOLE
/// string is made of `<number><unit>` parts.
Duration? parseDurationString(String text) {
  var consumed = 0;
  var micros = 0.0;
  for (final m in _durationPart.allMatches(text)) {
    if (m.start != consumed) return null;
    consumed = m.end;
    final value = double.parse(m.group(1)!);
    micros +=
        value *
        switch (m.group(2)!) {
          'ms' => 1000.0,
          's' => 1e6,
          'm' => 60e6,
          'h' => 3600e6,
          _ => 86400e6, // d
        };
  }
  if (consumed == 0 || consumed != text.length) return null;
  // Anything past the clamp (or non-finite) is unusable; refusing here also
  // keeps `Duration` / `DateTime.add` from overflowing.
  if (!micros.isFinite || micros > kMaxRateLimitReset.inMicroseconds) {
    return null;
  }
  return Duration(microseconds: micros.round());
}
