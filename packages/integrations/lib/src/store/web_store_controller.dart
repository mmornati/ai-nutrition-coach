// The web store's state machine (Phase 2B / W1-W7, items 3-8).
//
//   checking -> needsPassphraseCreation --createStore--> unlocked
//            -> locked                  --unlock-------> unlocked
//            -> needsReset (header unreadable / data missing) -> erase
//   unlocked --lock / idle / page hidden--> locked
//
// It owns the three things that must never drift apart: the persisted
// header (`WebStoreMeta`: salt + KDF params + format version), the keyed
// database (`WebDatabaseBackend`) and the in-memory key (`WebSessionKey`).
// All three are injected, so the exact production logic runs on the Dart VM
// against a file-backed sqlite3mc database and an in-memory header store;
// only the three tiny web adapters (WebCrypto KDF, localStorage, the
// IndexedDB wasm backend) are browser-only.
//
// Invariants (each pinned by `web_store_controller_test.dart`):
//   * A key is retained ONLY after the database opened with it and the
//     schema was read (W3). A wrong passphrase can never open the store:
//     sqlite3mc's page decryption fails, so there is no "any passphrase
//     works" path and nothing is written.
//   * The header is written only after a creation succeeded; creating over
//     an orphaned database erases it first.
//   * [lock] zeroes the key buffer, closes the database and flips the
//     status BEFORE awaiting the close, so the UI never shows data after a
//     lock.
//   * Unlock throttling (exponential delay after repeated failures) is UX
//     friction only: it lives in this tab's memory, a reload resets it, and
//     an offline attacker with a copy of the IndexedDB bypasses it
//     completely. The real defence is the KDF cost + passphrase strength
//     (see ADR-0002). It is not a security control and is not described as
//     one.

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';

import 'app_database.dart';
import 'web_database_backend.dart';
import 'web_kdf.dart';
import 'web_session_key.dart';
import 'web_store_meta.dart';
import 'web_store_lock.dart';
import 'web_store_storage.dart';

/// Where the store is in its lifecycle.
enum WebStoreStatus {
  /// `initialize` has not finished.
  checking,

  /// First run: no store yet, the user must create a passphrase.
  needsPassphraseCreation,

  /// A store exists; the passphrase is needed.
  locked,

  /// Key verified, database open.
  unlocked,

  /// The header is unreadable or the data is gone; the only way forward is
  /// the explicit erase.
  needsReset,

  /// An erase is in progress (the key is gone, the data is being deleted).
  /// The app restarts into a fresh status when it finishes.
  erasing,
}

/// Minimum length (in characters) of a new passphrase.
const int kWebPassphraseMinLength = 10;

/// Minimum number of distinct characters (rejects "aaaaaaaaaa").
const int kWebPassphraseMinDistinct = 4;

/// Why a NEW passphrase is not acceptable.
enum WebPassphraseIssue { tooShort, tooRepetitive }

/// The strength floor for a new passphrase. Deliberately simple: length is
/// what matters against an offline attacker. `null` means acceptable.
WebPassphraseIssue? validateNewPassphrase(String passphrase) {
  final runes = passphrase.runes.toList(growable: false);
  if (runes.length < kWebPassphraseMinLength) {
    return WebPassphraseIssue.tooShort;
  }
  if (runes.toSet().length < kWebPassphraseMinDistinct) {
    return WebPassphraseIssue.tooRepetitive;
  }
  return null;
}

/// Delay imposed after [failures] consecutive wrong passphrases: none for
/// the first two, then 1 s, 2 s, 4 s ... capped at 30 s. UX friction only.
Duration webUnlockDelayFor(int failures) {
  if (failures < 3) return Duration.zero;
  final seconds = min(30, 1 << min(failures - 3, 5));
  return Duration(seconds: seconds);
}

/// Outcome of `createStore` / `unlock`. Sealed: callers must handle each.
sealed class WebUnlockOutcome {
  const WebUnlockOutcome();
}

final class WebUnlocked extends WebUnlockOutcome {
  const WebUnlocked();
}

