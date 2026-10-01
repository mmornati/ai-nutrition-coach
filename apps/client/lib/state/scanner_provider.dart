// Camera + permission ports for the barcode scan surface (Story 1.7).
//
// The screen mounts `mobile_scanner` and `permission_handler` in
// production, but tests must inject a `FakeBarcodeScanner` /
// `FakeCameraPermission` so the widget tests stay hermetic — no
// real camera frame, no real permission grant. Both ports live in
// the UI package because the real adapters pull in
// `mobile_scanner` + `permission_handler`; if they lived in
// `packages/integrations` the AD-1 grep test would have to permit
// those imports there, which it does not (AD-1 forbids
// `mobile_scanner` in the domain layer too).
//
// The two ports are intentionally small:
//   * `BarcodeScanner.scan()` returns a `Stream<BarcodeScan>` — a
//     single-emission stream per scan (the screen mounts a fresh
//     `MobileScanner` on each "process one at a time" round).
//   * `CameraPermission.request()` returns a
//     `Future<CameraPermissionStatus>` with three states (granted /
//     denied / unavailable) so the screen renders calm copy without
//     inspecting platform strings.
//
// The naming avoids `Permission` and `Barcode` as top-level types
// because both collide with the underlying plugin types;
// `BarcodeScan` is the *event* shape, not the SDK type.
//
// The Riverpod wiring is also in this file:
//   * `barcodeScannerProvider` — overridden in `main.dart` with the
//     production `MobileScannerBarcodeScanner` (see
//     `capture_barcode_screen.dart`). Tests override with a
//     `FakeBarcodeScanner`.
//   * `cameraPermissionProvider` — same pattern, default
//     `PermissionHandlerCameraPermission`.
//   * `barcodeLookupProvider` — `FutureProvider.family<String,
//     CatalogResult>` so the screen subscribes once and pattern-
//     matches on the sealed result.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'manual_entry_provider.dart';

/// One scan result. [code] is the verbatim barcode string the
/// scanner produced. The screen pipes it straight into the
/// `FoodCatalog.lookupByBarcode` port.
class BarcodeScan {
  const BarcodeScan(this.code);
  final String code;
}

/// Coarse-grained camera permission state. Distinct from the
/// `permission_handler` enum (which has more states) because the
/// UI only needs three calm paths: show the camera, show the
/// "Camera denied — type it instead" copy, or show the
/// "Camera unavailable — type it instead" copy.
enum CameraPermissionStatus { granted, denied, unavailable }

/// Barcode scanner port. Adapters wrap the underlying SDK and emit
/// a single `BarcodeScan` per successful decode. Tests inject a
/// `FakeBarcodeScanner` that pushes canned codes on demand.
abstract interface class BarcodeScanner {
  /// The `MobileScannerController` the screen feeds to the
  /// `MobileScanner` widget as `controller:`. The screen owns the
  /// start/stop/dispose lifecycle; the adapter only wraps
  /// `controller.barcodes` into [scan]. Returns `null` for fakes /
  /// any adapter that doesn't drive a real camera preview (Patch
  /// H1 — one controller, one `start()` call).
  MobileScannerController? get previewController;

  /// Begin scanning. Emits a `BarcodeScan` per barcode decoded; the
  /// caller is responsible for cancelling the subscription when it
  /// wants to stop processing.
  Stream<BarcodeScan> scan();

  /// Stop scanning. Idempotent; safe to call after [scan] has been
  /// cancelled by the caller.
  Future<void> stop();
}

/// Camera permission port. Adapters wrap `permission_handler`'s
/// cross-platform surface and surface the three calm states the
/// screen renders. Tests inject a `FakeCameraPermission`.
abstract interface class CameraPermission {
  /// Request camera permission. Returns the resolved status; the
  /// first call may show the OS prompt; subsequent calls return the
  /// cached status without re-prompting.
  Future<CameraPermissionStatus> request();
}

