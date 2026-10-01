// `CaptureBarcodeScreen` widget tests (Story 1.7 / FR2 / NFR7).
//
// The screen mounts `MobileScanner` in production; the test
// substitutes a `FakeBarcodeScanner` so the suite stays hermetic
// and exercises the I/O matrix the spec calls out:
//
//   * HAPPY_PATH_KNOWN — `RankedMatches([single match])` from the
//     catalog opens the `BarcodeMatchSheet` with the matched food
//     + a `~1 serving` placeholder preset.
//   * UNKNOWN_BARCODE — `NotFoundFailure` shows the "Not found"
//     dialog with a tap-to-type affordance that pushes
//     `ManualEntryScreen` with the code pre-filled.
//   * CATALOG_FAILURE — `CatalogFailure` renders the calm "Search
//     isn't available right now" line + a tap-to-type affordance.
//   * PERMISSION_DENIED — `CameraPermissionStatus.denied` renders
//     "Camera denied — type it instead" with a tap-to-type button.
//   * CAMERA_INIT_FAILURE — `CameraPermissionStatus.unavailable`
//     renders "Camera unavailable — type it instead".
//   * MULTI_SCAN — two back-to-back scans process sequentially;
//     the previous sheet is awaited before the next scan lands.
//
// Tests inject a `_FakeFoodCatalog` that records calls and
// returns the result the test configures. The
// `FakeEncryptedStore` from `test/_fakes/` backs the commit path.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/capture_barcode_screen.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/manual_entry_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/scanner_provider.dart';
import 'package:ai_nutrition_coach/widgets/barcode_match_sheet.dart';

import '../_fakes/fake_encrypted_store.dart';

class _FakeFoodCatalog implements FoodCatalog {
  _FakeFoodCatalog(this._byCode);
  final Map<String, CatalogResult> _byCode;
  final List<String> calls = <String>[];

  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async =>
      const NotFoundFailure('');

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async {
    calls.add(code);
    return _byCode[code] ?? NotFoundFailure(code);
  }
}

Widget _wrap(
  Widget child, {
  required FakeEncryptedStore store,
  required FakeBarcodeScanner scanner,
  required FakeCameraPermission permission,
  required FoodCatalog catalog,
  ThemeMode mode = ThemeMode.light,
  bool detectorAvailable = true,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      foodCatalogProvider.overrideWithValue(catalog),
      barcodeScannerProvider.overrideWithValue(scanner),
      cameraPermissionProvider.overrideWithValue(permission),
      barcodeDetectorAvailableProvider.overrideWithValue(detectorAvailable),
      // Story 2.2: the record-plate chain now requires the coach
      // providers to be overridden — wire them so the test path can
      // drive `RecordPlate` end-to-end.
      coachProvider.overrideWithValue(FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
    ],
    child: MaterialApp(
      themeMode: mode,
      theme: ThemeData(brightness: Brightness.light),
      darkTheme: ThemeData(brightness: Brightness.dark),
      home: child,
    ),
  );
}

const _nutella = FoodMatch(
  food: DatabaseFood(
    sourceRef: '3017620422003',
    displayName: 'Nutella',
    source: SourceCatalog.off,
    foodGroup: FoodGroup.other,
  ),
  confidence: 1.0,
  presets: <QuantityRange>[],
);

