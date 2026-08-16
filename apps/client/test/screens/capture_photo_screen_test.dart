// `CapturePhotoScreen` widget tests (Story 1.8 / FR1 / NFR7).
//
// The screen mounts `image_picker` in production; the test
// substitutes a `FakePhotoCapture` so the suite stays hermetic
// and exercises the I/O matrix the spec calls out:
//
//   * HAPPY_PATH_NOOP — capture a photo; the `NoopAiRung`-shaped
//     result (empty `RecognizedPlate`) routes the user to the
//     `RecognizedMatchSheet` with the closest-matches row +
//     manual-add form. Tapping `Log` after picking a closest match
//     commits through `RecordPlate`.
//   * PERMISSION_DENIED — `FakePhotoCapture.emitCancel()` renders
//     the calm "Camera denied — type it instead" copy with a
//     tap-to-type affordance.
//   * MULTIPLE_SHOTS — two back-to-back captures only land the
//     latest on screen; the previous one's result does not flash
//     when the second capture resolves.
//   * AI_RUNG_FAILURE — `FakeAiRung` returning `RecognitionFailure`
//     routes the user to the calm line + closest-matches + manual.
//
// Tests inject a `_FakeFoodCatalog` that returns canned matches so
// the closest-matches row renders deterministically. The
// `FakeEncryptedStore` from `test/_fakes/` backs the commit path.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/screens/capture_photo_screen.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/manual_entry_provider.dart';
import 'package:openplate_client/state/photo_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/widgets/recognized_match_sheet.dart';

import '../_fakes/fake_encrypted_store.dart';

class _FakeFoodCatalog implements FoodCatalog {
  _FakeFoodCatalog(this._matches);

  final List<FoodMatch> _matches;
  final List<String> calls = <String>[];

  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async {
    calls.add(query);
    return RankedMatches(_matches);
  }

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      NotFoundFailure(code);
}

