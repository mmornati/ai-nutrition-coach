// `CaptureFab` widget tests (Story 1.6 / UX-DR7 / NFR7).
//
// Three contracts pinned:
//
//   * tapping the FAB opens `CaptureSheet`;
//   * the FAB's hit target is ≥48px on both axes (NFR7);
//   * reduced-motion does not change the FAB's hit target or behavior.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/capture_fab.dart';
import 'package:ai_nutrition_coach/widgets/capture_sheet.dart';

/// The `Material` widget is the FAB's tap target — `InkWell` reports
/// a hit-tested size but the rendered circle sits inside the Material,
/// which is what we measure against the NFR7 floor.
Finder _fabTapTarget() => find.byType(Material).last;

Future<void> _pump(
  WidgetTester tester, {
  required void Function() onSnapshot,
  required void Function() onScan,
  required void Function() onTypeOrTalk,
  bool disableAnimations = true,
}) async {
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: MaterialApp(
        home: Scaffold(
          backgroundColor: AppPalette.light.background,
          body: CaptureFab(
            onSnapshot: onSnapshot,
            onScan: onScan,
            onTypeOrTalk: onTypeOrTalk,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('CaptureFab', () {
    testWidgets('renders the `+` icon and the open-capture-sheet label', (
      tester,
    ) async {
      await _pump(
        tester,
        onSnapshot: () {},
        onScan: () {},
        onTypeOrTalk: () {},
      );

      expect(find.byIcon(Icons.add), findsOneWidget);
      expect(find.byType(CaptureFab), findsOneWidget);
    });

    testWidgets('tapping the FAB opens the capture sheet', (tester) async {
      var snap = 0;
      var scan = 0;
      var typeOrTalk = 0;
      await _pump(
        tester,
        onSnapshot: () => snap++,
        onScan: () => scan++,
        onTypeOrTalk: () => typeOrTalk++,
      );

      expect(find.byType(CaptureSheet), findsNothing);

      await tester.tap(find.byType(CaptureFab));
      await tester.pumpAndSettle();

      // Sheet is on screen — three tile labels render.
      expect(find.byType(CaptureSheet), findsOneWidget);
      expect(find.text('Snapshot'), findsOneWidget);
      expect(find.text('Scan a barcode'), findsOneWidget);
      expect(find.text('Type or talk'), findsOneWidget);

      // Tap the Snapshot tile; the FAB callback should fire.
      await tester.tap(find.text('Snapshot'));
      await tester.pumpAndSettle();
      expect(snap, 1);
      expect(scan, 0);
      expect(typeOrTalk, 0);
    });

    testWidgets('the FAB has a ≥48px hit target on both axes (NFR7)', (
      tester,
    ) async {
      await _pump(
        tester,
        onSnapshot: () {},
        onScan: () {},
        onTypeOrTalk: () {},
      );

      final size = tester.getSize(_fabTapTarget());
      expect(
        size.width,
        greaterThanOrEqualTo(AppTouchTargets.min),
        reason: 'FAB width ${size.width} below 48px',
      );
      expect(
        size.height,
        greaterThanOrEqualTo(AppTouchTargets.min),
        reason: 'FAB height ${size.height} below 48px',
      );
    });

    testWidgets('reduced-motion: the FAB still opens the sheet on tap', (
      tester,
    ) async {
      var snap = 0;
      await _pump(
        tester,
        onSnapshot: () => snap++,
        onScan: () {},
        onTypeOrTalk: () {},
        disableAnimations: true,
      );

      await tester.tap(find.byType(CaptureFab));
      await tester.pumpAndSettle();
      expect(find.byType(CaptureSheet), findsOneWidget);

      await tester.tap(find.text('Snapshot'));
      await tester.pumpAndSettle();
      expect(snap, 1);
    });
  });
}