/// Test double — pushes pre-canned barcode strings on demand. Tests
/// call [emit] to drive the screen through the happy / not-found /
/// catalogue-failure paths without ever mounting a real camera.
///
/// Returns `null` for [previewController] so the screen falls back
/// to a calm placeholder instead of mounting `MobileScanner` (Patch
/// H1 — no real camera in the test environment).
class FakeBarcodeScanner implements BarcodeScanner {
  FakeBarcodeScanner({StreamController<BarcodeScan>? controller})
    : _controller = controller ?? StreamController<BarcodeScan>.broadcast();

  final StreamController<BarcodeScan> _controller;
  bool _stopped = false;

  /// Push a single barcode to subscribers. Used by tests to simulate
  /// a successful decode after the screen has mounted the scanner.
  void emit(String code) {
    if (_stopped) return;
    _controller.add(BarcodeScan(code));
  }

  @override
  MobileScannerController? get previewController => null;

  @override
  Stream<BarcodeScan> scan() async* {
    yield* _controller.stream;
  }

  @override
  Future<void> stop() async {
    if (_stopped) return;
    _stopped = true;
    if (!_controller.isClosed) {
      await _controller.close();
    }
  }
}

/// Test double — defaults to [CameraPermissionStatus.granted] so the
/// happy-path tests don't have to seed a response; tests override
/// via [setStatus] when they want to exercise the denied /
/// unavailable paths.
class FakeCameraPermission implements CameraPermission {
  FakeCameraPermission([
    CameraPermissionStatus initial = CameraPermissionStatus.granted,
  ]) : _status = initial;

  CameraPermissionStatus _status;
  int requestCount = 0;

  void setStatus(CameraPermissionStatus status) {
    _status = status;
  }

  @override
  Future<CameraPermissionStatus> request() async {
    requestCount++;
    return _status;
  }
}

/// `BarcodeScanner` seam — overridden at the `ProviderScope` root
/// in `main.dart` with the production `mobile_scanner`-backed
/// adapter; tests inject a `FakeBarcodeScanner`.
final barcodeScannerProvider = Provider<BarcodeScanner>(
  (ref) => throw UnimplementedError(
    'barcodeScannerProvider must be overridden at the ProviderScope root '
    'with the production mobile_scanner adapter or a test fake — see '
    'apps/client/lib/main.dart.',
  ),
);

/// `CameraPermission` seam — overridden at the `ProviderScope` root
/// in `main.dart` with the production `permission_handler`-backed
/// adapter; tests inject a `FakeCameraPermission`.
final cameraPermissionProvider = Provider<CameraPermission>(
  (ref) => throw UnimplementedError(
    'cameraPermissionProvider must be overridden at the ProviderScope root '
    'with the production permission_handler adapter or a test fake — see '
    'apps/client/lib/main.dart.',
  ),
);

/// Whether this platform can decode a barcode locally (see
/// `barcode_detector_support.dart`). `main.dart` overrides it with the real
/// capability probe; tests override it to exercise the "no detector" path.
/// Defaults to `true` so existing screens/tests are unaffected.
final barcodeDetectorAvailableProvider = Provider<bool>((ref) => true);

/// Family-keyed barcode lookup. The screen calls
/// `ref.read(barcodeLookupProvider(code).future)` after a scan and
/// pattern-matches the sealed `CatalogResult` to drive the next
/// surface (match sheet / not-found affordance / calm failure line).
///
/// The `autoDispose` family key matches the `String` parameter, so
/// re-scanning the same barcode never re-hits OFF while the
/// `CatalogResult` is in scope — the underlying
/// `OfflineFirstFoodCatalog` already memoises on the catalog side,
/// but the family key keeps the surface clean.
final barcodeLookupProvider = FutureProvider.autoDispose
    .family<CatalogResult, String>((ref, code) async {
      final catalog = ref.watch(foodCatalogProvider);
      return catalog.lookupByBarcode(code);
    });

/// Holds the most recent scanned barcode. Drives the `lookupByBarcode`
/// invocation on the screen. Empty string means "no scan yet".
final lastScannedBarcodeProvider = StateProvider<String>((_) => '');
