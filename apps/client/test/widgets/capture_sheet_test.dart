// `CaptureSheet` widget tests (Story 1.6 / UX-DR7 / NFR7).
//
// Drives the sheet's three I/O-matrix scenarios:
//
//   * three tiles render with the spec-approved copy
//     (Snapshot / Scan a barcode / Type or talk);
//   * each tile tap closes the sheet and invokes only its callback;
//   * scrim dismiss closes the sheet without invoking any callback;
//   * every tile carries a ≥48px hit target (NFR7).
//
// The sheet is mounted via `showCaptureSheet` so the test exercises
// the real Material modal-bottom-sheet wiring (scrim, swipe-down,
// tap-outside). The test pumps `MediaQuery(disableAnimations: true)`
// at the root so the sheet's slide-up transition doesn't drag the
// timing assertions.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/capture_sheet.dart';

/// Drives the test widget tree with `disableAnimations` so the modal
/// bottom sheet opens in a single pump tick (no slide-up to wait on).
Future<void> _pumpSheet(
  WidgetTester tester, {
  required Future<void> Function(BuildContext) open,
}) async {
  await tester.pumpWidget(
    MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => Center(
              child: ElevatedButton(
                onPressed: () => open(ctx),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Find the GestureDetector that is the actual hit target for the tile
/// whose Semantics label is [label]. The tile's content (Icon + Text)
/// lives inside a Material/InkWell; we want the InkWell ancestor so
/// we can read its rendered size.
Finder _tileTapTarget(String label) {
  return find.ancestor(
    of: find.text(label),
    matching: find.byType(InkWell),
  );
}

void main() {
  group('CaptureSheet', () {
    testWidgets('renders three tiles with the spec-approved copy',
        (tester) async {
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () {},
          onScan: () {},
          onTypeOrTalk: () {},
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // All three tile labels render exactly once.
      expect(find.text('Snapshot'), findsOneWidget);
      expect(find.text('Scan a barcode'), findsOneWidget);
      expect(find.text('Type or talk'), findsOneWidget);

      // Sheet is on screen — the bottom-sheet Material route is in the
      // widget tree below the root MaterialApp.
      expect(find.byType(CaptureSheet), findsOneWidget);
    });

    testWidgets('Snapshot tile tap closes the sheet and invokes onSnapshot',
        (tester) async {
      var snap = 0;
      var scan = 0;
      var typeOrTalk = 0;
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () => snap++,
          onScan: () => scan++,
          onTypeOrTalk: () => typeOrTalk++,
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byType(CaptureSheet), findsOneWidget);

      await tester.tap(find.text('Snapshot'));
      await tester.pumpAndSettle();

      expect(snap, 1);
      expect(scan, 0);
      expect(typeOrTalk, 0);
      // Sheet has been popped.
      expect(find.byType(CaptureSheet), findsNothing);
    });

    testWidgets('Scan tile tap closes the sheet and invokes onScan',
        (tester) async {
      var snap = 0;
      var scan = 0;
      var typeOrTalk = 0;
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () => snap++,
          onScan: () => scan++,
          onTypeOrTalk: () => typeOrTalk++,
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Scan a barcode'));
      await tester.pumpAndSettle();

      expect(snap, 0);
      expect(scan, 1);
      expect(typeOrTalk, 0);
      expect(find.byType(CaptureSheet), findsNothing);
    });

    testWidgets('Type or talk tile tap closes the sheet and invokes onTypeOrTalk',
        (tester) async {
      var snap = 0;
      var scan = 0;
      var typeOrTalk = 0;
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () => snap++,
          onScan: () => scan++,
          onTypeOrTalk: () => typeOrTalk++,
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Type or talk'));
      await tester.pumpAndSettle();

      expect(snap, 0);
      expect(scan, 0);
      expect(typeOrTalk, 1);
      expect(find.byType(CaptureSheet), findsNothing);
    });

    testWidgets('scrim dismiss closes the sheet without invoking any callback',
        (tester) async {
      var snap = 0;
      var scan = 0;
      var typeOrTalk = 0;
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () => snap++,
          onScan: () => scan++,
          onTypeOrTalk: () => typeOrTalk++,
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byType(CaptureSheet), findsOneWidget);

      // Tap above the sheet (top of the screen) — the scrim swallows
      // it and pops the modal route without firing any tile callback.
      await tester.tapAt(const Offset(20, 20));
      await tester.pumpAndSettle();

      expect(snap, 0);
      expect(scan, 0);
      expect(typeOrTalk, 0);
      expect(find.byType(CaptureSheet), findsNothing);
    });

    testWidgets('every tile has a ≥48px hit target (NFR7)', (tester) async {
      await _pumpSheet(
        tester,
        open: (ctx) => showCaptureSheet(
          ctx,
          onSnapshot: () {},
          onScan: () {},
          onTypeOrTalk: () {},
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      for (final label in ['Snapshot', 'Scan a barcode', 'Type or talk']) {
        final tap = _tileTapTarget(label);
        expect(tap, findsOneWidget,
            reason: 'tile "$label" should expose one InkWell tap target');
        final size = tester.getSize(tap);
        expect(size.height, greaterThanOrEqualTo(AppTouchTargets.min),
            reason: 'tile "$label" height ${size.height} below 48px');
        expect(size.width, greaterThanOrEqualTo(AppTouchTargets.min),
            reason: 'tile "$label" width ${size.width} below 48px');
      }
    });

    testWidgets('dark mode: Snapshot tile uses AppPalette.dark.sageDeep',
        (tester) async {
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: MaterialApp(
            theme: ThemeData(brightness: Brightness.dark),
            home: Scaffold(
              backgroundColor: AppPalette.dark.background,
              body: Builder(
                builder: (ctx) => Center(
                  child: ElevatedButton(
                    onPressed: () => showCaptureSheet(
                      ctx,
                      onSnapshot: () {},
                      onScan: () {},
                      onTypeOrTalk: () {},
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // The Snapshot tile's dominant fill comes from the inner
      // `Material` (the sheet itself also has a `Material` for its
      // surface); the nearest `Material` ancestor of the Snapshot
      // label is the tile's sage-deep fill.
      final snapshotMaterial = find
          .ancestor(
            of: find.text('Snapshot'),
            matching: find.byType(Material),
          )
          .first;
      final materialColor = tester.widget<Material>(snapshotMaterial).color;
      expect(materialColor, AppPalette.dark.sageDeep,
          reason: 'dark Snapshot tile should fill with AppPalette.dark.sageDeep');
    });
  });
}
