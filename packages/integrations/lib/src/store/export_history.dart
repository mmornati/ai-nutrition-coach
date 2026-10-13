// When did the user last export? (web durable-storage plan, task 3)
//
// The last export time lives in the encrypted store (`kv_table`), so it is
// private, survives restarts, and is erased with everything else. It is only
// ever a date: no history of exports, no counters, no streak (NDP standard).

import 'key_value_store.dart';

class ExportHistory {
  const ExportHistory(this._store);

  final LocalKeyValueStore _store;

  /// The time of the last successful export, or `null` (never, locked, or
  /// unreadable).
  Future<DateTime?> lastExportAt() async {
    try {
      final raw = await _store.read(KvKeys.exportLastAtUtc);
      if (raw == null) return null;
      return DateTime.tryParse(raw)?.toUtc();
    } on Object {
      return null;
    }
  }

  /// Record an export at [at]. Best effort: a failure to remember the date
  /// must never turn a successful export into an error.
  Future<void> record(DateTime at) async {
    try {
      await _store.write(KvKeys.exportLastAtUtc, at.toUtc().toIso8601String());
    } on Object {
      // The file was written; only the reminder date is lost.
    }
  }

  /// When the user last dismissed the export suggestion, or `null`.
  Future<DateTime?> reminderDismissedAt() async {
    try {
      final raw = await _store.read(KvKeys.exportReminderDismissedAtUtc);
      if (raw == null) return null;
      return DateTime.tryParse(raw)?.toUtc();
    } on Object {
      return null;
    }
  }

  /// Remember that the user said "not now" (best effort).
  Future<void> recordReminderDismissed(DateTime at) async {
    try {
      await _store.write(
        KvKeys.exportReminderDismissedAtUtc,
        at.toUtc().toIso8601String(),
      );
    } on Object {
      // Worst case the line shows again in this session.
    }
  }
}