/// The passphrase does not open the store. [retryAfter] is the delay now in
/// force (zero for the first failures).
final class WebWrongPassphrase extends WebUnlockOutcome {
  const WebWrongPassphrase({this.retryAfter = Duration.zero});
  final Duration retryAfter;
}

/// Too soon after repeated failures (or another attempt is running).
final class WebThrottled extends WebUnlockOutcome {
  const WebThrottled(this.retryAfter);
  final Duration retryAfter;
}

/// A NEW passphrase failed the strength floor.
final class WebPassphraseRejected extends WebUnlockOutcome {
  const WebPassphraseRejected(this.issue);
  final WebPassphraseIssue issue;
}

/// The browser storage / wasm cipher could not be used (private mode,
/// blocked IndexedDB, the wasm asset missing). Not the user's passphrase.
final class WebStoreUnavailable extends WebUnlockOutcome {
  const WebStoreUnavailable();
}

/// Another tab of this origin holds the store open (or is creating it). The
/// caller can simply try again once that tab has locked or closed.
final class WebStoreInUseElsewhere extends WebUnlockOutcome {
  const WebStoreInUseElsewhere();
}

/// The header promised data that is gone. The status becomes `needsReset`.
final class WebStoreDataMissing extends WebUnlockOutcome {
  const WebStoreDataMissing();
}

/// What the plate-log / coach-note stores read the open database from.
abstract interface class WebDatabaseSource {
  /// The open database, or `null` while locked.
  AppDatabase? get database;

  /// Lock the store (zero the key, close the database).
  Future<void> lock();
}

/// The idle delays the UI offers; stored values are clamped to these.
const List<int> kWebIdleMinuteChoices = [5, 15, 30, 60];

int _clampIdleMinutes(int minutes) {
  var best = kWebIdleMinuteChoices.first;
  for (final choice in kWebIdleMinuteChoices) {
    if ((choice - minutes).abs() < (best - minutes).abs()) best = choice;
  }
  return best;
}

const String kWebLockIdleMinutesKey = 'openplate.web.lock.idleMinutes';

/// Default idle auto-lock.
const Duration kWebDefaultIdleTimeout = Duration(minutes: 15);

/// Default time the page may stay hidden before it locks.
const Duration kWebDefaultHiddenLockAfter = Duration(minutes: 5);

class WebStoreController extends ChangeNotifier implements WebDatabaseSource {
  WebStoreController({
    required WebStoreStorage storage,
    required WebDatabaseBackend backend,
    required PassphraseKdf kdf,
    required WebStoreLock lock,
    required String Function(String) normalizePassphrase,
    Random? random,
    DateTime Function()? clock,
    WebKdfParams kdfParams = const WebKdfParams(),
    int minIterations = kWebKdfMinIterations,
    Duration hiddenLockAfter = kWebDefaultHiddenLockAfter,
    Duration idleTimeout = kWebDefaultIdleTimeout,
    WebSessionKey? sessionKey,
  }) : _storage = storage,
       _lock = lock,
       _normalize = normalizePassphrase,
       _idleTimeout = idleTimeout,
       _backend = backend,
       _kdf = kdf,
       _random = random ?? Random.secure(),
       _clock = clock ?? DateTime.now,
       _kdfParams = kdfParams,
       _minIterations = minIterations,
       _hiddenLockAfter = hiddenLockAfter,
       _session = sessionKey ?? WebSessionKey();

  final WebStoreStorage _storage;
  final WebDatabaseBackend _backend;
  final PassphraseKdf _kdf;
  final WebStoreLock _lock;
  final String Function(String) _normalize;
  WebStoreLockHandle? _lockHandle;
  final Random _random;
  final DateTime Function() _clock;
  final WebKdfParams _kdfParams;
  final int _minIterations;
  final Duration _hiddenLockAfter;
  final WebSessionKey _session;

  WebStoreStatus _status = WebStoreStatus.checking;
  WebStoreMeta? _meta;
  AppDatabase? _db;
  bool _busy = false;
  bool _disposed = false;

  int _failures = 0;
  DateTime? _blockedUntil;

  Duration _idleTimeout;
  Timer? _idleTimer;
  Timer? _hiddenTimer;
  DateTime? _lastActivity;
  DateTime? _hiddenAt;

  WebStoreStatus get status => _status;

