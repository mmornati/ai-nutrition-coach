// The production corrupt-row sink is content-free and counts (wired in the
// io factory and the web store).

import 'package:drift/native.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/corrupt_row_log.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:test/test.dart';

import '_support/all_plates.dart';

void main() {
  test('a skipped row is counted by the production reporter', () async {
    resetCorruptRowCounter();
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = EncryptedStoreAdapter(
      database: db,
      onCorruptRow: reportCorruptRow,
    );
    await db.customStatement(
      "INSERT INTO plate_log_table (logged_at_utc) VALUES ('not-a-date')",
    );
    expect(await store.readAll(), isEmpty);
    expect(corruptRowsSkipped, 1);
  });

  test('the reporter receives only an id and a fixed reason', () {
    // (Its signature cannot carry a stored value; the adapter passes
    // 'plate: unparseable timestamp' / 'entry: invalid quantity'.)
    expect(
      () => reportCorruptRow(7, 'entry: invalid quantity'),
      returnsNormally,
    );
  });
}
