// A minimal FIFO async mutex (N9). Serialises read-modify-write sequences
// over an async store (secure storage has no transactions) so two
// concurrent callers cannot both read the same value and lose an update.

import 'dart:async';

class AsyncMutex {
  Future<void> _tail = Future<void>.value();

  /// Runs [action] after every previously queued action has finished
  /// (whether they succeeded or threw). The result / error of [action] is
  /// returned to the caller; a failure never blocks the queue.
  Future<T> synchronized<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    final previous = _tail;
    _tail = completer.future.then<void>((_) {}, onError: (Object _) {});
    previous.then<void>((_) async {
      try {
        completer.complete(await action());
      } on Object catch (e, s) {
        completer.completeError(e, s);
      }
    });
    return completer.future;
  }
}
