// Tests for the capture routing helpers + `UnimplementedCaptureTarget`
// (Stories 1.6 / 1.7 / 1.8 / UX-DR7 / NFR7).
//
// Contract pinned: `UnimplementedCaptureTarget` is an immutable exception
// that round-trips through `toString()` as
// `UnimplementedCaptureTarget(<name>)` so the typed failure surfaces in dev
// error widgets and logs. (The real screens are covered by their own tests.)

import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/capture_targets.dart';

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
  });
}
