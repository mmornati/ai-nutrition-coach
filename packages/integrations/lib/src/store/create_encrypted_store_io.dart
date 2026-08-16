// IO implementation of the `createStores` factory.
//
// Compiled ONLY on io-capable targets (Android / iOS / desktop) via the
// conditional import in `create_encrypted_store.dart`. It carries the
// drift + sqlite3 + FFI dependency chain, which has no web runtime, so
// it must never be statically reachable from a web build.
//
// On web the factory resolves to `create_encrypted_store_web.dart`
// instead; Story 4.1 (sqlite3.wasm + PBKDF2) will replace that stub with a
// wasm-backed implementation behind the same `EncryptedStore` port.
//
// AD-3: both stores share the underlying `AppDatabase` so the
// coach-note writes land in the same encrypted database the plate-log
// commits use. One database, one key, one cipher pragma — no second
// source.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;

import 'app_database.dart';
import 'create_encrypted_store.dart';
import 'encrypted_store_adapter.dart';
import 'local_coach_note_store.dart';
import 'secure_key_source.dart';

Future<StoreBundle> createStores() async {
  try {
    final dir = await getApplicationDocumentsDirectory();
    final filePath = '${dir.path}/openplate_v1.sqlite';
    final key = await SecureKeySourceImpl().getOrCreateDbKey();
    // One `AppDatabase` is opened against the same file path + key
    // so the `coach_notes` table shares the cipher pragma.
    final db = AppDatabase(NativeDatabase.createInBackground(
      File(filePath),
      setup: (sqlite3.Database raw) => _attachKey(raw, key),
    ));
    return StoreBundle(
      encryptedStore: EncryptedStoreAdapter(database: db),
      coachNoteStore: LocalCoachNoteStore(database: db),
    );
  } on Exception {
    // Failure containment: any throw from `getApplicationDocumentsDirectory`,
    // secure-storage I/O, or the cipher attach hands back a typed stub so
    // the UI surfaces the calm "history can't open on this device"
    // message instead of an uncaught async error.
    return const StoreBundle(
      encryptedStore: _SecureKeyFailureStore(),
      coachNoteStore: _NoopCoachNoteStore(),
    );
  }
}

class _SecureKeyFailureStore implements EncryptedStore {
  const _SecureKeyFailureStore();

  static const RecordPlateResult _failure = StoreFailure(
    encryptedStoreError: SecureKeyFailure(),
  );

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async =>
      _failure;

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    yield const <PlateLog>[];
  }

  @override
  Future<void> close() async {}
}

/// Web stub paired with the no-op plate-log store — every
/// `append` returns a `CoachNoteAppendFailure`, every
/// `recordInteraction` returns a `CoachInteractionFailed`, and every
/// `forPlate` returns an empty list, so the UI never blocks on the
/// web fallback.
class _NoopCoachNoteStore implements CoachNoteStore {
  const _NoopCoachNoteStore();

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    return const CoachNoteAppendFailure(StoreFailure(
      platformError: UnsupportedPlatformFailure(),
    ));
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    return const CoachInteractionFailed(
      StoreFailure(platformError: UnsupportedPlatformFailure()),
    );
  }
}

Future<void> _attachKey(sqlite3.Database raw, List<int> key) async {
  if (!_hasCipher(raw)) {
    throw const _MissingCipherFailure();
  }
  final hex = StringBuffer('X\'');
  for (final b in key) {
    hex.write(b.toRadixString(16).padLeft(2, '0'));
  }
  hex.write('\'');
  raw.execute("PRAGMA key = $hex");
}

class _MissingCipherFailure implements Exception {
  const _MissingCipherFailure();
  @override
  String toString() =>
      'sqlite3mc cipher pragma is missing — the build did not pick up '
      'the sqlite3mc hook. Check pubspec.yaml `hooks.user_defines`.';
}

bool _hasCipher(sqlite3.Database raw) {
  try {
    final rows = raw.select('PRAGMA cipher');
    return rows.isNotEmpty && rows.first.values.first != null;
  } on Object {
    return false;
  }
}
