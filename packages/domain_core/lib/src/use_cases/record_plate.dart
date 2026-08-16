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
// Story 4.3 adds the second post-commit side effect: enqueue the
// plate into the durable sync outbox (AD-6 / FR-10). The enqueue is
// best-effort just like the coach path — the plate is already
// committed, so any failure on the queue path collapses to a typed
// no-op and the UI never blocks on it. The local commit lands
// first; the enqueue is a separate write (AD-3 invariant: one
// store, no second source, no second mutation path).
//
// The use-case is a thin orchestrator; the validation refusal keeps
// the contract honest at the domain boundary (a phantom row on the
// Day Board would be worse than a typed error).
//
// AD-3: the generator + the queue are injected via the constructor
// — the `RecordPlate` use-case owns the convergent mutation path,
// but the actual coach + coach-note-store + sync-queue seams are
// wired through the orchestrator so tests can substitute fakes
// without touching the entry surfaces (manual / barcode / photo).

import '../entities/sync_op.dart';
import '../ports/encrypted_store.dart';
import '../results/store_failure.dart';
import '../use_cases/generate_coach_note.dart';
import '../use_cases/record_sync_op.dart';
import '../value_types/food_entry_draft.dart';

class RecordPlate {
  const RecordPlate({
    required CoachNoteGenerator generator,
    RecordSyncOp? syncOpEnqueue,
  })  : _generator = generator,
        _syncOpEnqueue = syncOpEnqueue;

  final CoachNoteGenerator _generator;
  final RecordSyncOp? _syncOpEnqueue;

  /// Commit the plate through the encrypted store and fire the
  /// post-resolve coach generator + the sync-queue enqueue. Both
  /// side effects are best-effort (never block the log); their
  /// return values are intentionally ignored at this seam — the
  /// next render cycle reads the persisted `CoachNote` via
  /// `CoachNoteStore.forPlate` and the chip surface reads the
  /// `SyncQueue` watch stream.
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
      // AD-3 + AD-6: the sync-queue enqueue is best-effort. The
      // queue is a separate write against the same drift store
      // (Story 4.3 ships an in-memory adapter; the durable
      // drift-table-backed implementation is the 4.3.1 follow-up).
      // A failure on the queue path never blocks the log.
      final enqueue = _syncOpEnqueue;
      if (enqueue != null) {
        final op = SyncOp(
          opId: _opIdFor(result.plateLog.id),
          plateLogId: result.plateLog.id,
          enqueuedAtUtc: result.plateLog.loggedAtUtc,
          kind: SyncOpKind.plateLogCreated,
        );
        await enqueue(op);
      }
    }
    return result;
  }

  /// A stable `opId` derived from the plate id. The drift `opId`
  /// column has a unique index so a retry produces a typed
  /// `AlreadyEnqueued` no-op (FR-10 / NFR5: no duplicates). For v1
  /// the in-memory adapter keys on `opId` exactly the same way; a
  /// future relay can include the relay's idempotency token in the
  /// id without changing this shape.
  String _opIdFor(int plateLogId) => 'plate-$plateLogId';
}
