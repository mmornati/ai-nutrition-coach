// Web coach-note store (Phase 2B / L5): the same encrypted database as the
// plate log (AD-3 -- one store, no second source). Every call resolves the
// controller's CURRENT open database, so a lock followed by an unlock never
// writes to a stale, closed handle. While locked: `append` /
// `recordInteraction` return typed failures carrying `WebSessionKeyFailure`
// and `forPlate` is empty (the whisper is simply not shown).

import 'package:domain_core/domain_core.dart';

import 'local_coach_note_store.dart';
import 'web_store_controller.dart';

class WasmCoachNoteStore implements CoachNoteStore {
  const WasmCoachNoteStore({required WebDatabaseSource source})
    : _source = source;

  final WebDatabaseSource _source;

  static const StoreFailure _locked = StoreFailure(
    encryptedStoreError: WebSessionKeyFailure(),
  );

  LocalCoachNoteStore? _delegate() {
    final db = _source.database;
    return db == null ? null : LocalCoachNoteStore(database: db);
  }

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final delegate = _delegate();
    if (delegate == null) return const CoachNoteAppendFailure(_locked);
    return delegate.append(note);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    final delegate = _delegate();
    if (delegate == null) return const [];
    return delegate.forPlate(plateLogId);
  }

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) {
    final delegate = _delegate();
    if (delegate == null) return Stream<List<CoachNote>>.value(const []);
    return delegate.watchForPlate(plateLogId);
  }

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async {
    final delegate = _delegate();
    if (delegate == null) return const CoachInteractionFailed(_locked);
    return delegate.recordDismissal(key);
  }

  @override
  Stream<Set<String>> watchDismissals() {
    final delegate = _delegate();
    if (delegate == null) return Stream<Set<String>>.value(const <String>{});
    return delegate.watchDismissals();
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    final delegate = _delegate();
    if (delegate == null) return const CoachInteractionFailed(_locked);
    return delegate.recordInteraction(log);
  }
}
