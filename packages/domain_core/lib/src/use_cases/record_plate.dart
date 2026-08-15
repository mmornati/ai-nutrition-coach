// The single sanctioned mutation path through the domain (AD-3).
//
// `RecordPlate` validates `entries.isNotEmpty` and then delegates to the
// injected `EncryptedStore`. The store commits before any UI reflects it
// — widgets never write to the store directly. The use-case is a thin
// orchestrator; the validation refusal keeps the contract honest at the
// domain boundary (a phantom row on the Day Board would be worse than a
// typed error).

import '../ports/encrypted_store.dart';
import '../results/store_failure.dart';
import '../value_types/food_entry_draft.dart';

class RecordPlate {
  const RecordPlate();

  Future<RecordPlateResult> call({
    required List<FoodEntryDraft> entries,
    required EncryptedStore store,
    DateTime? loggedAtUtc,
  }) async {
    if (entries.isEmpty) {
      return const StoreFailure(validationError: EmptyPlateFailure());
    }
    return store.recordPlate(
      entries: entries,
      loggedAtUtc: loggedAtUtc,
    );
  }
}
