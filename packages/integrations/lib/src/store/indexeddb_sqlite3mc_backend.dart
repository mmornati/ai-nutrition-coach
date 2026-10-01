// The production web database backend (Phase 2B / W1) -- WEB ONLY.
//
//   sqlite3mc-<ver>.wasm   SQLite3MultipleCiphers compiled to WebAssembly by the
//                    sqlite3 package's release pipeline (the exact version in
//                    pubspec.lock; fetched and SHA-256-verified by
//                    scripts/fetch_web_sqlite.sh, never committed). This
//                    build supports ONLY chacha20 -- the cipher mobile pins.
//   IndexedDbFileSystem   the sqlite3 package's IndexedDB-backed VFS: the
//                    database file is stored in IndexedDB as encrypted pages.
//   drift WasmDatabase    in the main isolate (no worker, see ADR-0002).
//
// Encryption needs an encryption-capable VFS. sqlite3mc only keys a database
// whose VFS is one of ITS wrappers; a plain Dart VFS makes `PRAGMA key` fail
// with "Encryption is not supported by the VFS" (found by running the build
// in a real browser -- the README example for in-memory files fails the same
// way). sqlite3mc creates the wrapper on demand when a database is opened
// with the VFS name `multipleciphers-<real vfs name>`, so the sqlite3 handle
// handed to drift pins that name (`_PinnedVfsSqlite3`).
//
// Because the wrapper keeps a pointer to the Dart VFS and cannot be
// unregistered from Dart, every open registers its IndexedDB file system
// under a FRESH name; a stale wrapper from an earlier open is never looked up
// again (a few bytes of leak per unlock, bounded by the page lifetime).
//
// Keying is the SAME synchronous `attachWebKey` as mobile, run inside
// drift's `setup` callback before any schema work, and `openAndProbe` forces
// the open so a wrong key surfaces here, not on the first user write. The
// IndexedDB contents are ciphertext (ChaCha20-Poly1305 pages); without the
// passphrase-derived key they are unreadable.
//
// One wasm module instance is loaded once and reused across lock/unlock.

import 'dart:typed_data';

import 'package:drift/wasm.dart';
import 'package:sqlite3/wasm.dart';

import 'app_database.dart';
import 'web_database_backend.dart';
import 'web_header_copy.dart' as header_copy;

/// IndexedDB database name holding the encrypted file system.
const String kWebIndexedDbName = 'openplate_encrypted_v1';

const String _databasePath = '/openplate.db';

/// sqlite3mc's wrapper-VFS name prefix (`SQLITE3MC_VFS_NAME`).
const String _mcVfsPrefix = 'multipleciphers';

final class IndexedDbSqlite3mcBackend implements WebDatabaseBackend {
  IndexedDbSqlite3mcBackend({
    this.wasmPath = kWebSqliteWasmPath,
    this.indexedDbName = kWebIndexedDbName,
  });

  final String wasmPath;
  final String indexedDbName;
  WasmSqlite3? _sqlite3;
  int _opens = 0;

  Future<WasmSqlite3> _load() async =>
      _sqlite3 ??= await WasmSqlite3.loadFromUrl(Uri.parse(wasmPath));

  @override
  Future<AppDatabase> open(
    Uint8List key, {
    required bool expectExisting,
  }) async {
    final sqlite3 = await _load();
    final vfsName = 'openplate-idb-${_opens++}';
    final fs = await IndexedDbFileSystem.open(
      dbName: indexedDbName,
      vfsName: vfsName,
    );
    sqlite3.registerVirtualFileSystem(fs);

    Future<void> release() async {
      try {
        sqlite3.unregisterVirtualFileSystem(fs);
      } on Object {
        // Already unregistered.
      }
      await fs.close();
    }

    final database = _WebAppDatabase(
      WasmDatabase(
        sqlite3: _PinnedVfsSqlite3(sqlite3, '$_mcVfsPrefix-$vfsName'),
        path: _databasePath,
        fileSystem: fs,
        setup: (raw) => attachWebKey(raw, key, expectExisting: expectExisting),
      ),
      release,
    );
    // On failure `openAndProbe` closes the database, which releases the fs.
    return openAndProbe(database);
  }

  @override
  Future<bool> exists() async {
    final names = await IndexedDbFileSystem.databases();
    return names != null && names.contains(indexedDbName);
  }

  @override
  Future<String?> readHeaderCopy() => header_copy.readHeaderCopy();

  @override
  Future<void> writeHeaderCopy(String header) =>
      header_copy.writeHeaderCopy(header);

  @override
  Future<void> erase() async {
    await IndexedDbFileSystem.deleteDatabase(indexedDbName);
    await header_copy.deleteHeaderCopy();
  }
}

/// Delegates to a loaded [WasmSqlite3] but opens every database on the
/// encryption-capable wrapper VFS instead of the plain one.
final class _PinnedVfsSqlite3 implements CommonSqlite3 {
  _PinnedVfsSqlite3(this._inner, this._vfs);

  final WasmSqlite3 _inner;
  final String _vfs;

  @override
  Version get version => _inner.version;

  @override
  CommonDatabase open(
    String filename, {
    String? vfs,
    OpenMode mode = OpenMode.readWriteCreate,
    bool uri = false,
    bool? mutex,
  }) => _inner.open(
    filename,
    vfs: vfs ?? _vfs,
    mode: mode,
    uri: uri,
    mutex: mutex,
  );

  @override
  CommonDatabase openInMemory({String? vfs}) => _inner.openInMemory(vfs: vfs);

  @override
  String? get tempDirectory => _inner.tempDirectory;

  @override
  set tempDirectory(String? value) => _inner.tempDirectory = value;

  @override
  void registerVirtualFileSystem(
    VirtualFileSystem vfs, {
    bool makeDefault = false,
  }) => _inner.registerVirtualFileSystem(vfs, makeDefault: makeDefault);

  @override
  void unregisterVirtualFileSystem(VirtualFileSystem vfs) =>
      _inner.unregisterVirtualFileSystem(vfs);
}

/// `AppDatabase` that also releases its IndexedDB file system on close.
class _WebAppDatabase extends AppDatabase {
  _WebAppDatabase(super.executor, this._release);

  final Future<void> Function() _release;
  bool _released = false;

  @override
  Future<void> close() async {
    try {
      await super.close();
    } finally {
      if (!_released) {
        _released = true;
        await _release();
      }
    }
  }
}
