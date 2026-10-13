// A tiny IndexedDB key/value database holding a COPY of the store header
// (Phase 2B review M1) -- WEB ONLY. The authoritative header is in
// `localStorage`; this copy lives in IndexedDB beside the encrypted data, so
// "the user cleared localStorage but not IndexedDB" is recoverable (the
// header is not secret: salt, KDF name/cost, format version).

import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

const String kWebHeaderDbName = 'ai_nutrition_coach_header_v1';
const String _store = 'kv';
const String _key = 'header';

Future<web.IDBDatabase> _open() {
  final done = Completer<web.IDBDatabase>();
  final request = web.window.indexedDB.open(kWebHeaderDbName, 1);
  request.onupgradeneeded = ((web.Event _) {
    (request.result as web.IDBDatabase).createObjectStore(_store);
  }).toJS;
  request.onsuccess = ((web.Event _) {
    done.complete(request.result as web.IDBDatabase);
  }).toJS;
  request.onerror = ((web.Event _) {
    done.completeError(StateError('header db unavailable'));
  }).toJS;
  return done.future;
}

Future<String?> readHeaderCopy() async {
  // Do not create the database just to read it.
  final names = await web.window.indexedDB.databases().toDart;
  if (!names.toDart.any((d) => d.name == kWebHeaderDbName)) return null;
  final db = await _open();
  try {
    final done = Completer<String?>();
    final get = db
        .transaction(_store.toJS, 'readonly')
        .objectStore(_store)
        .get(_key.toJS);
    get.onsuccess = ((web.Event _) {
      final value = get.result;
      done.complete(value.isA<JSString>() ? (value as JSString).toDart : null);
    }).toJS;
    get.onerror = ((web.Event _) {
      done.completeError(StateError('header read failed'));
    }).toJS;
    return await done.future;
  } finally {
    db.close();
  }
}

Future<void> writeHeaderCopy(String header) async {
  final db = await _open();
  try {
    final done = Completer<void>();
    final tx = db.transaction(_store.toJS, 'readwrite');
    tx.objectStore(_store).put(header.toJS, _key.toJS);
    tx.oncomplete = ((web.Event _) => done.complete()).toJS;
    tx.onerror = ((web.Event _) {
      done.completeError(StateError('header write failed'));
    }).toJS;
    tx.onabort = tx.onerror;
    await done.future;
  } finally {
    db.close();
  }
}

Future<void> deleteHeaderCopy() async {
  final done = Completer<void>();
  final request = web.window.indexedDB.deleteDatabase(kWebHeaderDbName);
  request.onsuccess = ((web.Event _) => done.complete()).toJS;
  request.onerror = ((web.Event _) {
    done.completeError(StateError('header delete failed'));
  }).toJS;
  request.onblocked = ((web.Event _) {
    if (!done.isCompleted) {
      done.completeError(StateError('header delete blocked'));
    }
  }).toJS;
  await done.future;
}
