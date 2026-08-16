// The single sanctioned mutation path through the domain (AD-3).
//
// `RecordPlate` validates `entries.isNotEmpty`, delegates the commit to
// the injected `EncryptedStore`, and then — after the store commit
// succeeds — fires the post-resolve `CoachNoteGenerator` (FR4 / AD-3).
// The whisper is best-effort: the plate is already committed before
// the generator runs, so any failure on the coach path collapses to
// `NoCoachNoteGenerated` and the UI hides the whisper. The log is
// never blocked by the coach path.
//
// The use-case is a thin orchestrator; the validation refusal keeps
// the contract honest at the domain boundary (a phantom row on the
// Day Board would be worse than a typed error).
//
// AD-3: the generator is injected via the constructor — the
// `RecordPlate` use-case owns the convergent mutation path, but the
// actual coach + coach-note-store seams are wired through the
// generator so tests can substitute fakes without touching the
// entry surfaces (manual / barcode / photo).

import '../ports/encrypted_store.dart';
import '../results/store_failure.dart';
import '../use_cases/generate_coach_note.dart';
import '../value_types/food_entry_draft.dart';

class RecordPlate {
  const RecordPlate({required CoachNoteGenerator generator})
      : _generator = generator;

  final CoachNoteGenerator _generator;

  /// Commit the plate through the encrypted store and fire the
  /// post-resolve coach generator. The generator is best-effort
  /// (never blocks the log); its return value is intentionally
  /// ignored at this seam — the next render cycle reads the
  /// persisted `CoachNote` via `CoachNoteStore.forPlate`.
  Future<RecordPlateResult> call({
    required List<FoodEntryDraft> entries,
    required EncryptedStore store,
    DateTime? loggedAtUtc,
  }) async {
    if (entries.isEmpty) {
      return const StoreFailure(validationError: EmptyPlateFailure());
    }
    final result = await store.recordPlate(
      entries: entries,
      loggedAtUtc: loggedAtUtc,
    );
    if (result is RecordPlateSuccess) {
      // AD-3: the coach note is best-effort. We never rethrow — the
      // generator already collapses every failure to a typed
      // `NoCoachNoteGenerated` so this call site cannot throw.
      await _generator.generateFor(result.plateLog);
    }
    return result;
  }
}
