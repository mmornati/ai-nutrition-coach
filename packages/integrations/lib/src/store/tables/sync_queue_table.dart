// The `sync_queue_table` drift table — the durable outbox rows
// (Story 4.3 / AD-6 / FR-10).
//
// Drift derives SQL `sync_queue_table` from the class name, the
// data class `SyncQueueTableData` from `@DataClassName`, and the
// companion class `SyncQueueTableCompanion` from the data class.
// These three names are what the manually-written
// `app_database.g.dart` references (per the Story 4.3 spec — the
// generated file is committed and Story 4.3 extends it by hand to
// mirror the existing tables).
//
// No DB-level FK constraints on `plateLogId` — back-refs are
// validated at the use-case layer (AD-3 carries this convention
// from Stories 1.2 / 2.3).
//
// Text columns store enum `.name` strings:
//   * `kind` matches `SyncOpKind.name` (`plateLogCreated` |
//     `plateLogUpdated` | `plateLogDeleted`).
//   * `status` matches `SyncOpStatusValue.name` (`pending` |
//     `synced` | `failed`).
//   * `enqueuedAtUtc` is a UTC ISO-8601 string (Story 1.2 / 2.3
//     carry-over).

import 'package:drift/drift.dart';

@DataClassName('SyncQueueTableData')
class SyncQueueTable extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get opId => text().unique()();
  IntColumn get plateLogId => integer()();
  TextColumn get enqueuedAtUtc => text()(); // UTC ISO-8601
  TextColumn get kind => text()(); // values match SyncOpKind.name
  TextColumn get payload => text().withDefault(const Constant('{}'))();
  TextColumn get status => text().withDefault(const Constant('pending'))();
}
