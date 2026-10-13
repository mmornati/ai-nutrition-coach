// The single sanctioned mutation path through the domain (AD-3).
//
// `RecordPlate` validates the draft (`entries.isNotEmpty`, every quantity a
// finite non-negative `low <= high` range), delegates the commit to the
// injected `EncryptedStore`, and then — after the store commit succeeds —
// runs two best-effort post-commit steps:
//
//   * the post-resolve `CoachNoteGenerator` (FR4 / AD-3), and
//   * the enqueue into the sync outbox (AD-6 / FR-10; story 4.3).
//
// Both steps are guarded (security review F7): the plate is already
// committed, so a step that fails or THROWS AN EXCEPTION must never turn the
// result into a failure — the user would retry and log the meal twice.
// Instead the result is `RecordPlateSuccess` carrying a typed
// `PostCommitWarning` per step that did not complete (also handed to the
// injected `onWarning` sink). Only `Exception`s are absorbed: an `Error` is a
// programming bug and propagates instead of being hidden. The UI treats the log
// as done; the warnings are for diagnostics and tests.
//
// AD-3: the generator + the queue are injected via the constructor, so
// tests can substitute fakes without touching the entry surfaces
// (manual / barcode / photo).

import '../ports/encrypted_store.dart';
import '../results/coach_note_failure.dart';
import '../results/store_failure.dart';
import '../results/sync_failure.dart';
import '../use_cases/generate_coach_note.dart';
import '../use_cases/record_sync_op.dart';
import '../util/uuid_v4.dart';
import '../value_types/food_entry_draft.dart';

class RecordPlate {
  RecordPlate({
    required CoachNoteGenerator generator,
    RecordSyncOp? syncOpEnqueue,
    String Function()? opIdGenerator,
    void Function(PostCommitWarning warning)? onWarning,
  }) : _generator = generator,
       _syncOpEnqueue = syncOpEnqueue,
       _opId = opIdGenerator ?? generateUuidV4,
       _onWarning = onWarning;

  final CoachNoteGenerator _generator;
  final RecordSyncOp? _syncOpEnqueue;
  final String Function() _opId;

  /// Told about every post-commit warning (the app passes a debug log). Pure
  /// Dart: the core has no logger of its own, so the sink is injected.
  final void Function(PostCommitWarning warning)? _onWarning;

  /// Commit the plate through the encrypted store, then run the guarded
  /// post-commit steps. A committed plate is always reported as
  /// `RecordPlateSuccess`, possibly with `warnings`.
  Future<RecordPlateResult> call({
    required List<FoodEntryDraft> entries,
    required EncryptedStore store,
    DateTime? loggedAtUtc,
  }) async {
    if (entries.isEmpty) {
      return const StoreFailure(validationError: EmptyPlateFailure());
    }
    if (entries.any((e) => !e.quantity.isValid)) {
      return const StoreFailure(validationError: InvalidQuantityFailure());
    }
    final result = await store.recordPlate(
      entries: entries,
      loggedAtUtc: loggedAtUtc,
    );
    if (result is! RecordPlateSuccess) return result;

    final warnings = <PostCommitWarning>[];
    final plate = result.plateLog;

    // Coach note: the generator collapses its own failures to a typed
    // `NoCoachNoteGenerated`; only an append failure is worth a warning
    // (the other reasons are "nothing to say", which is normal).
    try {
      final generated = await _generator.generateFor(plate);
      if (generated is NoCoachNoteGenerated &&
          generated.reason == 'appendFailed') {
        warnings.add(const PostCommitWarning(PostCommitStep.coachNote));
      }
    } on Exception {
      warnings.add(const PostCommitWarning(PostCommitStep.coachNote));
    }

    final enqueue = _syncOpEnqueue;
    if (enqueue != null) {
      try {
        final enqueued = await enqueue(
          SyncOp(
            opId: _opId(),
            plateLogId: plate.id,
            enqueuedAtUtc: plate.loggedAtUtc,
            kind: SyncOpKind.plateLogCreated,
          ),
        );
        if (enqueued is EnqueueFailed) {
          warnings.add(const PostCommitWarning(PostCommitStep.syncEnqueue));
        }
      } on Exception {
        warnings.add(const PostCommitWarning(PostCommitStep.syncEnqueue));
      }
    }

    for (final warning in warnings) {
      try {
        _onWarning?.call(warning);
      } on Exception {
        // A broken log sink must not undo a committed plate.
      }
    }
    if (warnings.isEmpty) return result;
    return RecordPlateSuccess(plate, warnings: List.unmodifiable(warnings));
  }
}
