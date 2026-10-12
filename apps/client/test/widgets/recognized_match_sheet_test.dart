// `RecognizedMatchSheet` widget tests (Story 1.8 / FR1 / AD-5).
//
// The sheet is the photo path's "resolve → confirm" surface. Tests
// pin the four I/O matrix branches the spec calls out:
//
//   * HAPPY_PATH_NOOP — `RecognizedPlate(foods: [])` (the v1
//     `NoopAiRung` default). The sheet renders the "Nothing
//     matched" header + the closest-matches row + the manual-add
//     field + the `Log custom food` button + the `Log` button
//     disabled until a selection is made.
//   * HAPPY_PATH_MATCHED — `RecognizedPlate(foods: [Apple])`. The
//     sheet renders the recognized row with confidence + quantity,
//     defaults the selection to that food, and tapping `Log`
//     commits a `FoodEntryDraft` through `RecordPlate` + writes
//     `lastLogProvider` + pops back.
//   * AMBIGUOUS_RECOGNITION — `NoMatch` renders the calm "Nothing
//     on this plate" copy; the manual-add path still works.
//   * AI_RUNG_FAILURE — `RecognitionFailure` renders the calm
//     "Search isn't available right now" line; the closest-matches
//     row + the `Log` button on a selected match still work.
//
// All tests use the `FakeEncryptedStore` from `test/_fakes/` so
// the commit path is hermetic.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/last_log_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/widgets/recognized_match_sheet.dart';

import '../_fakes/fake_encrypted_store.dart';

Widget _wrap(
  Widget child, {
  required FakeEncryptedStore store,
  ThemeMode mode = ThemeMode.light,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
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
const _salmon = DatabaseFood(
  sourceRef: 'seed:salmon',
  displayName: 'Salmon',
  source: SourceCatalog.off,
  foodGroup: FoodGroup.protein,
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
const _salmonMatch = FoodMatch(
  food: _salmon,
  confidence: 0.92,
  presets: <QuantityRange>[
    QuantityRange(
      low: 1,
      high: 1,
      unit: 'fist',
      displayLabel: '~1 fist',
    ),
  ],
);

void main() {
  // The match sheet is a bottom sheet that can overflow the default
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

  group('RecognizedMatchSheet', () {
    testWidgets(
        'HAPPY_PATH_NOOP: empty RecognizedPlate renders closest-matches + '
        'manual + auto-selects first match so Log is enabled', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showRecognizedMatchSheet(
              ctx,
              result: const RecognizedPlate(foods: <RecognizedFood>[]),
              closestMatches: const [_appleMatch, _salmonMatch],
            ),
            child: const Text('open'),
          ),
        ),
        store: store,
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // Header copy + manual-add field are up.
      expect(find.text('Nothing matched'), findsOneWidget);
      expect(find.text('Custom food name'), findsOneWidget);
      // Closest-matches row is up.
      expect(find.text('Closest matches'), findsOneWidget);
      expect(find.text('Apple'), findsOneWidget);
      expect(find.text('Salmon'), findsOneWidget);
      // `Log custom food` + `Log` both render; Log is auto-enabled
      // because the first closest match is auto-selected.
      expect(find.text('Log custom food'), findsOneWidget);
      final logButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Log'),
      );
      expect(logButton.onPressed, isNotNull,
          reason: 'Log must be auto-enabled with the first closest match');
    });

    testWidgets(
        'HAPPY_PATH_MATCHED: RecognizedPlate with foods auto-selects the '
        'first one; tap Log commits via RecordPlate + writes '
        'lastLogProvider', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      final ProviderContainer container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(store),
          coachProvider.overrideWithValue(FakeCoach()),
          coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          themeMode: ThemeMode.light,
          theme: ThemeData(brightness: Brightness.light),
          home: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showRecognizedMatchSheet(
                ctx,
                result: RecognizedPlate(foods: [
                  RecognizedFood(
                    databaseFood: _apple,
                    confidence: 0.95,
                    quantity: const QuantityRange(
                      low: 1,
                      high: 1,
                      unit: 'piece',
                      displayLabel: '~1 piece',
                    ),
                  ),
                ]),
                closestMatches: const [_salmonMatch],
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // The recognized food is auto-selected; Salmon (closest match)
      // is also up so the user can switch.
      expect(find.text('Apple'), findsOneWidget);
      expect(find.text('Salmon'), findsOneWidget);
      // Tap Log — commits through RecordPlate + pops back.
      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      await tester.pumpAndSettle();

      // Exactly one plate was committed with the auto-selected food.
      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Apple');
      expect(draft.quantity.unit, 'piece');

      // lastLogProvider was stamped so the Day Board's quick-repeat
      // affordance surfaces.
      final lastLog = container.read(lastLogProvider);
      expect(lastLog, isNotNull,
          reason: 'lastLogProvider must be written on a successful commit');
    });

    testWidgets(
        'AMBIGUOUS_RECOGNITION: NoMatch renders "Nothing on this plate" + '
        'closest-matches row + manual still works', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showRecognizedMatchSheet(
              ctx,
              result: const NoMatch(),
              closestMatches: const [_appleMatch],
            ),
            child: const Text('open'),
          ),
        ),
        store: store,
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('Nothing on this plate'), findsOneWidget);
      expect(find.text('Closest matches'), findsOneWidget);
      expect(find.text('Apple'), findsOneWidget);
      expect(find.text('Custom food name'), findsOneWidget);
    });

    testWidgets(
        'AI_RUNG_FAILURE: RecognitionFailure renders the calm line + '
        'closest-matches still selectable + Log commits', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showRecognizedMatchSheet(
              ctx,
              result: const RecognitionFailure('offline'),
              closestMatches: const [_appleMatch],
            ),
            child: const Text('open'),
          ),
        ),
        store: store,
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(
        find.text("Search isn't available right now."),
        findsOneWidget,
      );
      expect(find.text('Apple'), findsOneWidget);

      // Apple is auto-selected (it's the only closest match) so Log
      // is auto-enabled. Tap Log — commits.
      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      await tester.pumpAndSettle();

      expect(store.capturedDrafts, hasLength(1));
      expect(store.capturedDrafts.single.databaseFood.displayName, 'Apple');
    });

    testWidgets(
        'Log custom food: typing a name + tapping the button commits a '
        'manual DatabaseFood', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showRecognizedMatchSheet(
              ctx,
              result: const RecognizedPlate(foods: <RecognizedFood>[]),
              closestMatches: const [_appleMatch],
            ),
            child: const Text('open'),
          ),
        ),
        store: store,
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      // Type a custom name.
      await tester.enterText(
        find.widgetWithText(TextField, 'Custom food name'),
        'Tofu stir-fry',
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(
        find.widgetWithText(OutlinedButton, 'Log custom food'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Log custom food'));
      await tester.pumpAndSettle();

      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Tofu stir-fry');
      expect(draft.databaseFood.source, SourceCatalog.manual);
    });
  });
}
