// Runs the shared store contracts against the real native adapter and the
// in-memory implementation (the dev web store). The client's
// `FakeEncryptedStore` / `FakeCoachNoteStore` run the same suites from
// `apps/client/test/state/fake_store_contract_test.dart`.

import 'package:drift/native.dart';
import 'package:integrations/src/store/in_memory_encrypted_store.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:integrations/src/store/local_coach_note_store.dart';

import '_support/store_contract.dart';

void main() {
  encryptedStoreContract('EncryptedStoreAdapter (native sqlite3mc)', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = EncryptedStoreAdapter(database: db);
    return EncryptedStoreHarness(store, store.close);
  });
  encryptedStoreContract('InMemoryEncryptedStore', () async {
    final store = InMemoryEncryptedStore();
    return EncryptedStoreHarness(store, store.close);
  });

  coachNoteStoreContract('LocalCoachNoteStore (native)', () async {
    final db = AppDatabase(NativeDatabase.memory());
    return CoachNoteStoreHarness(LocalCoachNoteStore(database: db), db.close);
  });
  coachNoteStoreContract('InMemoryCoachNoteStore', () async {
    return CoachNoteStoreHarness(InMemoryCoachNoteStore());
  });
}