  /// The observable key holder (open <=> unlocked). Tests only: production
  /// code asks [isUnlocked] and never touches key material.
  @visibleForTesting
  WebSessionKey get sessionKey => _session;

  bool get isUnlocked => _status == WebStoreStatus.unlocked;

  @override
  AppDatabase? get database => _db;

  /// Idle time after which an unlocked store locks itself.
  Duration get idleTimeout => _idleTimeout;

  /// Read the persisted header and settle the status. Safe to call again
  /// (e.g. after an erase): it re-derives everything from storage.
  Future<void> initialize() async {
    await _teardown();
    WebStoreMetaRead read;
    try {
      final minutes = int.tryParse(_storage.read(kWebLockIdleMinutesKey) ?? '');
      if (minutes != null && minutes > 0) {
        _idleTimeout = Duration(minutes: _clampIdleMinutes(minutes));
      }
      read = readWebStoreMeta(_storage, minIterations: _minIterations);
      if (read is WebStoreMetaAbsent) read = await _recoverMissingHeader();
    } on Object {
      // Storage refused a read. Do NOT treat that as "first run": the
      // create flow must never run over data it cannot see.
      read = const WebStoreMetaInvalid();
    }
    switch (read) {
      case WebStoreMetaAbsent():
        _meta = null;
        _status = WebStoreStatus.needsPassphraseCreation;
      case WebStoreMetaPresent(:final meta):
        _meta = meta;
        _status = WebStoreStatus.locked;
      case WebStoreMetaInvalid():
        _meta = null;
        _status = WebStoreStatus.needsReset;
    }
    _notify();
  }

  /// No header in `localStorage`: recover it from the copy kept in IndexedDB;
  /// and if data exists with no header at all, refuse to treat it as a first
  /// run (that would wipe a store the user may still be able to recover).
  Future<WebStoreMetaRead> _recoverMissingHeader() async {
    final copy = await _backend.readHeaderCopy();
    if (copy != null) {
      final parsed = parseWebStoreMeta(copy, minIterations: _minIterations);
      if (parsed is WebStoreMetaPresent) {
        _storage.write(kWebStoreMetaKey, parsed.meta.encode());
      }
      return parsed;
    }
    if (await _backend.exists()) return const WebStoreMetaInvalid();
    return const WebStoreMetaAbsent();
  }

  /// First-run flow: validate, mint a random per-store salt, derive, create
  /// the keyed database, and only then persist the header.
  Future<WebUnlockOutcome> createStore(String passphrase) async {
    if (_status != WebStoreStatus.needsPassphraseCreation) {
      return const WebStoreUnavailable();
    }
    final issue = validateNewPassphrase(passphrase);
    if (issue != null) return WebPassphraseRejected(issue);
    if (_busy) return const WebThrottled(Duration.zero);
    _busy = true;
    Uint8List? key;
    try {
      // Exclusive across tabs BEFORE anything is read or written.
      final handle = await _lock.tryAcquire();
      if (handle == null) return const WebStoreInUseElsewhere();
      _lockHandle = handle;
      // Another tab may have created the store since this one started:
      // re-read the real state under the lock; never create over it.
      final fresh = await _freshStateIsEmpty();
      if (!fresh) {
        _releaseLock();
        await initialize();
        return const WebStoreUnavailable();
      }
      final salt = Uint8List.fromList(
        List<int>.generate(kWebStoreSaltBytes, (_) => _random.nextInt(256)),
      );
      final meta = WebStoreMeta(kdf: _kdfParams, salt: salt);
      try {
        key = await _derive(passphrase, salt, _kdfParams);
        _db = await _backend.open(key, expectExisting: false);
        // Copy first, then the authoritative header: if the second write
        // fails the copy lets the next start recover; if the first fails we
        // never claim a store exists.
        await _backend.writeHeaderCopy(meta.encode());
        _storage.write(kWebStoreMetaKey, meta.encode());
      } on Object {
        await _discard(key);
        key = null;
        // We hold the lock and verified nothing existed, so whatever the
        // failed attempt left behind (e.g. an empty IndexedDB) is ours.
        try {
          await _backend.erase();
        } on Object {
          // best effort
        }
        _releaseLock();
        return const WebStoreUnavailable();
      }
      _meta = meta;
      return _completeUnlock(key);
    } finally {
      _busy = false;
    }
  }

