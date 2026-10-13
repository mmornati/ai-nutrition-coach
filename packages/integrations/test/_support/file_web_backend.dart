// VM stand-in for the browser's IndexedDB backend: a REAL sqlite3mc database
// in a temp file, keyed through the production `attachWebKey`. "Reloading"
// the page = building a new controller over the same file + storage.

import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';

class FileWebBackend implements WebDatabaseBackend {
  FileWebBackend(this.file);

  final File file;
  int eraseCalls = 0;
  int openCalls = 0;
  bool failErase = false;
  bool failOpen = false;

  File get _headerFile => File('${file.path}.header');

  @override
  Future<bool> exists() async => file.existsSync() && file.lengthSync() > 0;

  @override
  Future<String?> readHeaderCopy() async =>
      _headerFile.existsSync() ? _headerFile.readAsStringSync() : null;

  @override
  Future<void> writeHeaderCopy(String header) async =>
      _headerFile.writeAsStringSync(header);

  @override
  Future<AppDatabase> open(
    Uint8List key, {
    required bool expectExisting,
  }) async {
    openCalls++;
    if (failOpen) throw StateError('storage unavailable');
    final db = AppDatabase(
      NativeDatabase(
        file,
        setup: (raw) => attachWebKey(raw, key, expectExisting: expectExisting),
      ),
    );
    return openAndProbe(db);
  }

  @override
  Future<void> erase() async {
    eraseCalls++;
    if (failErase) throw StateError('storage refused');
    if (_headerFile.existsSync()) _headerFile.deleteSync();
    for (final suffix in const ['', '-journal', '-wal', '-shm']) {
      final f = File('${file.path}$suffix');
      if (f.existsSync()) f.deleteSync();
    }
  }
}

/// Wraps a storage and makes reads throw (browser refusing localStorage).
class ThrowingStorage implements WebStoreStorage {
  @override
  String? read(String key) => throw StateError('blocked');
  @override
  void write(String key, String value) => throw StateError('blocked');
  @override
  void remove(String key) => throw StateError('blocked');
}
