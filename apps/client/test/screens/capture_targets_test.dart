// Tests for the placeholder capture screens + `UnimplementedCaptureTarget`
// (Story 1.6 / UX-DR7 / NFR7).
//
// Three contracts pinned:
//
//   * `UnimplementedCaptureTarget` is an immutable exception that
//     round-trips through `toString()` as `UnimplementedCaptureTarget(<name>)`
//     so the typed failure surfaces in dev error widgets and logs;
//   * `CapturePhotoScreen.build()` throws
//     `UnimplementedCaptureTarget(photo)` — the same value Story 1.8
//     will replace;
//   * `CaptureBarcodeScreen.build()` throws
//     `UnimplementedCaptureTarget(barcode)` — the same value Story 1.7
//     will replace.
//
// The placeholder screens do not render any UI — `build()` throws
// before layout, which surfaces as Flutter's red error widget in dev
// and an uncaught exception in production. The widget tests below
// route `FlutterError.onError` through `tester.takeException()` so
// we can inspect the typed exception without the test framework
// flagging it as a failure.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/screens/capture_barcode_screen.dart';
import 'package:openplate_client/screens/capture_photo_screen.dart';
import 'package:openplate_client/screens/capture_targets.dart';

/// Mount [child] inside a host tree and return whatever exception the
/// framework surfaces from its build pass. The framework reports
/// exceptions thrown by `build` through `FlutterError.onError`; we
/// park that callback on the test binding so `takeException` captures
/// it without the test framework flagging a failure.
Future<Object?> _captureBuildException(
  WidgetTester tester,
  Widget child,
) async {
  await tester.pumpWidget(
    MaterialApp(home: child),
  );
  return tester.takeException();
}

void main() {
  group('UnimplementedCaptureTarget', () {
    test('is an Exception with the typed target', () {
      const ex = UnimplementedCaptureTarget(CaptureTarget.photo);
      expect(ex, isA<Exception>());
      expect(ex.target, CaptureTarget.photo);
    });

    test('toString includes the target name for log readability', () {
      expect(
        const UnimplementedCaptureTarget(CaptureTarget.photo).toString(),
        'UnimplementedCaptureTarget(photo)',
      );
      expect(
        const UnimplementedCaptureTarget(CaptureTarget.barcode).toString(),
        'UnimplementedCaptureTarget(barcode)',
      );
    });

    testWidgets('CapturePhotoScreen.build throws UnimplementedCaptureTarget(photo)',
        (tester) async {
      final captured = await _captureBuildException(
        tester,
        const CapturePhotoScreen(),
      );
      expect(captured, isA<UnimplementedCaptureTarget>());
      final ex = captured! as UnimplementedCaptureTarget;
      expect(ex.target, CaptureTarget.photo);
    });

    testWidgets('CaptureBarcodeScreen.build throws UnimplementedCaptureTarget(barcode)',
        (tester) async {
      final captured = await _captureBuildException(
        tester,
        const CaptureBarcodeScreen(),
      );
      expect(captured, isA<UnimplementedCaptureTarget>());
      final ex = captured! as UnimplementedCaptureTarget;
      expect(ex.target, CaptureTarget.barcode);
    });
  });
}