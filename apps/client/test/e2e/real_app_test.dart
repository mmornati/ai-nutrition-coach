// End-to-end on the REAL wiring and the REAL store (security review §2.9,
// Phase 5 exit criteria).
//
// Nothing here is a fake store: `OpenPlateBootstrap` builds the provider
// scope with `buildAppOverrides` — the very function `main.dart` runs — and
// the encrypted store is the production factory (`createStores`) opening a
// keyed SQLite3MultipleCiphers file in a temp directory. Only the platform
// edges are substituted: the OS key source / secure storage (in-memory), the
// camera (a fake that returns bytes) and the AI rung (a fake returning
// recognised foods WITH food groups — the network is not under test here).
//
// The database runs in a background isolate, so the test interleaves real
// `runAsync` waits with `pump`s (`_settle`).

import 'dart:io';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/boot.dart';
import 'package:openplate_client/main.dart';
import 'package:openplate_client/screens/about_notice_screen.dart';
import 'package:openplate_client/screens/day_board_screen.dart';
import 'package:openplate_client/state/ai_rung_provider.dart';
import 'package:openplate_client/state/ai_settings_provider.dart';
import 'package:openplate_client/state/clock_provider.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/manual_entry_provider.dart';
import 'package:openplate_client/state/photo_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/state/scanner_provider.dart';
import 'package:openplate_client/state/sync_queue_provider.dart';
import 'package:openplate_client/widgets/balance_arc.dart';
import 'package:openplate_client/widgets/coach_whisper.dart';
import 'package:openplate_client/widgets/plate_row.dart';
import 'package:openplate_client/widgets/recognized_match_sheet.dart';

/// 12:30 local on a Friday: the lunch slot.
final DateTime _now = DateTime(2026, 10, 2, 12, 30);

const _salmon = RecognizedFood(
  databaseFood: DatabaseFood(
    sourceRef: 'byok-vision-1-Salmon fillet',
    displayName: 'Salmon fillet',
    source: SourceCatalog.manual,
    foodGroup: FoodGroup.protein,
  ),
  confidence: 0.5,
  quantity: QuantityRange(
    low: 1,
    high: 1,
    unit: 'fillet',
    displayLabel: '1 fillet',
  ),
);

/// Let the background isolate and the widget tree make progress together.
Future<void> _settle(
  WidgetTester tester, {
  bool Function()? until,
  int rounds = 80,
}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 25)),
    );
    await tester.pump(const Duration(milliseconds: 50));
    if (until != null && until()) return;
  }
}

class _World {
  _World({required this.dir, required this.deps, required this.rung});

  final Directory dir;
  final BootDependencies deps;
  final FakeAiRung rung;
}

/// [recognition] != null swaps the AI rung for a fake that returns it (the
/// photo flow); otherwise the PRODUCTION rung wiring is left untouched.
_World _world({RecognitionResult? recognition}) {
  final dir = Directory.systemTemp.createTempSync('openplate_e2e_');
  addTearDown(() {
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });
  final keys = InMemoryKeySource();
  final rung = FakeAiRung();
  if (recognition != null) rung.emit(recognition);
  final capture = FakePhotoCapture()
    ..emitSuccess(Uint8List.fromList([1, 2, 3, 4]));
  final deps = BootDependencies(
    createStores: () => createStores(
      overrides: StoreOpenOverrides(
        databaseFilePath: '${dir.path}/$kDatabaseFileName',
        keySource: keys,
      ),
    ),
    createAiSettingsStore: (_) => InMemoryAiSettingsStore(),
    createByokKeyStore: (_) => InMemoryByokKeyStore(),
    createQuotaCounter: () => InMemoryQuotaCounter(ceiling: 50),
    purgeLegacyWebStorage: false,
    photoCapture: capture,
    cameraPermission: FakeCameraPermission(),
    overrides: [
      if (recognition != null) aiRungProvider.overrideWithValue(rung),
      clockProvider.overrideWithValue(() => _now),
    ],
  );
  return _World(dir: dir, deps: deps, rung: rung);
}

ProviderContainer _container(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(DayBoardScreen)));

/// Boots the real wiring. A fresh install shows the one-time "About this
/// app" notice first (PV1): it is dismissed here like a person would, which
/// also writes its acknowledgement to the real encrypted store.
Future<void> _bootToDayBoard(
  WidgetTester tester,
  _World w, {
  bool expectNotice = true,
}) async {
  await tester.pumpWidget(OpenPlateBootstrap(dependencies: w.deps));
  await _settle(
    tester,
    until: () =>
        find.byType(DayBoardScreen).evaluate().isNotEmpty ||
        find.byType(AboutNoticeScreen).evaluate().isNotEmpty,
  );
  if (expectNotice) {
    expect(find.byType(AboutNoticeScreen), findsOneWidget);
    expect(find.byType(DayBoardScreen), findsNothing);
    await tester.tap(find.text('Got it'));
    await _settle(
      tester,
      until: () => find.byType(DayBoardScreen).evaluate().isNotEmpty,
    );
  } else {
    expect(find.byType(AboutNoticeScreen), findsNothing);
  }
  expect(find.byType(DayBoardScreen), findsOneWidget);
}

