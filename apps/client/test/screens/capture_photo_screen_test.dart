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
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/capture_photo_screen.dart';
import 'package:ai_nutrition_coach/state/ai_rung_provider.dart';
import 'package:ai_nutrition_coach/state/ai_settings_provider.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/manual_entry_provider.dart';
import 'package:ai_nutrition_coach/state/photo_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/widgets/recognized_match_sheet.dart';

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
  AiSettings settings = AiSettings.defaults,
  InMemoryAiSettingsStore? settingsStore,
  List<Override> extraOverrides = const [],
  AiRung? rungOverride,
}) {
  return ProviderScope(
    overrides: [
      // Phase 3: the upload host (and so the consent ask) derives from the
      // settings; the default is no-AI, i.e. nothing is uploaded.
      initialAiSettingsProvider.overrideWithValue(settings),
      aiSettingsStoreProvider.overrideWithValue(
        settingsStore ?? InMemoryAiSettingsStore(initial: settings),
      ),
      encryptedStoreProvider.overrideWithValue(store),
      foodCatalogProvider.overrideWithValue(catalog),
      aiRungProvider.overrideWithValue(rungOverride ?? rung),
      photoCaptureProvider.overrideWithValue(capture),
      // Story 2.2: wire the coach providers so the post-resolve
      // whisper path can be exercised end-to-end.
      coachProvider.overrideWithValue(FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
      ...extraOverrides,
    ],
    child: MaterialApp(
      themeMode: mode,
      theme: ThemeData(brightness: Brightness.light),
      darkTheme: ThemeData(brightness: Brightness.dark),
      home: child,
    ),
  );
}

final _photo = Uint8List.fromList([1, 2, 3, 4]);

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
    QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
  ],
);

/// A plate logged a moment ago — the "recent foods" the closest-matches row
/// offers (the fake query that searched the literal 'closest' is gone, F9).
PlateLog _recentApplePlate() => plateAt(
  1,
  localTime: DateTime.now().subtract(const Duration(minutes: 5)),
  dish: 'Apple',
  unit: 'piece',
  displayLabel: '~1 piece',
  foodGroup: FoodGroup.vegFruit,
);

