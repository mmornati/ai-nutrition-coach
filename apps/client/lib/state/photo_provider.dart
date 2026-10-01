// Photo-capture seams for the Story 1.8 surface (FR1 / AD-5 / FR13).
//
// The screen mounts `image_picker` in production; tests inject a
// `FakePhotoCapture` so the suite stays hermetic and never touches
// the camera. The provider is the single Riverpod seam — the screen
// reads `photoCaptureProvider` and dispatches the result through
// the active rung (`aiRungProvider`).
//
// AD-1: `image_picker` lives ONLY in `apps/client/`; the domain
// core never imports it (the grep test in
// `packages/domain_core/test/domain_core_test.dart` enforces this).
// The port shape here is intentionally small — `Future<Uint8List?>`
// with `null` for both user cancellation and permission denial — so
// the screen renders the calm copy in either case without
// inspecting platform strings.
//
// The active rung is `aiRungProvider` in `ai_rung_provider.dart` — the
// config-driven one. (This file used to define a second, throwing
// `aiRungProvider` that the photo screen imported, so photo recognition
// could never run: security review F1. It is gone; tests override the real
// one.)
//
// Privacy (N1 / N10): the captured bytes are NOT retained anywhere after
// the recognition call — there is no "last photo" provider. The capture
// adapter asks the picker to downscale (max 1024 px, quality 80); the
// metadata strip and MIME detection happen at the upload point
// (`sanitizePhotoForUpload`), which is where the guarantee is enforced.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'scanner_adapters.dart' show PermissionHandlerCameraPermission;
import 'scanner_provider.dart' show CameraPermission, CameraPermissionStatus;

/// Photo-capture port. The production adapter wraps `image_picker`'s
/// `ImagePicker().pickImage(source: ImageSource.camera)`; tests
/// inject a `FakePhotoCapture` that returns canned bytes.
///
/// Returns:
///   * the photo bytes on success.
///   * `null` when the user cancels the picker.
///   * `null` when the OS denies the camera permission — the
///     distinction is deliberately collapsed so the screen renders
///     the same calm copy in both cases (NFR7 — no nag, no retry).
abstract interface class PhotoCapture {
  /// Open the system camera UI and capture a single photo.
  /// Returns the raw photo bytes or `null` on cancellation /
  /// permission denial.
  Future<Uint8List?> capture();
}

/// `PhotoCapture` seam — overridden in `main.dart` with the
/// production `ImagePickerPhotoCapture`. Tests inject a
/// `FakePhotoCapture`.
final photoCaptureProvider = Provider<PhotoCapture>(
  (ref) => throw UnimplementedError(
    'photoCaptureProvider must be overridden at the ProviderScope root '
    'with the production `ImagePickerPhotoCapture` or a test fake — see '
    'apps/client/lib/main.dart.',
  ),
);

/// Production `PhotoCapture` adapter — wraps `image_picker`. The
/// adapter uses `ImageSource.camera` so the user lands on the OS
/// camera UI; `pickImage` returns `null` when the user cancels or
/// the OS denies the permission prompt. We do not distinguish the
/// two (NFR7 — same calm copy either way).
class ImagePickerPhotoCapture implements PhotoCapture {
  /// Optional injection seam for tests. Production callers leave
  /// [picker] `null` and the constructor falls back to
  /// `ImagePicker()` at call time so the field stays nullable but
  /// is read fresh on every `capture()` call.
  const ImagePickerPhotoCapture({
    this._picker,
    this._permission = const PermissionHandlerCameraPermission(),
  });

  final ImagePicker? _picker;

  /// Asked BEFORE the picker opens. On Android the CAMERA permission is
  /// declared (merged from mobile_scanner's manifest), so image_picker's
  /// camera intent throws a SecurityException unless it has been granted at
  /// runtime. A refusal collapses to `null` — the same calm copy as a cancel.
  final CameraPermission _permission;

  @override
  Future<Uint8List?> capture() async {
    final status = await _permission.request();
    if (status != CameraPermissionStatus.granted) return null;
    final picker = _picker ?? ImagePicker();
    // N1: ask the platform to downscale and re-encode. This reduces what is
    // uploaded, but is NOT relied on to drop EXIF (the Android plugin copies
    // EXIF back onto the resized file): `sanitizePhotoForUpload` strips
    // metadata at the point of upload. `requestFullMetadata: false` avoids
    // asking iOS for photo-library (location) access just to read a photo.
    final file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 80,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    return file.readAsBytes();
  }
}

/// Test double — returns a configured `Uint8List` on demand.
/// Tests call [emitSuccess] / [emitCancel] to drive the screen
/// through the happy / cancellation / permission paths without ever
/// mounting a real camera.
class FakePhotoCapture implements PhotoCapture {
  FakePhotoCapture();

  Uint8List? _next;
  final List<int> captureCalls = <int>[];

  /// Push a successful capture. The next [capture] call resolves
  /// with [bytes]; subsequent calls default to `null` again unless
  /// [emitSuccess] is called again.
  void emitSuccess(Uint8List bytes) {
    _next = bytes;
  }

  /// Push a cancellation. The next [capture] call resolves with
  /// `null`; used to test the "user cancelled" calm path.
  void emitCancel() {
    _next = null;
  }

  @override
  Future<Uint8List?> capture() async {
    captureCalls.add(1);
    final next = _next;
    _next = null;
    return next;
  }
}

/// Test double — records every `recognize` call and returns a
/// configured result. Defaults to the v1 `NoopAiRung` shape (empty
/// `RecognizedPlate`) so tests that do not configure a result still
/// exercise the closest-matches + manual fallback surface.
class FakeAiRung implements AiRung {
  FakeAiRung();

  final List<Uint8List> calls = <Uint8List>[];
  RecognitionResult _next = const RecognizedPlate(foods: []);

  /// Configure the next [recognize] call's return value. The result
  /// is consumed once and then reverts to the default
  /// (empty `RecognizedPlate`).
  void emit(RecognitionResult result) {
    _next = result;
  }

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    calls.add(photoBytes);
    final next = _next;
    _next = const RecognizedPlate(foods: []);
    return next;
  }
}
