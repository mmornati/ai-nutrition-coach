// Cross-tab exclusion for the web store (Phase 2B review H1).
//
// Two tabs of the same origin share one IndexedDB database and one header.
// Without exclusion, tab B could create over (and wipe) a store tab A is
// using, or both could write the same file system. A tab therefore holds an
// exclusive lock from create/unlock until it locks or closes. Production is
// the Web Locks API (`navigator.locks`, `web_locks.dart`), which the browser
// releases automatically when the tab dies; VM tests share one
// [InMemoryWebStoreLock] between two controllers to play the two tabs.

abstract interface class WebStoreLock {
  /// Try to take the exclusive lock WITHOUT waiting. `null` = held elsewhere.
  Future<WebStoreLockHandle?> tryAcquire();
}

abstract interface class WebStoreLockHandle {
  /// Release the lock. Idempotent.
  void release();
}

/// Single-process stand-in for the browser's lock manager.
final class InMemoryWebStoreLock implements WebStoreLock {
  bool _held = false;

  bool get isHeld => _held;

  @override
  Future<WebStoreLockHandle?> tryAcquire() async {
    if (_held) return null;
    _held = true;
    return _Handle(this);
  }
}

final class _Handle implements WebStoreLockHandle {
  _Handle(this._owner);
  final InMemoryWebStoreLock _owner;
  bool _released = false;

  @override
  void release() {
    if (_released) return;
    _released = true;
    _owner._held = false;
  }
}
