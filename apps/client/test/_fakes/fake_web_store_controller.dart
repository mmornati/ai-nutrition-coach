// A `WebStoreController` whose status the test drives directly (no
// database, no KDF): enough to exercise the gate, the lock / create screens
// and the settings controls on the Dart VM. The real create / unlock / lock
// logic is covered against real sqlite3mc in
// `packages/integrations/test/web_store_controller_test.dart`.

import 'dart:typed_data';

import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';

class _NoBackend implements WebDatabaseBackend {
  @override
  Future<bool> exists() async => false;

  @override
  Future<String?> readHeaderCopy() async => null;

  @override
  Future<void> writeHeaderCopy(String header) async {}

  @override
  Future<AppDatabase> open(Uint8List key, {required bool expectExisting}) =>
      throw StateError('fake backend');

  @override
  Future<void> erase() async {}
}

class FakeWebStoreController extends WebStoreController {
  FakeWebStoreController({WebStoreStatus status = WebStoreStatus.locked})
    : super(
        storage: InMemoryWebStoreStorage(),
        backend: _NoBackend(),
        kdf: const DartPbkdf2Kdf(),
        lock: InMemoryWebStoreLock(),
        normalizePassphrase: _identity,
      ) {
    _status = status;
  }

  late WebStoreStatus _status;

  /// What the next `unlock` / `createStore` returns.
  WebUnlockOutcome next = const WebUnlocked();
  final List<String> unlockCalls = [];
  final List<String> createCalls = [];
  int lockCalls = 0;
  int touches = 0;
  int hidden = 0;
  int visible = 0;

  @override
  WebStoreStatus get status => _status;

  @override
  bool get isUnlocked => _status == WebStoreStatus.unlocked;

  void setStatus(WebStoreStatus status) {
    _status = status;
    notifyListeners();
  }

  @override
  Future<WebUnlockOutcome> unlock(String passphrase) async {
    unlockCalls.add(passphrase);
    if (next is WebUnlocked) setStatus(WebStoreStatus.unlocked);
    return next;
  }

  @override
  Future<WebUnlockOutcome> createStore(String passphrase) async {
    createCalls.add(passphrase);
    final result = validateNewPassphrase(passphrase);
    if (result != null) return WebPassphraseRejected(result);
    if (next is WebUnlocked) setStatus(WebStoreStatus.unlocked);
    return next;
  }

  @override
  Future<void> lock() async {
    lockCalls++;
    setStatus(WebStoreStatus.locked);
  }

  Duration _idle = kWebDefaultIdleTimeout;

  @override
  Duration get idleTimeout => _idle;

  @override
  void setIdleTimeout(Duration timeout) {
    _idle = timeout;
    notifyListeners();
  }

  @override
  void touch() => touches++;

  @override
  void onHidden() => hidden++;

  @override
  void onVisible() => visible++;
}

String _identity(String value) => value;