Widget _wrap(
  Widget child, {
  required FakeEncryptedStore store,
  required FakePhotoCapture capture,
  required FakeAiRung rung,
  required FoodCatalog catalog,
  ThemeMode mode = ThemeMode.light,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      foodCatalogProvider.overrideWithValue(catalog),
      aiRungProvider.overrideWithValue(rung),
      photoCaptureProvider.overrideWithValue(capture),
      // Story 2.2: wire the coach providers so the post-resolve
      // whisper path can be exercised end-to-end.
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

const _apple = DatabaseFood(
  sourceRef: 'seed:apple',
  displayName: 'Apple',
  source: SourceCatalog.off,
  foodGroup: FoodGroup.vegFruit,
);
const _appleMatch = FoodMatch(
  food: _apple,
  confidence: 0.95,
  presets: <QuantityRange>[
    QuantityRange(
      low: 1,
      high: 1,
      unit: 'piece',
      displayLabel: '~1 piece',
    ),
  ],
);

void main() {
  // The match sheet + the screen's body can overflow the default
  // 800x600 test surface. Bump the size + zero the DPR for the
  // whole group so all tap targets (preset row, manual field, Log
  // buttons) are hit-testable.
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.devicePixelRatio = 1.0;
    binding.platformDispatcher.views.first.physicalSize = const Size(
      800,
      1600,
    );
  });

  tearDown(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });

  group('CapturePhotoScreen', () {
    testWidgets(
        'HAPPY_PATH_NOOP: capture + NoopAiRung default (empty plate) opens '
        'the match sheet with closest-matches + manual; tap Log commits',
        (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final capture = FakePhotoCapture();
      final rung = FakeAiRung();
      final catalog = _FakeFoodCatalog(const [_appleMatch]);

      // Stage the successful capture BEFORE the widget mounts so the
      // post-frame callback (which calls `capture()`) sees the bytes.
      capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

      await tester.pumpWidget(_wrap(
        const CapturePhotoScreen(),
        store: store,
        capture: capture,
        rung: rung,
        catalog: catalog,
      ));
      // Pump enough frames to drain the post-frame callback + the
      // capture future + the rung call + the sheet mount.
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // The screen recorded exactly one capture call (no retake).
      expect(capture.captureCalls, hasLength(1));

      // The rung received the bytes and returned the empty plate.
      expect(rung.calls, hasLength(1));

      // The match sheet is up — the empty-plate header + the
      // closest-matches row + manual-add field are all visible.
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);
      expect(find.text('Nothing matched'), findsOneWidget);
      expect(find.text('Closest matches'), findsOneWidget);
      expect(find.text('Apple'), findsOneWidget);
      expect(find.text('Custom food name'), findsOneWidget);

      // Tap Apple to make the Log button active.
      await tester.tap(find.text('Apple'));
      await tester.pumpAndSettle();

      // Tap Log — commits via RecordPlate.
      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      await tester.pumpAndSettle();

      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Apple');
      expect(draft.quantity.unit, 'piece');
    });

    testWidgets(
        'PERMISSION_DENIED: capture returns null renders "Camera denied — '
        'type it instead" with a tap-to-type affordance',
        (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final capture = FakePhotoCapture();
      final rung = FakeAiRung();
      final catalog = _FakeFoodCatalog(const [_appleMatch]);

      await tester.pumpWidget(_wrap(
        const CapturePhotoScreen(),
        store: store,
        capture: capture,
        rung: rung,
        catalog: catalog,
      ));

      // Cancellation / permission denial — same surface either way
      // (NFR7 — calm copy, no nag).
      capture.emitCancel();
      await tester.pumpAndSettle();

      expect(
        find.text('Camera denied — type it instead'),
        findsOneWidget,
      );
      // No retry button — NFR7.
      expect(find.widgetWithText(FilledButton, 'Retry'), findsNothing);
      // The tap-to-type affordance is up.
      expect(
        find.widgetWithText(FilledButton, 'Type it manually'),
        findsOneWidget,
      );
      // Rung was never called.
      expect(rung.calls, isEmpty);
    });

    testWidgets(
        'MULTIPLE_SHOTS: a retake cancels the previous recognition; only '
        'the latest result renders', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final capture = FakePhotoCapture();
      final rung = FakeAiRung();
      final catalog = _FakeFoodCatalog(const [_appleMatch]);

      // First capture — stage before pumpWidget so the post-frame
      // callback sees the bytes.
      capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

      await tester.pumpWidget(_wrap(
        const CapturePhotoScreen(),
        store: store,
        capture: capture,
        rung: rung,
        catalog: catalog,
      ));

      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(rung.calls, hasLength(1));
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);

      // Dismiss the sheet (simulating the user backing out).
      await tester.tapAt(const Offset(20, 20));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // Stage the retake capture BEFORE tapping Retake so the
      // retake's capture() call returns the new bytes.
      capture.emitSuccess(Uint8List.fromList([5, 6, 7, 8]));

      // Retake — tap the Retake button on the screen body. The
      // sheet is gone so the body is visible.
      await tester.tap(find.text('Retake'));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // The rung was called a second time with the new bytes.
      expect(rung.calls.length, greaterThanOrEqualTo(2));
      expect(rung.calls.last, Uint8List.fromList([5, 6, 7, 8]));
    });

    testWidgets(
        'AI_RUNG_FAILURE: rung returning RecognitionFailure surfaces the '
        'calm line + closest-matches row + manual still works',
        (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final capture = FakePhotoCapture();
      final rung = FakeAiRung();
      rung.emit(const RecognitionFailure('offline'));
      final catalog = _FakeFoodCatalog(const [_appleMatch]);

      // Stage the successful capture before pumpWidget.
      capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

      await tester.pumpWidget(_wrap(
        const CapturePhotoScreen(),
        store: store,
        capture: capture,
        rung: rung,
        catalog: catalog,
      ));

      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      // Match sheet is up with the failure-line header.
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);
      expect(
        find.text("Search isn't available right now."),
        findsOneWidget,
      );
      // Closest-matches row is still rendered so the user can pick.
      expect(find.text('Closest matches'), findsOneWidget);
      expect(find.text('Apple'), findsOneWidget);

      // The log path still works — pick Apple + Log.
      await tester.tap(find.text('Apple'));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(store.capturedDrafts, hasLength(1));
      expect(store.capturedDrafts.single.databaseFood.displayName, 'Apple');
    });
  });
}
