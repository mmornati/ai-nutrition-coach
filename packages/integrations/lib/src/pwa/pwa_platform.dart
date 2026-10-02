// The installable-PWA seams (ADR-0003): service-worker updates, durable
// storage, and "install on your phone" help.
//
// Everything browser-specific hides behind these small interfaces so the UI
// (an update banner, a storage line, the Install screen) is testable on the
// Dart VM with plain fakes, and so non-web targets compile against inert
// stubs (`pwa_platform_stub.dart`) -- the factories below resolve by
// conditional import, exactly like `createStores`.
//
// Calm by construction (docs/no-dark-patterns-standard.md): nothing here
// pops a prompt by itself. The browser's install dialog is only ever opened
// from a button the user tapped on the Install screen, storage persistence
// is requested once after the user unlocked, and a pending update is only a
// signal the UI may show as one dismissible line.

import 'package:flutter/foundation.dart';

import 'pwa_platform_stub.dart'
    if (dart.library.js_interop) 'pwa_platform_web.dart'
    as impl;

// ── service-worker updates ───────────────────────────────────────────────

/// "A new version is ready": the new service worker is installed and
/// waiting.
abstract interface class AppUpdateSignal {
  /// `true` once a new version is installed and waiting to take over.
  ValueListenable<bool> get updateReady;

  /// Activate the waiting version and reload into it. The page reloads
  /// exactly once, after the browser reports the new worker is in control
  /// (`controllerchange`). Reloading locks the encrypted store, which the UI
  /// says plainly. No-op when nothing is waiting.
  Future<void> applyUpdate();
}

/// Never has an update (native builds, debug web, no service-worker
/// support).
class NoAppUpdateSignal implements AppUpdateSignal {
  const NoAppUpdateSignal();

  static final ValueNotifier<bool> _never = ValueNotifier<bool>(false);

  @override
  ValueListenable<bool> get updateReady => _never;

  @override
  Future<void> applyUpdate() async {}
}

/// A signal driven by hand: the seam tests (and the widget test of the
/// banner) use instead of a real service worker.
class ManualAppUpdateSignal implements AppUpdateSignal {
  final ValueNotifier<bool> _ready = ValueNotifier<bool>(false);

  /// How many times the user tapped "Reload".
  int applyCalls = 0;

  @override
  ValueListenable<bool> get updateReady => _ready;

  /// Pretend a new version finished installing.
  void markReady() => _ready.value = true;

  @override
  Future<void> applyUpdate() async => applyCalls++;
}

/// Registers the service worker (secure context + release build only) and
/// reports updates. Inert on native, on debug builds and when the browser
/// has no service workers.
AppUpdateSignal createAppUpdateSignal() => impl.createAppUpdateSignal();

// ── durable storage ──────────────────────────────────────────────────────

/// Whether the browser promises not to clear this site's data on its own.
enum StoragePersistence {
  /// `navigator.storage.persisted()` is true: protected from automatic
  /// clean-up.
  protected,

  /// The browser may clear the data if space runs low.
  notProtected,

  /// No storage API (native, old browser): nothing to say.
  unsupported,
}

abstract interface class StoragePersistenceSource {
  /// The current state without asking for anything.
  Future<StoragePersistence> status();

  /// Ask the browser to protect the data (`navigator.storage.persist()`),
  /// then report the resulting state. Safe to call repeatedly.
  Future<StoragePersistence> request();
}

/// `navigator.storage` on web; an inert `unsupported` source elsewhere.
StoragePersistenceSource createStoragePersistence() =>
    impl.createStoragePersistence();

/// A source with a fixed answer (tests, native).
class FixedStoragePersistence implements StoragePersistenceSource {
  FixedStoragePersistence(this.value, {this.afterRequest});

  StoragePersistence value;

  /// What `request()` leaves the state at (defaults to [value]).
  final StoragePersistence? afterRequest;

  /// How many times `request()` was called.
  int requests = 0;

  @override
  Future<StoragePersistence> status() async => value;

  @override
  Future<StoragePersistence> request() async {
    requests++;
    value = afterRequest ?? value;
    return value;
  }
}

// ── install help ─────────────────────────────────────────────────────────

/// Which "how do I install this" instructions apply.
enum InstallPlatform { ios, android, desktop }

/// Classify a browser from its user agent and touch points. iPadOS reports a
/// desktop Mac user agent, so "Macintosh with a touch screen" is iOS-like.
InstallPlatform detectInstallPlatform({
  required String userAgent,
  int maxTouchPoints = 0,
}) {
  final ua = userAgent.toLowerCase();
  if (ua.contains('iphone') || ua.contains('ipad') || ua.contains('ipod')) {
    return InstallPlatform.ios;
  }
  if (ua.contains('macintosh') && maxTouchPoints > 1) {
    return InstallPlatform.ios;
  }
  if (ua.contains('android')) return InstallPlatform.android;
  return InstallPlatform.desktop;
}

/// What the Install screen needs to know about where it is running.
class InstallContext {
  const InstallContext({required this.platform, required this.standalone});

  final InstallPlatform platform;

  /// Already running as an installed app (home-screen icon / app window).
  final bool standalone;
}

/// The Chromium "install this app" prompt, captured so a calm button on the
/// Install screen can offer it. Never shown by itself.
abstract interface class InstallPrompt implements Listenable {
  /// `true` while the browser has offered installation and the user has not
  /// accepted or dismissed it yet.
  bool get canPrompt;

  /// Open the browser's install dialog. Only call from a user tap.
  Future<void> prompt();
}

/// Never installable through a prompt (Safari, Firefox, native).
class NoInstallPrompt extends ChangeNotifier implements InstallPrompt {
  @override
  bool get canPrompt => false;

  @override
  Future<void> prompt() async {}
}

/// A prompt driven by hand (tests).
class ManualInstallPrompt extends ChangeNotifier implements InstallPrompt {
  bool _can = false;

  /// How many times the install dialog was requested.
  int prompts = 0;

  @override
  bool get canPrompt => _can;

  void offer() {
    _can = true;
    notifyListeners();
  }

  @override
  Future<void> prompt() async {
    prompts++;
    _can = false;
    notifyListeners();
  }
}

/// Starts listening for `beforeinstallprompt` immediately (the browser fires
/// it once, early) so it is still available when the user opens the Install
/// screen.
InstallPrompt createInstallPrompt() => impl.createInstallPrompt();

/// Where the app runs now (user agent + display mode).
InstallContext readInstallContext() => impl.readInstallContext();