void main() {
  // The match sheet + the screen's body can overflow the default
  // 800x600 test surface. Bump the size + zero the DPR for the
  // whole group so all tap targets (preset row, manual field, Log
  // buttons) are hit-testable.
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

  group('CapturePhotoScreen', () {
    testWidgets(
      'HAPPY_PATH_NOOP: capture + NoopAiRung default (empty plate) opens '
      'the match sheet with closest-matches (recent foods) + manual; tap Log '
      'commits',
      (tester) async {
        final store = FakeEncryptedStore(initial: [_recentApplePlate()]);
        addTearDown(store.close);
        final capture = FakePhotoCapture();
        final rung = FakeAiRung();
        final catalog = _FakeFoodCatalog(const [_appleMatch]);

        // Stage the successful capture BEFORE the widget mounts so the
        // post-frame callback (which calls `capture()`) sees the bytes.
        capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

        await tester.pumpWidget(
          _wrap(
            const CapturePhotoScreen(),
            store: store,
            capture: capture,
            rung: rung,
            catalog: catalog,
          ),
        );
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
      },
    );

    testWidgets(
      'PERMISSION_DENIED: capture returns null renders "Camera denied — '
      'type it instead" with a tap-to-type affordance',
      (tester) async {
        final store = FakeEncryptedStore();
        addTearDown(store.close);
        final capture = FakePhotoCapture();
        final rung = FakeAiRung();
        final catalog = _FakeFoodCatalog(const [_appleMatch]);

        await tester.pumpWidget(
          _wrap(
            const CapturePhotoScreen(),
            store: store,
            capture: capture,
            rung: rung,
            catalog: catalog,
          ),
        );

        // Cancellation / permission denial — same surface either way
        // (NFR7 — calm copy, no nag).
        capture.emitCancel();
        await tester.pumpAndSettle();

        expect(find.text('Camera denied — type it instead'), findsOneWidget);
        // No retry button — NFR7.
        expect(find.widgetWithText(FilledButton, 'Retry'), findsNothing);
        // The tap-to-type affordance is up.
        expect(
          find.widgetWithText(FilledButton, 'Type it manually'),
          findsOneWidget,
        );
        // Rung was never called.
        expect(rung.calls, isEmpty);
      },
    );

    testWidgets(
      'MULTIPLE_SHOTS: a retake cancels the previous recognition; only '
      'the latest result renders',
      (tester) async {
        final store = FakeEncryptedStore();
        addTearDown(store.close);
        final capture = FakePhotoCapture();
        final rung = FakeAiRung();
        final catalog = _FakeFoodCatalog(const [_appleMatch]);

        // First capture — stage before pumpWidget so the post-frame
        // callback sees the bytes.
        capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

        await tester.pumpWidget(
          _wrap(
            const CapturePhotoScreen(),
            store: store,
            capture: capture,
            rung: rung,
            catalog: catalog,
          ),
        );

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
      },
    );

    testWidgets(
      'AI_RUNG_FAILURE: rung returning RecognitionFailure surfaces the '
      'calm line + closest-matches row + manual still works',
      (tester) async {
        final store = FakeEncryptedStore(initial: [_recentApplePlate()]);
        addTearDown(store.close);
        final capture = FakePhotoCapture();
        final rung = FakeAiRung();
        rung.emit(const RecognitionFailure('offline'));
        final catalog = _FakeFoodCatalog(const [_appleMatch]);

        // Stage the successful capture before pumpWidget.
        capture.emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

        await tester.pumpWidget(
          _wrap(
            const CapturePhotoScreen(),
            store: store,
            capture: capture,
            rung: rung,
            catalog: catalog,
          ),
        );

        for (var i = 0; i < 8; i++) {
          await tester.pump(const Duration(milliseconds: 50));
        }

        // Match sheet is up with the failure-line header.
        expect(find.byType(RecognizedMatchSheet), findsOneWidget);
        expect(find.text("Search isn't available right now."), findsOneWidget);
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
      },
    );
  });

  group('closest matches (F9)', () {
    testWidgets('are catalog matches for each RECOGNISED name, then recent '
        'foods — and never a query for a literal placeholder', (tester) async {
      final store = FakeEncryptedStore(
        initial: [
          plateAt(
            2,
            localTime: DateTime.now().subtract(const Duration(hours: 1)),
            dish: 'Rye bread',
            displayLabel: '~2 slices',
          ),
        ],
      );
      addTearDown(store.close);
      final rung = FakeAiRung()
        ..emit(
          const RecognizedPlate(
            foods: [
              RecognizedFood(
                databaseFood: DatabaseFood(
                  sourceRef: 'byok-m-Apple',
                  displayName: 'Apple',
                  source: SourceCatalog.manual,
                  foodGroup: FoodGroup.vegFruit,
                ),
                confidence: 0.5,
                quantity: QuantityRange(
                  low: 1,
                  high: 1,
                  unit: 'piece',
                  displayLabel: '~1 piece',
                ),
              ),
            ],
          ),
        );
      final catalog = _FakeFoodCatalog(const [_appleMatch]);
      final capture = FakePhotoCapture()
        ..emitSuccess(Uint8List.fromList([1, 2, 3, 4]));

      await tester.pumpWidget(
        _wrap(
          const CapturePhotoScreen(),
          store: store,
          capture: capture,
          rung: rung,
          catalog: catalog,
        ),
      );
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(catalog.calls, ['Apple']);
      expect(catalog.calls, isNot(contains('closest')));
      expect(find.text('Closest matches'), findsOneWidget);
      expect(find.text('Rye bread'), findsOneWidget);
    });

    testWidgets('with no history and nothing recognised the row is simply '
        'absent and manual-add remains', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      final catalog = _FakeFoodCatalog(const [_appleMatch]);
      final capture = FakePhotoCapture()
        ..emitSuccess(Uint8List.fromList([1, 2, 3, 4]));
      await tester.pumpWidget(
        _wrap(
          const CapturePhotoScreen(),
          store: store,
          capture: capture,
          rung: FakeAiRung(),
          catalog: catalog,
        ),
      );
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(catalog.calls, isEmpty);
      expect(find.text('Closest matches'), findsNothing);
      expect(find.text('Custom food name'), findsOneWidget);
    });
  });

  group('CapturePhotoScreen photo consent (N1 / N10)', () {
    const byok = AiSettings(
      rung: AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
      ),
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'm',
      // The per-host agreement ("ask once") mode; the default is to ask for
      // every photo (PV1), covered by its own group below.
      askBeforeEveryPhoto: false,
    );

    Future<void> pumpScreen(
      WidgetTester tester, {
      required FakeAiRung rung,
      required AiSettings settings,
      InMemoryAiSettingsStore? settingsStore,
      List<Override> extraOverrides = const [],
      FakePhotoCapture? capture,
    }) async {
      final store = FakeEncryptedStore(initial: [_recentApplePlate()]);
      addTearDown(store.close);
      capture ??= FakePhotoCapture()
        ..emitSuccess(Uint8List.fromList([1, 2, 3, 4]));
      await tester.pumpWidget(
        _wrap(
          const CapturePhotoScreen(),
          store: store,
          capture: capture,
          rung: rung,
          catalog: _FakeFoodCatalog(const [_appleMatch]),
          settings: settings,
          settingsStore: settingsStore,
          extraOverrides: extraOverrides,
        ),
      );
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
    }

    testWidgets('first photo to a host asks, naming the host; Allow sends '
        'the photo and remembers the host', (tester) async {
      final rung = FakeAiRung();
      final settingsStore = InMemoryAiSettingsStore(initial: byok);
      await pumpScreen(
        tester,
        rung: rung,
        settings: byok,
        settingsStore: settingsStore,
      );

      expect(find.text('Send this photo to api.example.com?'), findsOneWidget);
      expect(rung.calls, isEmpty, reason: 'nothing is sent before the answer');

      await tester.tap(find.text('Allow api.example.com'));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(rung.calls, hasLength(1));
      expect(
        (await settingsStore.read()).hasConsentFor('api.example.com'),
        isTrue,
      );
    });

    testWidgets('Not now drops the photo: the rung is never called and no '
        'consent is stored; the no-AI core still renders', (tester) async {
      final rung = FakeAiRung();
      final settingsStore = InMemoryAiSettingsStore(initial: byok);
      await pumpScreen(
        tester,
        rung: rung,
        settings: byok,
        settingsStore: settingsStore,
      );

      await tester.tap(find.text('Not now'));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(rung.calls, isEmpty);
      expect((await settingsStore.read()).photoConsentHosts, isEmpty);
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);
      expect(find.text('Closest matches'), findsOneWidget);
    });

    testWidgets('an already-consented host is not asked again', (tester) async {
      final rung = FakeAiRung();
      final consented = byok.copyWith(photoConsentHosts: {'api.example.com'});
      await pumpScreen(tester, rung: rung, settings: consented);

      expect(find.textContaining('Send this photo to'), findsNothing);
      expect(rung.calls, hasLength(1));
    });

    testWidgets('PV2: the dialog says what is sent, what the host also sees, '
        'that it may keep requests, what is not sent; learn more is the '
        'in-app privacy page', (tester) async {
      await pumpScreen(tester, rung: FakeAiRung(), settings: byok);

      expect(find.textContaining('a fixed instruction'), findsOneWidget);
      expect(
        find.textContaining('and the model name you chose'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'Also visible to api.example.com: your internet address',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('device or app type'), findsOneWidget);
      expect(
        find.textContaining("check your provider's data policy"),
        findsOneWidget,
      );
      expect(
        find.text('Not sent: your name, your history, or your other plates.'),
        findsOneWidget,
      );
      expect(find.text('What this app stores and sends'), findsOneWidget);
      expect(find.textContaining('Copy a link'), findsNothing);
      expect(find.textContaining('github.com'), findsNothing);
    });
  });

  group('CapturePhotoScreen: ask before every photo upload (PV1)', () {
    const byokEvery = AiSettings(
      rung: AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
      ),
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'm',
    );

    Future<void> settle(WidgetTester tester) async {
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
    }

    // The REAL consent-gated rung over a recording inner rung, so the permit
    // is exercised, not just the dialog.
    ({FakeAiRung inner, PhotoUploadPermit permit, AiRung rung}) gated({
      bool hostConsent = false,
    }) {
      final inner = FakeAiRung();
      final permit = PhotoUploadPermit();
      return (
        inner: inner,
        permit: permit,
        rung: ConsentGatedAiRung(
          inner: inner,
          hasConsent: () => hostConsent,
          askEveryPhoto: () => true,
          permit: permit,
          host: 'api.example.com',
        ),
      );
    }

    Future<FakePhotoCapture> pump(
      WidgetTester tester,
      ({FakeAiRung inner, PhotoUploadPermit permit, AiRung rung}) g,
      AiSettings settings, {
      InMemoryAiSettingsStore? settingsStore,
    }) async {
      final store = FakeEncryptedStore(initial: [_recentApplePlate()]);
      addTearDown(store.close);
      final capture = FakePhotoCapture()
        ..emitSuccess(Uint8List.fromList([1, 2, 3, 4]));
      await tester.pumpWidget(
        _wrap(
          const CapturePhotoScreen(),
          store: store,
          capture: capture,
          rung: g.inner,
          catalog: _FakeFoodCatalog(const [_appleMatch]),
          settings: settings,
          settingsStore: settingsStore,
          rungOverride: g.rung,
          extraOverrides: [
            photoUploadPermitProvider.overrideWithValue(g.permit),
          ],
        ),
      );
      await settle(tester);
      return capture;
    }

    testWidgets('is the default for a new install', (tester) async {
      expect(AiSettings.defaults.askBeforeEveryPhoto, isTrue);
    });

    testWidgets('even a host already agreed to is asked, per photo; "Send this '
        'photo" sends exactly that photo and remembers nothing', (
      tester,
    ) async {
      final g = gated(hostConsent: true);
      final settingsStore = InMemoryAiSettingsStore(
        initial: byokEvery.copyWith(photoConsentHosts: {'api.example.com'}),
      );
      await pump(
        tester,
        g,
        byokEvery.copyWith(photoConsentHosts: {'api.example.com'}),
        settingsStore: settingsStore,
      );

      expect(find.text('Send this photo to api.example.com?'), findsOneWidget);
      expect(find.text('Allow api.example.com'), findsNothing);
      expect(find.textContaining('before every photo'), findsOneWidget);
      expect(g.inner.calls, isEmpty, reason: 'nothing before the answer');

      await tester.tap(find.text('Send this photo'));
      await settle(tester);

      expect(g.inner.calls, hasLength(1));
      expect(
        g.permit.consume(host: 'api.example.com', bytes: _photo),
        isFalse,
        reason: 'the permit was spent',
      );
      // No standing agreement was added by this yes.
      expect(
        (await settingsStore.read()).photoConsentHosts,
        {'api.example.com'},
        reason: 'unchanged: a per-photo yes does not add a host',
      );
    });

    testWidgets('a per-photo yes on a NEW host stores no consent for it', (
      tester,
    ) async {
      final g = gated();
      final settingsStore = InMemoryAiSettingsStore(initial: byokEvery);
      await pump(tester, g, byokEvery, settingsStore: settingsStore);
      await tester.tap(find.text('Send this photo'));
      await settle(tester);
      expect(g.inner.calls, hasLength(1));
      expect((await settingsStore.read()).photoConsentHosts, isEmpty);
    });

    testWidgets('"Not now": nothing is sent and the no-AI core renders', (
      tester,
    ) async {
      final g = gated();
      await pump(tester, g, byokEvery);
      await tester.tap(find.text('Not now'));
      await settle(tester);
      expect(g.inner.calls, isEmpty);
      expect(g.permit.consume(host: 'api.example.com', bytes: _photo), isFalse);
      expect(find.byType(RecognizedMatchSheet), findsOneWidget);
    });

    testWidgets('the next photo asks again (the yes was for one photo)', (
      tester,
    ) async {
      final g = gated();
      await pump(tester, g, byokEvery);
      await tester.tap(find.text('Send this photo'));
      await settle(tester);
      expect(g.inner.calls, hasLength(1));

      // A second photo: the permit is spent, so it is asked all over again.
      expect(g.permit.consume(host: 'api.example.com', bytes: _photo), isFalse);
      await tester.pumpWidget(const SizedBox());
      await pump(tester, g, byokEvery);
      expect(find.text('Send this photo to api.example.com?'), findsOneWidget);
      expect(g.inner.calls, hasLength(1), reason: 'not sent before the answer');
    });
  });

  group('ConsentGatedAiRung permit (PV1)', () {
    final photoA = Uint8List.fromList([1, 2, 3]);
    final photoB = Uint8List.fromList([9, 9, 9]);
    const host = 'api.example.com';

    ConsentGatedAiRung rungFor(
      FakeAiRung inner,
      PhotoUploadPermit? permit, {
      bool Function()? every,
    }) => ConsentGatedAiRung(
      inner: inner,
      hasConsent: () => true, // the standing host agreement is NOT enough
      askEveryPhoto: every ?? () => true,
      permit: permit,
      host: host,
    );

    test(
      'per-photo mode: no permit, no upload; one permit, one upload',
      () async {
        final inner = FakeAiRung();
        final permit = PhotoUploadPermit();
        final rung = rungFor(inner, permit);
        expect(await rung.recognize(photoA), isA<RecognitionFailure>());
        expect(inner.calls, isEmpty);

        permit.grant(host: host, bytes: photoA);
        expect(await rung.recognize(photoA), isA<RecognizedPlate>());
        expect(inner.calls, hasLength(1));

        // Spent: the next photo is refused until it is granted again.
        expect(await rung.recognize(photoA), isA<RecognitionFailure>());
        expect(inner.calls, hasLength(1));
      },
    );

    test('a retake while recognising cannot reuse the permit: it is bound '
        'to the photo it was granted for', () async {
      final inner = FakeAiRung();
      final permit = PhotoUploadPermit()..grant(host: host, bytes: photoA);
      final rung = rungFor(inner, permit);
      // A second capture (different bytes) reaches the rung first.
      expect(await rung.recognize(photoB), isA<RecognitionFailure>());
      expect(inner.calls, isEmpty);
      // The photo the person agreed to still goes, once.
      expect(await rung.recognize(photoA), isA<RecognizedPlate>());
      expect(inner.calls, [photoA]);
      expect(await rung.recognize(photoA), isA<RecognitionFailure>());
    });

    test('bound to the host: another host cannot spend it', () {
      final permit = PhotoUploadPermit()..grant(host: host, bytes: photoA);
      expect(permit.consume(host: 'evil.example.com', bytes: photoA), isFalse);
      expect(permit.consume(host: 'API.example.com', bytes: photoA), isTrue);
    });

    test('a revoked permit sends nothing', () async {
      final inner = FakeAiRung();
      final permit = PhotoUploadPermit()
        ..grant(host: host, bytes: photoA)
        ..revoke();
      expect(
        await rungFor(inner, permit).recognize(photoA),
        isA<RecognitionFailure>(),
      );
      expect(inner.calls, isEmpty);
    });

    test('per-photo mode with no permit object fails closed', () async {
      final inner = FakeAiRung();
      expect(
        await rungFor(inner, null).recognize(photoA),
        isA<RecognitionFailure>(),
      );
      expect(inner.calls, isEmpty);
    });

    test(
      '"ask once" mode uses the per-host agreement, read at call time',
      () async {
        var agreed = false;
        final inner = FakeAiRung();
        final rung = ConsentGatedAiRung(
          inner: inner,
          hasConsent: () => agreed,
          askEveryPhoto: () => false,
          permit: PhotoUploadPermit(),
          host: host,
        );
        expect(await rung.recognize(photoA), isA<RecognitionFailure>());
        agreed = true;
        expect(await rung.recognize(photoA), isA<RecognizedPlate>());
      },
    );
  });

  group('CapturePhotoScreen: no-AI never asks', () {
    testWidgets('no-AI rung never asks (nothing leaves the device)', (
      tester,
    ) async {
      final rung = FakeAiRung();
      final store = FakeEncryptedStore(initial: [_recentApplePlate()]);
      addTearDown(store.close);
      await tester.pumpWidget(
        _wrap(
          const CapturePhotoScreen(),
          store: store,
          capture: FakePhotoCapture()
            ..emitSuccess(Uint8List.fromList([1, 2, 3, 4])),
          rung: rung,
          catalog: _FakeFoodCatalog(const [_appleMatch]),
        ),
      );
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(find.textContaining('Send this photo to'), findsNothing);
      expect(rung.calls, hasLength(1));
    });
  });
}
