// `navigator.locks` implementation of `WebStoreLock` -- WEB ONLY.
//
// `request(name, {ifAvailable: true}, cb)` calls `cb(null)` immediately when
// another tab holds the lock; otherwise `cb(lock)` and the lock is held
// until the promise `cb` returned settles -- which we keep pending until
// [release]. The browser also frees it if the tab is closed or crashes.
//
// A browser without the Web Locks API (old or insecure context) gets a
// no-op handle: exclusion degrades to "not enforced" (documented in
// ADR-0002) rather than locking the user out.

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

import 'web_store_lock.dart';

const String kWebStoreLockName = 'openplate-store';

final class WebLocksStoreLock implements WebStoreLock {
  const WebLocksStoreLock();

  @override
  Future<WebStoreLockHandle?> tryAcquire() async {
    final navigator = web.window.navigator as JSObject;
    if (!navigator.has('locks')) return const _NoopHandle();
    final acquired = Completer<WebStoreLockHandle?>();
    final held = Completer<JSAny?>();
    JSAny? onGranted(JSAny? lock) {
      if (lock == null) {
        acquired.complete(null);
        return null;
      }
      acquired.complete(_Handle(held));
      return held.future.toJS;
    }

    // The request promise settles when the lock is released (or on error).
    unawaited(
      web.window.navigator.locks
          .request(
            kWebStoreLockName,
            web.LockOptions(ifAvailable: true),
            onGranted.toJS,
          )
          .toDart
          .then<void>(
            (_) {},
            onError: (Object _) {
              if (!acquired.isCompleted) acquired.complete(const _NoopHandle());
            },
          ),
    );
    return acquired.future;
  }
}

final class _Handle implements WebStoreLockHandle {
  _Handle(this._held);
  final Completer<JSAny?> _held;

  @override
  void release() {
    if (!_held.isCompleted) _held.complete(null);
  }
}

final class _NoopHandle implements WebStoreLockHandle {
  const _NoopHandle();
  @override
  void release() {}
}
