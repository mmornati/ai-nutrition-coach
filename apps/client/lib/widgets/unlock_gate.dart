// The `UnlockGate` — the scaffold-replacing widget that decides
// whether to mount the `LockScreen` or the `DayBoardScreen`
// (Story 4.1 / AD-8).
//
// The gate reads the `WebSessionKey` singleton; while the session
// is locked the lock screen is the first paint. On unlock the
// session key's `isOpen` flips to true and the Day Board takes
// over. The gate is reactive: a `Listenable` notifies on every
// `unlock` / `lock`, and the gate rebuilds.
//
// The Day Board is rendered behind the gate; on web the
// `WasmEncryptedStore` returns the typed `WebSessionKeyFailure`
// while locked, so even a fast-finger unlock followed by a network
// hiccup is recoverable.
//
// `kIsWeb` keeps the lock screen off the io target: the mobile
// `EncryptedStoreAdapter` opens with the secure-storage key at
// startup (AD-8 mobile), so the gate is a no-op on io and the Day
// Board is the first paint as in Epic 1/2/3.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../screens/day_board_screen.dart';
import '../screens/lock_screen.dart';
import '../state/web_session_key_provider.dart';

class UnlockGate extends ConsumerStatefulWidget {
  const UnlockGate({super.key});

  @override
  ConsumerState<UnlockGate> createState() => _UnlockGateState();
}

class _UnlockGateState extends ConsumerState<UnlockGate> {
  late final _SessionKeyListener _listener;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      _listener = _SessionKeyListener(ref.read(webSessionKeyProvider));
      _listener.addListener(_onChange);
    } else {
      _listener = _SessionKeyListener.noop();
    }
  }

  @override
  void dispose() {
    _listener.removeListener(_onChange);
    _listener.dispose();
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) {
      return const DayBoardScreen();
    }
    final sessionKey = ref.watch(webSessionKeyProvider);
    if (!sessionKey.isOpen) {
      return const LockScreen();
    }
    return const DayBoardScreen();
  }
}

/// Lightweight listener that re-broadcasts the session-key open
/// state. Avoids the cost of a full `ChangeNotifier` for what is
/// effectively a boolean flip.
class _SessionKeyListener extends ChangeNotifier {
  _SessionKeyListener(WebSessionKey key) : _key = key, _isOpen = key.isOpen;
  _SessionKeyListener.noop() : _key = null, _isOpen = true;
  final WebSessionKey? _key;
  bool _isOpen;
  bool get isOpen => _isOpen;

  @override
  void notifyListeners() {
    final k = _key;
    if (k == null) return;
    if (k.isOpen != _isOpen) {
      _isOpen = k.isOpen;
      super.notifyListeners();
    }
  }
}
