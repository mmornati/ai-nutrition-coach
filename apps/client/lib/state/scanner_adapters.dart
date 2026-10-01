// Production adapters for the barcode seam (Story 1.7 / Patch H1).
//
// `MobileScannerBarcodeScanner` wraps `mobile_scanner`'s
// `MobileScannerController` into the `BarcodeScanner` port. The
// adapter owns the controller but does NOT call `start()` on it —
// the screen owns the controller lifecycle (start + stop) and feeds
// the same controller to both the `MobileScanner` widget and the
// adapter's `scan()` stream. This keeps exactly ONE `start()` call
// per scan session (Patch H1).
//
// `PermissionHandlerCameraPermission` wraps `permission_handler`'s
// `Permission.camera.request()` into the `CameraPermission` port.
// Three calm states map to the three screen surfaces (camera /
// denied copy / unavailable copy).
//
// Both adapters live next to `main.dart` so the wiring stays
// adjacent to the `ProviderScope` overrides — the production seam
// is small and the imports of `mobile_scanner` and
// `permission_handler` are confined to this file.
//
// FR13: no biometric identification anywhere on this path. The
// camera frame is processed locally for barcode decode only; the
// only thing sent off-device is the barcode string.

import 'dart:async';

import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

import '../state/scanner_provider.dart';

/// Phase 4 / N5 — keep barcode decoding fully local on the web.
///
/// `mobile_scanner`'s default web reader falls back, on browsers without the
/// native `BarcodeDetector` API (e.g. Firefox), to `zxing-wasm`, which it
/// downloads from cdn.jsdelivr.net at first use. That is a third-party script
/// load (blocked by the CSP, and contrary to the zero-third-party posture), so
/// the web build is pinned to the native detector. Where that API is missing
/// the scanner reports an error and the user types the barcode / uses manual
/// entry instead. No-op on Android/iOS (they use the platform ML kits).
void configureWebBarcodeReader() {
  MobileScannerPlatform.instance.setWebBarcodeReader(
    WebBarcodeReader.barcodeDetector,
  );
}

/// `BarcodeScanner` adapter — wraps `MobileScannerController` and
/// forwards each decoded code into the `BarcodeScanner` stream.
///
/// The adapter creates the controller in its constructor (so the
/// stream subscription is stable across `scan()` invocations) but
/// does NOT call `start()` on it. The screen reads [previewController]
/// and is responsible for `start()` / `stop()` (Patch H1 — only ONE
/// `start()` call per scan session, exactly one controller).
class MobileScannerBarcodeScanner implements BarcodeScanner {
  MobileScannerBarcodeScanner({MobileScannerController? controller})
    : _controller =
          controller ??
          MobileScannerController(
            // The screen processes one scan at a time; a noop
            // barrier keeps the controller from spamming duplicate
            // decodes while the match sheet is up.
            detectionSpeed: DetectionSpeed.normal,
            formats: const [
              BarcodeFormat.ean8,
              BarcodeFormat.ean13,
              BarcodeFormat.upcA,
              BarcodeFormat.upcE,
            ],
          );

  final MobileScannerController _controller;
  // ignore: close_sinks
  StreamController<BarcodeScan>? _broadcast;
  StreamSubscription<BarcodeCapture>? _sub;

  /// The `MobileScannerController` the screen feeds to the
  /// `MobileScanner` widget as `controller:`. The screen owns the
  /// start/stop/dispose lifecycle; the adapter only wraps
  /// `_controller.barcodes` into the `scan()` stream.
  @override
  MobileScannerController get previewController => _controller;

  @override
  Stream<BarcodeScan> scan() async* {
    // Closed in [dispose].
    // ignore: close_sinks
    final broadcast = _broadcast ??= StreamController<BarcodeScan>.broadcast(
      onListen: _attach,
      onCancel: _detach,
    );
    yield* broadcast.stream;
  }

  @override
  Future<void> stop() async {
    await _detach();
  }

  @override
  Future<void> pauseCamera() async {
    await _controller.stop();
  }

  @override
  Future<void> resumeCamera() async {
    await _controller.start();
  }

  /// Release everything the adapter owns: the stream subscription, the
  /// broadcast controller and the camera controller itself (F10 — it was
  /// created but never disposed). Called by the provider scope on dispose.
  Future<void> dispose() async {
    await _detach();
    final broadcast = _broadcast;
    _broadcast = null;
    if (broadcast != null && !broadcast.isClosed) {
      await broadcast.close();
    }
    await _controller.dispose();
  }

  void _attach() {
    // Patch H1: do NOT call `_controller.start()` here. The screen
    // owns the lifecycle and calls `start()` exactly once after the
    // camera permission is granted. Two controllers / two `start()`
    // calls against one physical camera was the production-conflict
    // bug this patch removes.
    _sub = _controller.barcodes.listen(_onBarcode);
  }

  Future<void> _detach() async {
    // Patch H1: do NOT call `_controller.stop()` here. The screen
    // owns the lifecycle and stops the controller on dispose.
    await _sub?.cancel();
    _sub = null;
  }

  void _onBarcode(BarcodeCapture capture) {
    final broadcast = _broadcast;
    if (broadcast == null || broadcast.isClosed) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw == null || raw.isEmpty) continue;
      broadcast.add(BarcodeScan(raw));
    }
  }
}

/// `CameraPermission` adapter — wraps `permission_handler`. The
/// three calm states the screen renders map to:
///   * `granted`     → `PermissionStatus.granted` / `.limited`
///   * `denied`      → `PermissionStatus.denied` / `.permanentlyDenied`
///   * `unavailable` → `PermissionStatus.restricted` / `.limited`
///                     / service returned `null`
class PermissionHandlerCameraPermission implements CameraPermission {
  const PermissionHandlerCameraPermission();

  @override
  Future<CameraPermissionStatus> request() async {
    final current = await Permission.camera.status;
    if (current.isGranted || current.isLimited) {
      return CameraPermissionStatus.granted;
    }
    final requested = await Permission.camera.request();
    return _map(requested);
  }

  CameraPermissionStatus _map(PermissionStatus status) {
    if (status.isGranted || status.isLimited) {
      return CameraPermissionStatus.granted;
    }
    if (status.isPermanentlyDenied || status.isDenied) {
      return CameraPermissionStatus.denied;
    }
    if (status.isRestricted) {
      return CameraPermissionStatus.unavailable;
    }
    return CameraPermissionStatus.unavailable;
  }
}
