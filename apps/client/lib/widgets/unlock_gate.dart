// The `UnlockGate` — decides what the app shows first (Story 4.1 / AD-8,
// Phase 2B / W4, W6).
//
// Mobile and the dev in-memory store (no `WebStoreController`): the store is
// open at startup, so the Day Board is the first paint, or the calm
// "history can't be opened" surface when startup failed (D7).
//
// Web (controller present), by `WebStoreStatus`:
//   needsPassphraseCreation -> CreatePassphraseScreen   (first run)
//   locked                  -> LockScreen               (returning user)
//   unlocked                -> DayBoardScreen
//   needsReset              -> KeyLostScreen (erase and start over)
//   checking / erasing      -> blank
//
// The gate listens to the controller, so unlocking switches to the Day
// Board and locking switches back (the old gate never rebuilt). On every
// unlocked -> locked transition (manual, idle, page hidden) it asks the
// app to restart: that discards the whole `ProviderScope`, so no decrypted
// plate/coach data cached in providers survives a lock, and the next
// unlock builds fresh providers against the reopened database.
//
// It also feeds the auto-lock: pointer activity resets the idle timer, and
// the app lifecycle (Flutter web maps `visibilitychange` to `hidden` /
// `resumed`) tells the controller when the page was away.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../screens/create_passphrase_screen.dart';
import '../screens/day_board_screen.dart';
import '../screens/key_lost_screen.dart';
import '../screens/lock_screen.dart';
import '../state/erase_provider.dart';
import '../state/web_store_controller_provider.dart';

class UnlockGate extends ConsumerStatefulWidget {
  const UnlockGate({super.key});

  @override
  ConsumerState<UnlockGate> createState() => _UnlockGateState();
}

class _UnlockGateState extends ConsumerState<UnlockGate>
    with WidgetsBindingObserver {
  WebStoreController? _controller;
  WebStoreStatus? _previous;

  @override
  void initState() {
    super.initState();
    _controller = ref.read(webStoreControllerProvider);
    _previous = _controller?.status;
    _controller?.addListener(_onChange);
    WidgetsBinding.instance.addObserver(this);
    if (_controller != null) HardwareKeyboard.instance.addHandler(_onKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    WidgetsBinding.instance.removeObserver(this);
    _controller?.removeListener(_onChange);
    super.dispose();
  }

  /// Typing counts as activity (L2); never consumes the event.
  bool _onKey(KeyEvent event) {
    _controller?.touch();
    return false;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null) return;
    switch (state) {
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        controller.onHidden();
      case AppLifecycleState.resumed:
        controller.onVisible();
      case AppLifecycleState.inactive:
        break;
    }
  }

  void _onChange() {
    final controller = _controller;
    if (controller == null || !mounted) return;
    final before = _previous;
    final now = controller.status;
    _previous = now;
    final wasOpenOrErasing =
        before == WebStoreStatus.unlocked || before == WebStoreStatus.erasing;
    if (wasOpenOrErasing && now == WebStoreStatus.locked) {
      // Fresh providers: nothing decrypted outlives the lock.
      final restart = ref.read(appRestartProvider);
      scheduleMicrotask(restart);
      return;
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      // D7 / review 2: the store did not open (lost key, bad key, failed
      // migration, ...) — the Day Board could never read it, so offer the
      // explicit erase instead.
      final startup = ref.watch(storeStartupFailureProvider);
      if (startup != null) {
        return KeyLostScreen(
          copy: startup.encryptedStoreError is KeyLostFailure
              ? enKeyLostStrings
              : enStoreOpenFailedStrings,
        );
      }
      return const DayBoardScreen();
    }
    switch (controller.status) {
      case WebStoreStatus.checking:
      case WebStoreStatus.erasing:
        return const Scaffold(body: SizedBox.shrink());
      case WebStoreStatus.needsPassphraseCreation:
        return const CreatePassphraseScreen();
      case WebStoreStatus.locked:
        return const LockScreen();
      case WebStoreStatus.needsReset:
        return const KeyLostScreen(copy: enWebStoreUnreadableStrings);
      case WebStoreStatus.unlocked:
        return Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: (_) => controller.touch(),
          onPointerMove: (_) => controller.touch(),
          onPointerSignal: (_) => controller.touch(),
          child: const DayBoardScreen(),
        );
    }
  }
}