  /// True when neither a header (storage or IndexedDB copy) nor database
  /// bytes exist, i.e. it is really a first run.
  Future<bool> _freshStateIsEmpty() async {
    try {
      if (readWebStoreMeta(_storage, minIterations: _minIterations)
          is! WebStoreMetaAbsent) {
        return false;
      }
      if (await _backend.readHeaderCopy() != null) return false;
      return !await _backend.exists();
    } on Object {
      return false;
    }
  }

  /// Returning-user flow.
  Future<WebUnlockOutcome> unlock(String passphrase) async {
    final meta = _meta;
    if (_status != WebStoreStatus.locked || meta == null) {
      return const WebStoreUnavailable();
    }
    final now = _clock();
    final blocked = _blockedUntil;
    if (blocked != null && now.isBefore(blocked)) {
      return WebThrottled(blocked.difference(now));
    }
    if (_busy) return const WebThrottled(Duration.zero);
    _busy = true;
    Uint8List? key;
    try {
      final handle = await _lock.tryAcquire();
      if (handle == null) return const WebStoreInUseElsewhere();
      _lockHandle = handle;
      try {
        key = await _derive(passphrase, meta.salt, meta.kdf);
        _db = await _backend.open(key, expectExisting: true);
      } on Object catch (e) {
        await _discard(key);
        key = null;
        _releaseLock();
        switch (classifyWebOpenError(e)) {
          case WebOpenFailure.wrongKey:
            _failures++;
            final delay = webUnlockDelayFor(_failures);
            _blockedUntil = delay == Duration.zero ? null : _clock().add(delay);
            return WebWrongPassphrase(retryAfter: delay);
          case WebOpenFailure.dataMissing:
            _status = WebStoreStatus.needsReset;
            _notify();
            return const WebStoreDataMissing();
          case WebOpenFailure.unavailable:
            return const WebStoreUnavailable();
        }
      }
      return _completeUnlock(key);
    } finally {
      _busy = false;
    }
  }

  WebUnlockOutcome _completeUnlock(Uint8List key) {
    _failures = 0;
    _blockedUntil = null;
    _session.unlockWith(key);
    _status = WebStoreStatus.unlocked;
    _lastActivity = _clock();
    _armIdleTimer();
    _notify();
    return const WebUnlocked();
  }

  /// Zero the key, drop the database handle, flip to locked, THEN await the
  /// close (so the UI is already off the data by the time it completes).
  @override
  Future<void> lock() => _close(WebStoreStatus.locked);

  /// Same as [lock] but parks the status at `erasing` so the app does not
  /// treat the close as an ordinary lock (the eraser calls this first).
  Future<void> prepareForErase() => _close(WebStoreStatus.erasing);

  Future<void> _close(WebStoreStatus next) async {
    _idleTimer?.cancel();
    _idleTimer = null;
    _hiddenTimer?.cancel();
    _hiddenTimer = null;
    _hiddenAt = null;
    final db = _db;
    _db = null;
    _session.lock();
    final wasUnlocked = _status == WebStoreStatus.unlocked;
    if (next == WebStoreStatus.erasing ? _status != next : wasUnlocked) {
      _status = next;
      _notify();
    }
    if (db != null) {
      try {
        await db.close();
      } on Object {
        // The key is already gone and the handle dropped; nothing to do.
      }
    }
    // Only after the database is closed may another tab take over.
    _releaseLock();
  }

  void _releaseLock() {
    _lockHandle?.release();
    _lockHandle = null;
  }

  /// Delete the persisted store (database bytes first, then the header, so a
  /// half-finished erase never leaves data that looks recoverable). On
  /// success the caller restarts the app, which calls [initialize] again; on
  /// failure the status is re-derived from what is still in storage and the
  /// error is rethrown for the eraser to report.
  Future<void> eraseStore() async {
    await prepareForErase();
    WebStoreLockHandle? handle;
    try {
      // Never delete a store another tab has open.
      handle = await _lock.tryAcquire();
      if (handle == null) throw StateError('store is open in another tab');
      await _backend.erase();
      _storage.remove(kWebStoreMetaKey);
      _storage.remove(kWebLockIdleMinutesKey);
    } on Object {
      handle?.release();
      await initialize();
      rethrow;
    }
    handle.release();
    _meta = null;
    _failures = 0;
    _blockedUntil = null;
  }

