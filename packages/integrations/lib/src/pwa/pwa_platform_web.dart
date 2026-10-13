// Browser implementation of `pwa_platform.dart` (compiled on web only).
//
// Service worker: `sw.js` (generated into the release bundle by
// `tools/generate_precache_manifest.dart`; see docs/pwa.md) is registered
// from here -- this is a same-origin script, so the strict CSP
// (`script-src 'self'`, no inline script) needs no relaxation -- and only in
// a RELEASE build on a SECURE context. A debug build never registers it, so
// `flutter run` is never served from a stale cache. The new worker installs
// and WAITS; this class only reports that it is waiting. Nothing activates
// until the user taps "Reload" and `applyUpdate` posts `SKIP_WAITING`.

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import 'pwa_platform.dart';

// Process-wide singletons: the provider scope restarts on every lock /
// unlock and must never register the worker or the install listener twice.
final AppUpdateSignal _updateSignal = _buildUpdateSignal();
final InstallPrompt _installPrompt = _WebInstallPrompt();

AppUpdateSignal createAppUpdateSignal() => _updateSignal;

AppUpdateSignal _buildUpdateSignal() {
  if (!kReleaseMode) return const NoAppUpdateSignal();
  if (!web.window.isSecureContext) return const NoAppUpdateSignal();
  if (!web.window.navigator.has('serviceWorker')) {
    return const NoAppUpdateSignal();
  }
  return _WebAppUpdateSignal();
}

class _WebAppUpdateSignal implements AppUpdateSignal {
  _WebAppUpdateSignal() {
    unawaited(_start());
  }

  final ValueNotifier<bool> _ready = ValueNotifier<bool>(false);
  web.ServiceWorkerRegistration? _registration;
  bool _hadController = false;
  bool _reloading = false;

  @override
  ValueListenable<bool> get updateReady => _ready;

  web.ServiceWorkerContainer get _container =>
      web.window.navigator.serviceWorker;

  void _reloadOnce() {
    if (_reloading) return;
    _reloading = true;
    web.window.location.reload();
  }

  Future<void> _start() async {
    try {
      // In EVERY tab, from the start: when a new worker takes control (this
      // tab's "Reload", or another tab's), reload once so the page runs the
      // build the worker serves. The first control of a page that had none
      // (first install, `clients.claim()`) is not an update: no reload.
      _hadController = _container.controller != null;
      _container.addEventListener(
        'controllerchange',
        ((web.Event _) {
          if (!_hadController) {
            _hadController = true;
            return;
          }
          _reloadOnce();
        }).toJS,
      );
      final registration = await _container
          .register(
            'sw.js'.toJS,
            web.RegistrationOptions(updateViaCache: 'none'),
          )
          .toDart;
      _registration = registration;
      registration.addEventListener(
        'updatefound',
        ((web.Event _) {
          final worker = registration.installing;
          if (worker == null) return;
          worker.addEventListener(
            'statechange',
            ((web.Event _) {
              if (worker.state == 'installed') _checkWaiting();
            }).toJS,
          );
        }).toJS,
      );
      _checkWaiting();
      // A long-lived installed app is rarely "navigated": look for a new
      // version whenever it comes back to the foreground.
      web.document.addEventListener(
        'visibilitychange',
        ((web.Event _) {
          if (web.document.visibilityState == 'visible') {
            unawaited(_update());
          }
        }).toJS,
      );
    } on Object {
      // No service worker (404 in a plain static host, blocked, private
      // mode): the app simply runs online-only, as before.
    }
  }

  Future<void> _update() async {
    try {
      await _registration?.update().toDart;
      _checkWaiting();
    } on Object {
      // Offline or the server is unreachable: try again next time.
    }
  }

  /// A waiting worker next to an ACTIVE controller is an update. (On the very
  /// first install there is no controller yet: that is not "a new version".)
  void _checkWaiting() {
    final registration = _registration;
    if (registration == null) return;
    if (registration.waiting != null && _container.controller != null) {
      _ready.value = true;
    }
  }

  @override
  Future<void> applyUpdate() async {
    final waiting = _registration?.waiting;
    if (waiting == null) {
      // Nothing is waiting (it already took over, or never installed): the
      // reload is what the user asked for, and it loads the current build.
      _reloadOnce();
      return;
    }
    // The page reloads on `controllerchange` (listener above). If the browser
    // never reports it, reload anyway after a while: the button must never be a
    // dead end.
    Timer(const Duration(seconds: 10), _reloadOnce);
    waiting.postMessage({'type': 'SKIP_WAITING'}.jsify());
  }
}

// ── durable storage ──────────────────────────────────────────────────────

StoragePersistenceSource createStoragePersistence() =>
    const _WebStoragePersistence();

class _WebStoragePersistence implements StoragePersistenceSource {
  const _WebStoragePersistence();

  web.StorageManager? get _manager {
    final navigator = web.window.navigator;
    return navigator.has('storage') ? navigator.storage : null;
  }

  @override
  Future<StoragePersistence> status() async {
    try {
      final manager = _manager;
      if (manager == null || !(manager as JSObject).has('persisted')) {
        return StoragePersistence.unsupported;
      }
      final persisted = await manager.persisted().toDart;
      return persisted.toDart
          ? StoragePersistence.protected
          : StoragePersistence.notProtected;
    } on Object {
      return StoragePersistence.unsupported;
    }
  }

  @override
  Future<StoragePersistence> request() async {
    try {
      final manager = _manager;
      if (manager != null && (manager as JSObject).has('persist')) {
        await manager.persist().toDart;
      }
    } on Object {
      // Refused or unavailable: the status below tells the truth.
    }
    return status();
  }
}

// ── install help ─────────────────────────────────────────────────────────

InstallPrompt createInstallPrompt() => _installPrompt;

class _WebInstallPrompt extends ChangeNotifier implements InstallPrompt {
  _WebInstallPrompt() {
    web.window.addEventListener(
      'beforeinstallprompt',
      ((web.Event event) {
        // Keep the browser from showing its own mini-infobar; the Install
        // screen offers the same thing, on the user's request only.
        event.preventDefault();
        _event = event;
        notifyListeners();
      }).toJS,
    );
    web.window.addEventListener(
      'appinstalled',
      ((web.Event _) {
        _event = null;
        notifyListeners();
      }).toJS,
    );
  }

  web.Event? _event;

  @override
  bool get canPrompt => _event != null;

  @override
  Future<void> prompt() async {
    final event = _event;
    if (event == null) return;
    // A prompt can only be used once.
    _event = null;
    notifyListeners();
    try {
      (event as JSObject).callMethod<JSAny?>('prompt'.toJS);
    } on Object {
      // The browser refused to show it; nothing else to do.
    }
  }
}

InstallContext readInstallContext() {
  final navigator = web.window.navigator;
  final platform = detectInstallPlatform(
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  );
  var standalone = false;
  try {
    standalone = web.window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone && navigator.has('standalone')) {
      // iOS Safari's non-standard flag.
      standalone =
          navigator.getProperty<JSBoolean?>('standalone'.toJS)?.toDart ?? false;
    }
  } on Object {
    standalone = false;
  }
  return InstallContext(platform: platform, standalone: standalone);
}
