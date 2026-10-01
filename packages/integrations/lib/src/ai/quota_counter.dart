// Quota counter for the hosted-quota rung (Story 3.2 / FR6).
//
// `QuotaCounter` is a day-keyed counter that tracks how many calls
// the hosted-quota rung has made against the configured free
// provider today. The counter resets at UTC midnight in the local
// timezone. The counter persists via `flutter_secure_storage` on
// mobile (Keychain/Keystore); on web the counter is session-only
// (AD-8 honest-difference story, documented in `docs/ai-tiers.md`).
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

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../store/secure_storage_options.dart';

/// The day-keyed quota counter for the hosted-quota rung (FR6).
abstract interface class QuotaCounter {
  /// The number of calls made today against the configured free
  /// provider. `0` on a fresh day or after a reset.
  Future<int> callsToday();

  /// Record one call against the configured free provider.
  /// Increments the counter by exactly one. No-op on quota
  /// exhaustion (callers should check `callsToday()` first or
  /// treat the resulting `QuotaExhausted` return as the source
  /// of truth).
  Future<void> recordCall();

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
  Future<void> recordCall() async {
    _ensureFreshDay();
    _calls++;
  }

  @override
  Future<DateTime?> resetAt() async {
    final today = _ensureFreshDay();
    final next = today.add(const Duration(days: 1));
    return next;
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
  }) : _storage = storage ?? openPlateSecureStorage,
       _now = now ?? DateTime.now;

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

  static DateTime _decodeDayKey(String s) {
    final parts = s.split('-');
    return DateTime(
      int.parse(parts[0]),
      int.parse(parts[1]),
      int.parse(parts[2]),
    );
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

  Future<({DateTime day, int calls})> _read(String providerKind) async {
    final raw = await secureReadMigrating(_storage, _alias(providerKind));
    if (raw == null || raw.isEmpty) {
      return (day: _today(), calls: 0);
    }
    final decoded = jsonDecode(raw) as Map<String, Object?>;
    return (
      day: _decodeDayKey(decoded['day']! as String),
      calls: decoded['calls']! as int,
    );
  }

  Future<void> _write(String providerKind, DateTime dayKey, int calls) async {
    await _storage.write(
      key: _alias(providerKind),
      value: _encode(dayKey, calls),
    );
  }

  @override
  Future<int> callsToday() async {
    final providerKind = 'hostedQuota';
    final current = await _read(providerKind);
    final today = _today();
    if (current.day != today) {
      await _write(providerKind, today, 0);
      return 0;
    }
    return current.calls;
  }

  @override
  Future<void> recordCall() async {
    final providerKind = 'hostedQuota';
    final current = await _read(providerKind);
    final today = _today();
    if (current.day != today) {
      await _write(providerKind, today, 1);
      return;
    }
    await _write(providerKind, today, current.calls + 1);
  }

  @override
  Future<DateTime?> resetAt() async {
    final today = _today();
    return today.add(const Duration(days: 1));
  }

  @override
  Future<bool> isExhausted() async {
    final calls = await callsToday();
    return calls >= ceiling;
  }
}
