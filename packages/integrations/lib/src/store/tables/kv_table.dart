// `KvTable` — a tiny key/value table inside the encrypted database (v5).
//
// It holds the small, private, per-install facts that must be encrypted at
// rest but are not plates: on the WEB the AI settings and the BYOK key (they
// used to live in memory only, or in `localStorage`, which any script on the
// origin can read), and on every platform the time of the last export. Being
// rows of the sqlite3mc database they are protected by the same key as the
// plates and are erased with them.
//
// On native the table exists too (one schema everywhere), but the mobile app
// keeps the BYOK key and AI settings in the OS keystore (`flutter_secure_
// storage`); only `export.lastAtUtc` is stored here on both.

import 'package:drift/drift.dart';

@DataClassName('KvTableData')
class KvTable extends Table {
  /// A dotted, namespaced key, e.g. `ai.byokKey`, `export.lastAtUtc`.
  TextColumn get key => text()();

  /// The value as text (JSON for structured values).
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}
