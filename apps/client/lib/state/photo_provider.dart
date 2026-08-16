// Photo-capture seams for the Story 1.8 surface (FR1 / AD-5 / FR13).
//
// The screen mounts `image_picker` in production; tests inject a
// `FakePhotoCapture` so the suite stays hermetic and never touches
// the camera. The provider is the single Riverpod seam — the screen
// reads `photoCaptureProvider` and dispatches the result through
// `recognitionProvider` (a `FutureProvider.family` keyed on the
// latest photo bytes).
//
// AD-1: `image_picker` lives ONLY in `apps/client/`; the domain
// core never imports it (the grep test in
// `packages/domain_core/test/domain_core_test.dart` enforces this).
// The port shape here is intentionally small — `Future<Uint8List?>`
// with `null` for both user cancellation and permission denial — so
// the screen renders the calm copy in either case without
// inspecting platform strings.
//
// `aiRungProvider` is the production seam for the active rung.
// `main.dart` overrides it with `NoopAiRung()`; tests inject a
// `FakeAiRung` that records calls and returns a configured result.
//
// `recognitionProvider` is the future-driven side of the dispatch:
// the screen triggers a fresh `recognize` call on every successful
// capture and cancels the previous future if a new capture arrives
// before the previous one lands (the multi-shot I/O matrix).
//
// Riverpod 3.x puts `StateProvider` in `legacy.dart`; the ephemeral
// capture state lives here for parity with the manual-entry
// notifier shape.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:image_picker/image_picker.dart';

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

/// `AiRung` seam — overridden in `main.dart` with `NoopAiRung()`
/// (Story 1.8 v1 active rung). Tests inject a `FakeAiRung` that
/// records `recognize` calls and returns a configured
/// `RecognitionResult`.
final aiRungProvider = Provider<AiRung>(
  (ref) => throw UnimplementedError(
    'aiRungProvider must be overridden at the ProviderScope root '
    'with the result of `NoopAiRung()` — see apps/client/lib/main.dart.',
  ),
);

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

/// Holds the latest captured photo bytes. `null` until the user
/// captures a photo. The screen reads this to drive the
/// `recognitionProvider` family lookup.
final lastPhotoBytesProvider = StateProvider<Uint8List?>((_) => null);

/// Family-keyed recognition call. The screen reads
/// `ref.read(recognitionProvider(bytes).future)` after a capture
/// lands; the family auto-disposes so a second capture triggers a
/// fresh `AiRung.recognize` call even if the previous one has not
/// landed yet (the multi-shot I/O matrix — only the latest
/// recognition lands on screen).
final recognitionProvider = FutureProvider.autoDispose
    .family<RecognitionResult, Uint8List>((ref, bytes) async {
  final rung = ref.watch(aiRungProvider);
  return rung.recognize(bytes);
});

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
  // ignore: prefer_initializing_formals
  const ImagePickerPhotoCapture({ImagePicker? picker}) : _picker = picker;

  final ImagePicker? _picker;

  @override
  Future<Uint8List?> capture() async {
    final picker = _picker ?? ImagePicker();
    final file = await picker.pickImage(source: ImageSource.camera);
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    return bytes;
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