/// Close the real database before the temp dir is deleted.
Future<void> _shutDown(WidgetTester tester) async {
  final container = _container(tester);
  final store = container.read(encryptedStoreProvider);
  await tester.pumpWidget(const SizedBox());
  // drift schedules a zero-length timer when a query stream is cancelled.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.runAsync(store.close);
}

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.devicePixelRatio = 1.0;
    binding.platformDispatcher.views.first.physicalSize = const Size(800, 1600);
  });
  tearDown(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });

  group('boot: the real wiring', () {
    testWidgets('boots to the Day Board, every seam is overridden, and '
        'Settings is reachable (F1 / F5 would have failed here)', (
      tester,
    ) async {
      final w = _world();
      await _bootToDayBoard(tester, w);

      // The real app wiring: reading each seam must not throw
      // UnimplementedError (a missing override is a boot-time bug).
      final c = _container(tester);
      for (final read in <Object Function()>[
        () => c.read(encryptedStoreProvider),
        () => c.read(coachNoteStoreProvider),
        () => c.read(coachProvider),
        () => c.read(foodCatalogProvider),
        () => c.read(voiceTranscriberProvider),
        () => c.read(photoCaptureProvider),
        () => c.read(cameraPermissionProvider),
        () => c.read(aiSettingsProvider),
        () => c.read(quotaCounterProvider),
        () => c.read(byokKeyStoreProvider),
        () => c.read(hostedQuotaProviderProvider),
        () => c.read(recordPlateProvider),
        () => c.read(syncQueueProvider),
      ]) {
        expect(read, returnsNormally);
      }

      // The AI rung is NOT overridden in this test: the production wiring
      // resolves the default settings (no-AI) to the no-op rung.
      expect(c.read(aiRungProvider), isA<NoopAiRung>());

      expect(find.text('Today'), findsOneWidget);
      // Settings -> Your AI / Your data / About.
      await tester.tap(find.byTooltip('Settings'));
      await _settle(tester, rounds: 6);
      expect(find.text('Your AI'), findsWidgets);
      expect(find.text('Your data'), findsWidgets);
      expect(find.text('About'), findsWidgets);

      await tester.pageBack();
      await _settle(tester, rounds: 6);
      await _shutDown(tester);
    });

    testWidgets('a fresh install shows three open dents on the real store', (
      tester,
    ) async {
      final w = _world();
      await _bootToDayBoard(tester, w);
      await _settle(tester, rounds: 10);
      expect(find.text('An open, quiet place.'), findsNWidgets(3));
      expect(find.byType(PlateRow), findsNothing);
      await _shutDown(tester);
    });

    testWidgets('the About notice is shown once: dismissing it is kept in the '
        'encrypted store across a restart (PV1)', (tester) async {
      final w = _world();
      await _bootToDayBoard(tester, w);
      await _shutDown(tester);

      // A second launch over the same database and key: no notice.
      await _bootToDayBoard(tester, w, expectNotice: false);
      await _shutDown(tester);
    });
  });

  group('photo -> recognised -> logged -> Day Board -> whisper', () {
    testWidgets('on the real store adapter', (tester) async {
      final w = _world(recognition: const RecognizedPlate(foods: [_salmon]));
      await _bootToDayBoard(tester, w);

      // 1. Capture sheet -> Snapshot.
      await tester.tap(find.bySemanticsLabel('Open capture sheet'));
      await _settle(tester, rounds: 6);
      await tester.tap(find.text('Snapshot'));

      // 2. The photo screen captures, calls the (fake) AI rung, and opens the
      //    recognised sheet with the foods WITH their groups.
      await _settle(
        tester,
        until: () => find.byType(RecognizedMatchSheet).evaluate().isNotEmpty,
      );
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);
      expect(w.rung.calls, hasLength(1));
      expect(find.text('Salmon fillet'), findsWidgets);

      // 3. Log it (the recognised food is preselected).
      // Let the sheet finish sliding in, then scroll the Log button into view
      // (the sheet scrolls).
      await tester.pump(const Duration(seconds: 1));
      final logButton = find.widgetWithText(FilledButton, 'Log');
      await tester.ensureVisible(logButton);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(logButton);
      await _settle(
        tester,
        until: () => find.byType(RecognizedMatchSheet).evaluate().isEmpty,
      );
      expect(find.byType(RecognizedMatchSheet), findsNothing);

      // 4. Back on the Day Board: the plate is under LUNCH (12:30), with its
      //    group on the balance arc, and the coach whisper has appeared.
      await tester.pageBack();
      await _settle(
        tester,
        until: () => find.byType(PlateRow).evaluate().isNotEmpty,
      );
      expect(find.byType(PlateRow), findsOneWidget);
      final row = find.byType(PlateRow);
      expect(
        find.descendant(of: row, matching: find.text('Lunch')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text('Salmon fillet')),
        findsOneWidget,
      );
      // Breakfast and dinner are the open dents.
      expect(find.text('An open, quiet place.'), findsNWidgets(2));

      // The whisper is written a moment after the commit and arrives through
      // the note stream — protein only, so the veg-light question.
      await _settle(
        tester,
        until: () => find.byType(CoachWhisper).evaluate().isNotEmpty,
      );
      expect(find.byType(CoachWhisper), findsOneWidget);
      expect(
        find.text('A handful of greens would round this plate out.'),
        findsOneWidget,
      );
      final arc = tester.widget<BalanceArc>(find.byType(BalanceArc));
      expect(arc.filled, [false, true, false, false]); // protein only

      // 5. What is on disk, read back through the real adapter: the group was
      //    PERSISTED (F2), the plate is in the lunch day, and one note exists.
      final c = _container(tester);
      final store = c.read(encryptedStoreProvider);
      final read = await tester.runAsync(
        () => store.readRange(
          from: DateTime(2026, 10, 2),
          to: DateTime(2026, 10, 3),
        ),
      );
      final plates = (read! as PlatesRead).plates;
      expect(plates, hasLength(1));
      expect(plates.single.loggedAtUtc, _now.toUtc());
      expect(
        plates.single.entries.single.databaseFood.foodGroup,
        FoodGroup.protein,
      );
      final notes = await tester.runAsync(
        () => c.read(coachNoteStoreProvider).forPlate(plates.single.id),
      );
      expect(notes, hasLength(1));
      expect(notes!.single.anchor, CoachAnchor.postResolve);

      // 6. Nothing claims to be synced: the plate is "on this device".
      expect(find.text('· on this device'), findsOneWidget);
      expect(find.textContaining('synced'), findsNothing);

      // 7. "Ask later" is durable on the real database.
      await tester.tap(find.text('ask later'));
      await _settle(
        tester,
        until: () => find.byType(CoachWhisper).evaluate().isEmpty,
      );
      expect(find.byType(CoachWhisper), findsNothing);
      final dismissed = await tester.runAsync(
        () => c.read(coachNoteStoreProvider).watchDismissals().first,
      );
      expect(dismissed, {coachNoteDismissalKey(notes.single.id)});

      // 8. PV5: press and hold removes THIS plate - after a confirm - and its
      //    coach note and dismissal go with it, on the real database.
      final plateId = plates.single.id;
      // The confirm is exercised on the real board (press and hold, "Keep
      // it" removes nothing); the removal itself is then run through the same
      // `DeletePlate` use case in the real zone. (Tapping "Remove" inside the
      // widget test's fake-async zone wedges drift's isolate round trip in the
      // harness - `plate_delete_test.dart` covers that tap on a fake store.)
      await tester.longPress(find.byType(PlateRow));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Remove this plate?'), findsOneWidget);
      await tester.tap(find.byKey(plateRemoveKeepKey));
      await _settle(tester, rounds: 10);
      expect(find.byType(PlateRow), findsOneWidget);
      final removed = await tester.runAsync(
        () => c.read(deletePlateProvider)(plateId),
      );
      expect(removed, isA<PlateDeleted>());
      await _settle(
        tester,
        until: () => find.byType(PlateRow).evaluate().isEmpty,
      );
      expect(find.byType(PlateRow), findsNothing);
      expect(find.text('An open, quiet place.'), findsNWidgets(3));
      // The removed row's drift watch streams schedule zero-length cancel
      // timers in the test zone; pump so they fire before the DB is read
      // from outside the widget tree (else the read can wait forever).
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 200));
      final after = await tester.runAsync(
        () => store.readRange(
          from: DateTime(2026, 10, 2),
          to: DateTime(2026, 10, 3),
        ),
      );
      expect((after! as PlatesRead).plates, isEmpty);
      final goneNotes = await tester.runAsync(
        () => c.read(coachNoteStoreProvider).forPlate(plateId),
      );
      expect(goneNotes, isEmpty);
      final goneDismissals = await tester.runAsync(
        () => c.read(coachNoteStoreProvider).watchDismissals().first,
      );
      expect(goneDismissals, isEmpty);

      await _shutDown(tester);
    });
  });
}
