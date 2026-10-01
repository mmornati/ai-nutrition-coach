// Quota counter for the hosted-quota rung (Story 3.2 / FR6).
//
// `QuotaCounter` is a day-keyed counter that tracks how many calls
// the hosted-quota rung has made against the configured free
// provider today. The counter resets at UTC midnight in the local
// timezone. The counter persists via `flutter_secure_storage` on
// mobile (Keychain/Keystore); on web it is memory-only (the web app uses
// `InMemoryQuotaCounter`; `SecureStorageQuotaCounter` refuses to be built
// there — S4 — documented in `docs/ai-tiers.md`).
//
// This counter is a courtesy to the user, NOT enforcement: anyone can clear
// local storage. A hosted tier's real quota has to be enforced by the
// server-side relay that holds the provider token (S5, `docs/ai-tiers.md`).
//
// Concurrency / robustness (N9): every read-modify-write is serialised by
// an `AsyncMutex`, so two overlapping `recordCall`s count two; a corrupt or
// hand-edited stored value is treated as "no calls yet today" instead of
// crashing on a `!` cast.
//
// The counter is keyed by `(providerKind, localDay)` — never by
// user identity, device fingerprint, or any biometric surface
// (FR13). The counter is never part of the domain core; the
// `AiRung` port is unaware of it.
//
// FR12 / NFR4: the counter never emits telemetry; the call
// records are never logged with user-identifying material.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../store/secure_storage_options.dart';
import '../util/async_mutex.dart';

/// The platform-appropriate counter: secure storage on mobile / desktop,
/// memory on web.
QuotaCounter createQuotaCounter({required int ceiling}) => kIsWeb
    ? InMemoryQuotaCounter(ceiling: ceiling)
    : SecureStorageQuotaCounter(ceiling: ceiling);

/// The day-keyed quota counter for the hosted-quota rung (FR6).
abstract interface class QuotaCounter {
  /// The number of calls made today against the configured free
  /// provider. `0` on a fresh day or after a reset.
  Future<int> callsToday();

  /// Record one call ATTEMPT against the configured free provider (N9: the
  /// rung records before it calls, so a failed or empty attempt still
  /// counts — otherwise a flaky provider would be retried without bound).
  /// Increments the counter by exactly one.
  Future<void> recordCall();

  /// Atomically: if the per-day ceiling has not been reached, take one
  /// slot (count this call attempt) and return `true`; otherwise change
  /// nothing and return `false`. The check and the increment are one step
  /// under the counter's mutex, so two overlapping callers cannot both take
  /// the last slot. This is what the rung uses; `isExhausted` + `recordCall`
  /// remain for display and tests. May throw if the backing store fails.
  Future<bool> tryConsume();

  /// The next reset timestamp (UTC midnight in the local
  /// timezone) — the moment the counter rolls over to zero.
  /// `null` if the counter doesn't track a reset window.
  Future<DateTime?> resetAt();

  /// True if the counter has reached its configured per-day
  /// ceiling. Convenience over `callsToday() >= ceiling`.
  Future<bool> isExhausted();
}

/// In-memory implementation for tests — no `flutter_secure_storage`
/// I/O, deterministic counter.
class InMemoryQuotaCounter implements QuotaCounter {
  InMemoryQuotaCounter({required this.ceiling, DateTime Function()? now})
    : _now = now ?? DateTime.now;

  /// The per-day ceiling (FR6). The Story 3.2 v1 default ships
  /// `kHostedQuotaPerDay = 50` from `hosted_quota_ai_rung.dart`.
  final int ceiling;

  final DateTime Function() _now;
  final AsyncMutex _lock = AsyncMutex();
  int _calls = 0;
  late DateTime _dayKey = _dayKeyOf(_now());

  static DateTime _dayKeyOf(DateTime t) {
    final local = t.toLocal();
    return DateTime(local.year, local.month, local.day);
  }

  DateTime _ensureFreshDay() {
    final today = _dayKeyOf(_now());
    if (today != _dayKey) {
      _dayKey = today;
      _calls = 0;
    }
    return today;
  }

  @override
  Future<int> callsToday() async {
    _ensureFreshDay();
    return _calls;
  }

  @override
  Future<void> recordCall() => _lock.synchronized(() async {
    _ensureFreshDay();
    _calls++;
  });

  @override
  Future<bool> tryConsume() => _lock.synchronized(() async {
    _ensureFreshDay();
    if (_calls >= ceiling) return false;
    _calls++;
    return true;
  });

  @override
  Future<DateTime?> resetAt() async {
    final today = _ensureFreshDay();
    // Calendar arithmetic, not `+ 24h`: a DST day is 23 or 25 hours long.
    return DateTime(today.year, today.month, today.day + 1);
  }

