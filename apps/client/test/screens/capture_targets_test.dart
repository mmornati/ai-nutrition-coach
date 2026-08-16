// Tests for the capture routing helpers + `UnimplementedCaptureTarget`
// (Stories 1.6 / 1.7 / 1.8 / UX-DR7 / NFR7).
//
// Three contracts pinned:
//
//   * `UnimplementedCaptureTarget` is an immutable exception that
//     round-trips through `toString()` as `UnimplementedCaptureTarget(<name>)`
//     so the typed failure surfaces in dev error widgets and logs;
//   * `CaptureBarcodeScreen` is the real `mobile_scanner`-backed flow
//     (Story 1.7 replaced the placeholder);
//   * `CapturePhotoScreen` is the real `image_picker`-backed flow
//     (Story 1.8 replaced the placeholder).
//
// Story 1.6's placeholder throw is no longer on the surface for
// either entry — the tests below reflect the post-1.8 state.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/screens/capture_barcode_screen.dart';
import 'package:openplate_client/screens/capture_photo_screen.dart';
import 'package:openplate_client/screens/capture_targets.dart';

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
      // Story 1.7 — the barcode target no longer ships as a
      // placeholder throw; the string contract is still useful so
      // a future regression that re-introduces the placeholder is
      // loud in the logs.
      expect(
        const UnimplementedCaptureTarget(CaptureTarget.barcode).toString(),
        'UnimplementedCaptureTarget(barcode)',
      );
    });

    testWidgets('CapturePhotoScreen is the real flow (Story 1.8 / FR1)',
        (tester) async {
      // Story 1.8 replaced the 1.6 placeholder with the real
      // `image_picker`-backed flow (FR1). The probe here just
      // asserts the class still resolves at the import surface —
      // a future regression that breaks the import is loud at test
      // time; the behavioural coverage lives in
      // `test/screens/capture_photo_screen_test.dart`.
      expect(const CapturePhotoScreen(), isA<Widget>());
    });

    test('CaptureBarcodeScreen is the real flow (Story 1.7 / FR2)', () {
      // Patch L1 — the probe class's `realScreenExists` was
      // hard-coded to `true` (tautological). The real surface lives
      // at `apps/client/lib/screens/capture_barcode_screen.dart` and
      // is exercised end-to-end under
      // `test/screens/capture_barcode_screen_test.dart`. This test
      // pins the contract: the class still resolves at the import
      // surface, so a future regression that breaks the import is
      // loud at test time.
      expect(const CaptureBarcodeScreen(), isA<Widget>());
    });
  });
}