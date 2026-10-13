// F7: a throwing store call must never leave a submit button stuck on
// "Logging…", and a failing POST-commit step (coach note, sync enqueue)
// must never turn a committed plate into a failure.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/manual_entry_screen.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/last_log_provider.dart';
import 'package:ai_nutrition_coach/state/manual_entry_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

class _ThrowingStore extends FakeEncryptedStore {
  bool throwNext = true;
  int attempts = 0;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) {
    attempts++;
    if (throwNext) throw Exception('disk exploded');
    return super.recordPlate(entries: entries, loggedAtUtc: loggedAtUtc);
  }
}

class _ThrowingNotes extends FakeCoachNoteStore {
  @override
  Future<CoachNoteAppendResult> append(CoachNote note) =>
      throw Exception('notes table gone');
}

class _Catalog implements FoodCatalog {
  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async =>
      const RankedMatches(<FoodMatch>[
        FoodMatch(
          food: DatabaseFood(
            sourceRef: 'seed:apple',
            displayName: 'Apple',
            source: SourceCatalog.seed,
            foodGroup: FoodGroup.vegFruit,
          ),
          confidence: 0.9,
          presets: <QuantityRange>[
            QuantityRange(
              low: 1,
              high: 1,
              unit: 'piece',
              displayLabel: '~1 piece',
            ),
          ],
        ),
      ]);

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      NotFoundFailure(code);
}

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  required FakeEncryptedStore store,
  FakeCoachNoteStore? notes,
  FakeCoach? coach,
}) async {
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      foodCatalogProvider.overrideWithValue(_Catalog()),
      coachProvider.overrideWithValue(coach ?? FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(notes ?? FakeCoachNoteStore()),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(store.close);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: ManualEntryScreen()),
    ),
  );
  await tester.pumpAndSettle();
  await tester.enterText(
    find.ancestor(
      of: find.text('Food search'),
      matching: find.byType(TextField),
    ),
    'app',
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Apple'));
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets('a store that THROWS leaves the Log button usable, with calm '
      'copy, and a retry then succeeds', (tester) async {
    final store = _ThrowingStore();
    final container = await _pump(tester, store: store);

    await tester.tap(find.widgetWithText(FilledButton, 'Log'));
    await tester.pumpAndSettle();

    expect(find.text('Could not log plate.'), findsOneWidget);
    // Not stuck: the label is back and the button is enabled.
    expect(find.text('Logging…'), findsNothing);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Log'),
    );
    expect(button.onPressed, isNotNull);
    expect(container.read(lastLogProvider), isNull);

    store.throwNext = false;
    // Let the snack bar leave: it sits over the button.
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Log'));
    await tester.pumpAndSettle();
    expect(store.attempts, 2);
    expect(container.read(lastLogProvider), isNotNull);
    expect(store.capturedDrafts, hasLength(1));
  });

  testWidgets('a coach store that throws AFTER the commit is still a '
      'successful log (no duplicate-inviting failure)', (tester) async {
    final store = FakeEncryptedStore();
    final coach = FakeCoach()
      ..emit(
        const CoachFound(
          CoachQuestion(
            key: 'post.resolve.vegLight',
            text: 'greens?',
            anchor: CoachAnchor.postResolve,
            pattern: CompositionPattern.vegLight,
          ),
        ),
      );
    final container = await _pump(
      tester,
      store: store,
      notes: _ThrowingNotes(),
      coach: coach,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Log'));
    await tester.pumpAndSettle();

    expect(find.text('Could not log plate.'), findsNothing);
    expect(container.read(lastLogProvider), isNotNull);
    expect(store.capturedDrafts, hasLength(1));
    // The screen popped back: nothing left to submit twice.
    expect(find.byType(ManualEntryScreen), findsNothing);
  });
}
