// Deleting a single plate from the Day Board (privacy audit PV5): press and
// hold, or the screen reader's custom action, then a calm confirm; the plate
// and its coach note go; the Day Board stream updates.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/l10n/l10n.dart';
import 'package:openplate_client/screens/day_board_screen.dart';
import 'package:openplate_client/state/clock_provider.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/widgets/plate_row.dart';

import '../_fakes/fake_encrypted_store.dart';

class _FailingDeleteStore extends FakeEncryptedStore {
  _FailingDeleteStore({super.initial});
  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async =>
      const PlateDeleteFailed(
        StoreFailure(encryptedStoreError: StoreOperationFailure()),
      );
}

Widget _app(FakeEncryptedStore store, FakeCoachNoteStore notes) =>
    ProviderScope(
      overrides: [
        encryptedStoreProvider.overrideWithValue(store),
        coachProvider.overrideWithValue(FakeCoach()),
        coachNoteStoreProvider.overrideWithValue(notes),
        clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12)),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const DayBoardScreen(),
      ),
    );

PlateLog _plate(int id, String dish, int hour) =>
    plateAt(id, localTime: DateTime(2026, 8, 15, hour), dish: dish);

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

  testWidgets('press and hold asks calmly; "Keep it" removes nothing', (
    tester,
  ) async {
    final store = FakeEncryptedStore(initial: [_plate(1, 'Porridge', 8)]);
    addTearDown(store.close);
    await tester.pumpWidget(_app(store, FakeCoachNoteStore()));
    await tester.pumpAndSettle();

    await tester.longPress(find.byType(PlateRow));
    await tester.pumpAndSettle();
    expect(find.text('Remove this plate?'), findsOneWidget);
    expect(find.textContaining('Porridge will be removed'), findsOneWidget);
    expect(find.textContaining('can’t be undone'), findsOneWidget);

    await tester.tap(find.byKey(plateRemoveKeepKey));
    await tester.pumpAndSettle();
    expect(store.deletedPlateIds, isEmpty);
    expect(find.byType(PlateRow), findsOneWidget);
  });

  testWidgets('"Remove" deletes that plate only, drops its coach note and '
      'dismissal, and the board updates', (tester) async {
    final store = FakeEncryptedStore(
      initial: [_plate(1, 'Porridge', 8), _plate(2, 'Soup', 12)],
    );
    addTearDown(store.close);
    final notes = FakeCoachNoteStore()
      ..seed(
        1,
        CoachNote(
          id: 7,
          plateLogId: 1,
          anchor: CoachAnchor.postResolve,
          questionKey: 'k',
          text: 'note for porridge',
          generatedAt: DateTime.utc(2026, 8, 15, 8),
        ),
      );
    await notes.recordDismissal(coachNoteDismissalKey(7));
    await tester.pumpWidget(_app(store, notes));
    await tester.pumpAndSettle();
    expect(find.byType(PlateRow), findsNWidgets(2));

    await tester.longPress(find.widgetWithText(PlateRow, 'Porridge'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(plateRemoveConfirmKey));
    await tester.pumpAndSettle();

    expect(store.deletedPlateIds, [1]);
    expect(notes.byPlate[1], isNull);
    expect(notes.dismissed, isEmpty);
    expect(find.byType(PlateRow), findsOneWidget);
    expect(find.text('Soup'), findsOneWidget);
    expect(find.text('Porridge'), findsNothing);
    expect(find.text('Plate removed.'), findsOneWidget);
  });

  testWidgets('a failed removal says so, calmly, and keeps the plate', (
    tester,
  ) async {
    final store = _FailingDeleteStore(initial: [_plate(1, 'Porridge', 8)]);
    addTearDown(store.close);
    await tester.pumpWidget(_app(store, FakeCoachNoteStore()));
    await tester.pumpAndSettle();

    await tester.longPress(find.byType(PlateRow));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(plateRemoveConfirmKey));
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t remove it. Try again.'), findsOneWidget);
    expect(find.byType(PlateRow), findsOneWidget);
  });

  testWidgets('reachable by semantics, not swipe/gesture only: a custom '
      '"Remove this plate" action and a long-press action', (tester) async {
    final handle = tester.ensureSemantics();
    final store = FakeEncryptedStore(initial: [_plate(1, 'Porridge', 8)]);
    addTearDown(store.close);
    await tester.pumpWidget(_app(store, FakeCoachNoteStore()));
    await tester.pumpAndSettle();

    final node = tester.getSemantics(
      find.descendant(
        of: find.byType(PlateRow),
        matching: find.byWidgetPredicate(
          (w) =>
              w is Semantics &&
              w.properties.customSemanticsActions != null &&
              w.properties.customSemanticsActions!.isNotEmpty,
        ),
      ),
    );
    final data = node.getSemanticsData();
    expect(data.hasAction(SemanticsAction.longPress), isTrue);
    final actions = data.customSemanticsActionIds ?? const <int>[];
    final labels = [
      for (final id in actions) CustomSemanticsAction.getAction(id)!.label,
    ];
    expect(labels, contains('Remove this plate'));
    expect(data.hint, 'Press and hold to remove this plate');

    // Performing the screen reader action opens the same confirm.
    tester.semantics.performAction(
      find.semantics.byPredicate(
        (n) =>
            n.getSemanticsData().hasAction(SemanticsAction.longPress) &&
            n.label.contains('Porridge'),
      ),
      SemanticsAction.longPress,
    );
    await tester.pumpAndSettle();
    expect(find.text('Remove this plate?'), findsOneWidget);
    handle.dispose();
  });
}