  // ── auto-lock ──────────────────────────────────────────────────────────

  /// Record user activity (pointer / keyboard); pushes the idle deadline
  /// out. Cheap: re-arms at most once per second.
  void touch() {
    if (!isUnlocked) return;
    final now = _clock();
    final last = _lastActivity;
    if (last != null && now.difference(last) < const Duration(seconds: 1)) {
      return;
    }
    _lastActivity = now;
    _armIdleTimer();
  }

  /// The page became hidden (tab switch, minimise, `visibilitychange`).
  void onHidden() {
    if (!isUnlocked) return;
    _hiddenAt ??= _clock();
    // A timer, not only the check on return: a tab hidden for hours must
    // lock while hidden. (Browsers may throttle it; the on-return check in
    // [onVisible] is the fallback.)
    _hiddenTimer?.cancel();
    _hiddenTimer = Timer(_hiddenLockAfter, () => unawaited(lock()));
  }

  /// The page is visible again: lock if it was away too long, or if the
  /// idle deadline passed while timers were throttled in the background.
  void onVisible() {
    final hiddenAt = _hiddenAt;
    _hiddenAt = null;
    _hiddenTimer?.cancel();
    _hiddenTimer = null;
    if (!isUnlocked) return;
    final now = _clock();
    final away =
        hiddenAt != null && now.difference(hiddenAt) >= _hiddenLockAfter;
    final last = _lastActivity;
    final idle = last != null && now.difference(last) >= _idleTimeout;
    if (away || idle) unawaited(lock());
  }

  /// Change the idle auto-lock delay and persist it (non-secret setting).
  void setIdleTimeout(Duration timeout) {
    if (timeout <= Duration.zero) return;
    final minutes = _clampIdleMinutes(timeout.inMinutes);
    _idleTimeout = Duration(minutes: minutes);
    _storage.write(kWebLockIdleMinutesKey, minutes.toString());
    if (isUnlocked) _armIdleTimer();
    _notify();
  }

  void _armIdleTimer() {
    _idleTimer?.cancel();
    _idleTimer = Timer(_idleTimeout, () => unawaited(lock()));
  }

  // ── internals ──────────────────────────────────────────────────────────

  Future<Uint8List> _derive(
    String passphrase,
    Uint8List salt,
    WebKdfParams params,
  ) async {
    // The UTF-8 buffer is ours to wipe; the `String` itself is immutable and
    // lives until GC (see `WebSessionKey`'s note on honest limits).
    // NFC first (the same visible passphrase must derive the same key
    // whatever the keyboard/OS composes), then UTF-8; recorded in the header.
    final bytes = Uint8List.fromList(utf8.encode(_normalize(passphrase)));
    try {
      return await _kdf.derive(passphrase: bytes, salt: salt, params: params);
    } finally {
      bytes.fillRange(0, bytes.length, 0);
    }
  }

  /// Failure path: wipe the candidate key and close a half-open database.
  Future<void> _discard(Uint8List? key) async {
    key?.fillRange(0, key.length, 0);
    final db = _db;
    _db = null;
    if (db != null) {
      try {
        await db.close();
      } on Object {
        // ignore
      }
    }
  }

  Future<void> _teardown() async {
    _idleTimer?.cancel();
    _idleTimer = null;
    _hiddenTimer?.cancel();
    _hiddenTimer = null;
    final db = _db;
    _db = null;
    _session.lock();
    if (db != null) {
      try {
        await db.close();
      } on Object {
        // ignore
      }
    }
    _releaseLock();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _idleTimer?.cancel();
    _hiddenTimer?.cancel();
    _releaseLock();
    final db = _db;
    _db = null;
    _session.dispose();
    if (db != null) unawaited(db.close());
    super.dispose();
  }

  @override
  String toString() => 'WebStoreController(${_status.name})';
}
