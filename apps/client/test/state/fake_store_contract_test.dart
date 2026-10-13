// Runs the shared store contracts (defined next to the real adapters in
// `packages/integrations/test/_support/store_contract.dart`) against the
// client's test fakes, so they cannot diverge from production behaviour.

import '../../../../packages/integrations/test/_support/store_contract.dart';
import '../_fakes/fake_encrypted_store.dart';

void main() {
  encryptedStoreContract('client FakeEncryptedStore', () async {
    final store = FakeEncryptedStore();
    return EncryptedStoreHarness(store, store.close);
  });
  coachNoteStoreContract('client FakeCoachNoteStore', () async {
    return CoachNoteStoreHarness(FakeCoachNoteStore());
  });
}