  @override
  Future<bool> isExhausted() async {
    _ensureFreshDay();
    return _calls >= ceiling;
  }
}

/// Production implementation backed by `flutter_secure_storage`
/// (Keychain on iOS / macOS, EncryptedSharedPreferences on Android).
/// On web, `flutter_secure_storage` falls back to session-only
/// storage (AD-8 honest-difference story — the quota counter is
/// per-session on web, documented in `docs/ai-tiers.md`).
class SecureStorageQuotaCounter implements QuotaCounter {
  SecureStorageQuotaCounter({
    required this.ceiling,
    FlutterSecureStorage? storage,
    DateTime Function()? now,
  }) : _storage = storage ?? _requireNativeStorage(),
       _now = now ?? DateTime.now;

  static FlutterSecureStorage _requireNativeStorage() {
    if (kIsWeb) {
      throw UnsupportedError(
        'The quota counter must not use flutter_secure_storage on web '
        '(localStorage). Use InMemoryQuotaCounter / createQuotaCounter().',
      );
    }
    return openPlateSecureStorage;
  }

  final AsyncMutex _lock = AsyncMutex();

  /// The per-day ceiling (FR6).
  final int ceiling;

  final FlutterSecureStorage _storage;
  final DateTime Function() _now;

  /// The secure-storage alias. The provider kind is part of the
  /// alias so a future v2 multi-provider world can ship a
  /// separate counter per provider without collision.
  static String _alias(String providerKind) => providerKind == 'hostedQuota'
      ? SecureStorageAliases.quotaHostedQuota
      : 'openplate_quota_${providerKind}_v1';

  /// Counter value encoded as a JSON envelope: `{"day":"YYYY-MM-DD","calls":N}`.
  static String _encode(DateTime dayKey, int calls) => jsonEncode(
    <String, Object?>{'day': _dayKeyString(dayKey), 'calls': calls},
  );

  /// `null` for anything that is not a valid `YYYY-MM-DD`.
  static DateTime? _decodeDayKey(Object? s) {
    if (s is! String) return null;
    final parts = s.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y == null || m == null || d == null) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return DateTime(y, m, d);
  }

  static String _dayKeyString(DateTime t) {
    final local = t.toLocal();
    return '${local.year.toString().padLeft(4, '0')}-'
        '${local.month.toString().padLeft(2, '0')}-'
        '${local.day.toString().padLeft(2, '0')}';
  }

  DateTime _today() {
    final local = _now().toLocal();
    return DateTime(local.year, local.month, local.day);
  }

  /// Reads the stored counter. Missing, unreadable, corrupt or
  /// wrong-typed storage is "no calls yet today" (N9) — never a crash.
  Future<({DateTime day, int calls})> _read(String providerKind) async {
    final fresh = (day: _today(), calls: 0);
    final String? raw;
    try {
      raw = await secureReadMigrating(_storage, _alias(providerKind));
    } on Object {
      return fresh;
    }
    if (raw == null || raw.isEmpty) return fresh;
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return fresh;
    }
    if (decoded is! Map) return fresh;
    final day = _decodeDayKey(decoded['day']);
    final calls = decoded['calls'];
    if (day == null || calls is! int || calls < 0) return fresh;
    return (day: day, calls: calls);
  }

  Future<void> _write(String providerKind, DateTime dayKey, int calls) async {
    await _storage.write(
      key: _alias(providerKind),
      value: _encode(dayKey, calls),
    );
  }

  @override
  Future<int> callsToday() => _lock.synchronized(() async {
    const providerKind = 'hostedQuota';
    final current = await _read(providerKind);
    final today = _today();
    if (current.day != today) {
      await _write(providerKind, today, 0);
      return 0;
    }
    return current.calls;
  });

  @override
  Future<void> recordCall() => _lock.synchronized(() async {
    const providerKind = 'hostedQuota';
    final current = await _read(providerKind);
    final today = _today();
    final calls = current.day == today ? current.calls : 0;
    await _write(providerKind, today, calls + 1);
  });

  @override
  Future<bool> tryConsume() => _lock.synchronized(() async {
    const providerKind = 'hostedQuota';
    final current = await _read(providerKind);
    final today = _today();
    final calls = current.day == today ? current.calls : 0;
    if (calls >= ceiling) return false;
    await _write(providerKind, today, calls + 1);
    return true;
  });

  @override
  Future<DateTime?> resetAt() async {
    final today = _today();
    return DateTime(today.year, today.month, today.day + 1);
  }

  @override
  Future<bool> isExhausted() async {
    final calls = await callsToday();
    return calls >= ceiling;
  }
}