void main() {
  testWidgets(
    'no local barcode detector -> manual-entry copy, camera never requested',
    (tester) async {
      final permission = FakeCameraPermission();
      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: FakeEncryptedStore(),
          scanner: FakeBarcodeScanner(),
          permission: permission,
          catalog: _FakeFoodCatalog(const {}),
          detectorAvailable: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining("isn't available in this browser"),
        findsOneWidget,
      );
      expect(find.text('Type it manually'), findsWidgets);
      expect(permission.requestCount, 0);
    },
  );

  group('CaptureBarcodeScreen', () {
    testWidgets(
      'HAPPY_PATH_KNOWN: scan + RankedMatches opens BarcodeMatchSheet',
      (tester) async {
        final store = FakeEncryptedStore();
        addTearDown(store.close);
        final scanner = FakeBarcodeScanner();
        addTearDown(scanner.stop);
        final permission = FakeCameraPermission();
        final catalog = _FakeFoodCatalog({
          '3017620422003': const RankedMatches([_nutella]),
        });

        await tester.pumpWidget(
          _wrap(
            const CaptureBarcodeScreen(),
            store: store,
            scanner: scanner,
            permission: permission,
            catalog: catalog,
          ),
        );
        // Let permission request + scanner mount settle.
        await tester.pumpAndSettle();

        scanner.emit('3017620422003');
        // Lookup microtask + UI re-render.
        await tester.pumpAndSettle();

        // The match sheet is up — its title block carries the food
        // name + group label and the Log button is enabled.
        expect(find.text('Nutella'), findsOneWidget);
        expect(find.text('Other'), findsOneWidget);
        expect(find.text('Log'), findsOneWidget);

        // Catalog saw exactly one lookup.
        expect(catalog.calls, ['3017620422003']);

        // Tap Log — commits through RecordPlate + pops back.
        await tester.tap(find.text('Log'));
        await tester.pumpAndSettle();

        expect(store.capturedDrafts, hasLength(1));
        final draft = store.capturedDrafts.single;
        expect(draft.databaseFood.displayName, 'Nutella');
        expect(draft.databaseFood.sourceRef, '3017620422003');
        expect(draft.quantity.unit, 'serving');
      },
    );

    testWidgets('UNKNOWN_BARCODE: NotFoundFailure renders the "Not found" '
        'dialog with a tap-to-type affordance', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final scanner = FakeBarcodeScanner();
      addTearDown(scanner.stop);
      final permission = FakeCameraPermission();
      final catalog = _FakeFoodCatalog({
        '0000000000000': const NotFoundFailure('0000000000000'),
      });

      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: store,
          scanner: scanner,
          permission: permission,
          catalog: catalog,
        ),
      );
      await tester.pumpAndSettle();

      scanner.emit('0000000000000');
      await tester.pumpAndSettle();

      // The "Not found" dialog surfaces.
      expect(find.text('Not found'), findsOneWidget);
      expect(find.textContaining('This barcode isn'), findsOneWidget);
      // Dialog button is present (alongside the AppBar tooltip, so
      // use the dialog-scoped finder for the button).
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Type it manually'),
        ),
        findsOneWidget,
      );

      // Tap "Type it manually" — pushes `ManualEntryScreen`.
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Type it manually'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(BarcodeMatchSheet), findsNothing);
      // The screen pushes ManualEntryScreen — its scaffold title is
      // "Add a food" (Story 1.5's surface).
      expect(find.text('Add a food'), findsOneWidget);
    });

    testWidgets('CATALOG_FAILURE: calm failure line renders with a '
        'tap-to-type affordance', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final scanner = FakeBarcodeScanner();
      addTearDown(scanner.stop);
      final permission = FakeCameraPermission();
      final catalog = _FakeFoodCatalog({
        '3017620422003': const CatalogFailure('OFF HTTP 500'),
      });

      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: store,
          scanner: scanner,
          permission: permission,
          catalog: catalog,
        ),
      );
      await tester.pumpAndSettle();

      scanner.emit('3017620422003');
      await tester.pumpAndSettle();

      // Calm copy — no retry button, no countdown (FR15 / UX-DR10).
      expect(find.text("Search isn't available right now."), findsOneWidget);
      // Manual entry still works.
      expect(find.text('Type it manually'), findsOneWidget);
    });

    testWidgets('PERMISSION_DENIED: "Camera denied — type it instead" '
        'renders with a tap-to-type button', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final scanner = FakeBarcodeScanner();
      addTearDown(scanner.stop);
      final permission = FakeCameraPermission(CameraPermissionStatus.denied);
      final catalog = _FakeFoodCatalog({});

      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: store,
          scanner: scanner,
          permission: permission,
          catalog: catalog,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Camera denied — type it instead'), findsOneWidget);
      // No nag, no retry button (NFR7).
      expect(find.widgetWithText(FilledButton, 'Retry'), findsNothing);
      expect(find.text('Type it manually'), findsOneWidget);
    });

    testWidgets('CAMERA_INIT_FAILURE: "Camera unavailable — type it instead"', (
      tester,
    ) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final scanner = FakeBarcodeScanner();
      addTearDown(scanner.stop);
      final permission = FakeCameraPermission(
        CameraPermissionStatus.unavailable,
      );
      final catalog = _FakeFoodCatalog({});

      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: store,
          scanner: scanner,
          permission: permission,
          catalog: catalog,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Camera unavailable — type it instead'), findsOneWidget);
      expect(find.text('Type it manually'), findsOneWidget);
    });

    testWidgets('MULTI_SCAN: two back-to-back scans process sequentially; '
        'previous sheet is awaited before the next scan lands', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final scanner = FakeBarcodeScanner();
      addTearDown(scanner.stop);
      final permission = FakeCameraPermission();
      final catalog = _FakeFoodCatalog({
        '3017620422003': const RankedMatches([_nutella]),
        '737628064502': const NotFoundFailure('737628064502'),
      });

      await tester.pumpWidget(
        _wrap(
          const CaptureBarcodeScreen(),
          store: store,
          scanner: scanner,
          permission: permission,
          catalog: catalog,
        ),
      );
      await tester.pumpAndSettle();

      // First scan — match sheet opens.
      scanner.emit('3017620422003');
      await tester.pumpAndSettle();
      expect(find.byType(BarcodeMatchSheet), findsOneWidget);

      // Tap Log — sheet pops, back to scanner.
      await tester.tap(find.text('Log'));
      await tester.pumpAndSettle();
      expect(find.byType(BarcodeMatchSheet), findsNothing);

      // Second scan — not-found dialog opens. No two sheets stack
      // at any point (FR2 I/O matrix).
      scanner.emit('737628064502');
      await tester.pumpAndSettle();
      expect(find.byType(BarcodeMatchSheet), findsNothing);
      expect(find.text('Not found'), findsOneWidget);

      // Dismiss the dialog — back to scanner.
      await tester.tap(find.text('Scan again'));
      await tester.pumpAndSettle();

      // Both lookups were observed by the catalog, in order.
      expect(catalog.calls, ['3017620422003', '737628064502']);
    });
  });
}
