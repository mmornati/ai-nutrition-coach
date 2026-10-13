// `OpenPlateHint` widget tests — serif-italic open-plate whisper
// rendered inside an `OpenDent` row when the active `Coach` port
// returns a non-empty `openPlate` question (FR5 / UX-DR5 / AC #4).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/day_board_provider.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/open_dent.dart';
import 'package:ai_nutrition_coach/widgets/open_plate_hint.dart';

import '../_fakes/fake_encrypted_store.dart';

Widget _wrap(Widget child, {FakeCoach? coach, FakeCoachNoteStore? notes}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
      coachProvider.overrideWithValue(coach ?? FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(notes ?? FakeCoachNoteStore()),
    ],
    child: MaterialApp(
      home: Scaffold(
        backgroundColor: AppPalette.light.background,
        body: Center(child: child),
      ),
    ),
  );
}

void main() {
  group('OpenPlateHint (direct)', () {
    testWidgets('renders the question text (UX-DR5)', (tester) async {
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            questionKey: 'openPlate.balanced',
            question: 'Greens would round this plate out.',
            dismissalKey: 'openPlate:2026-08-16:breakfast',
            onDismissed: () {},
          ),
        ),
      );

      expect(find.text('Greens would round this plate out.'), findsOneWidget);
    });

    testWidgets('hit target is ≥48px (NFR7)', (tester) async {
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            questionKey: 'openPlate.balanced',
            question: 'Greens would round this plate out.',
            dismissalKey: 'openPlate:2026-08-16:breakfast',
            onDismissed: () {},
          ),
        ),
      );

      final size = tester.getSize(find.byType(OpenPlateHint));
      expect(size.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('fires onDismissed callback when tapped', (tester) async {
      var fired = 0;
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            questionKey: 'openPlate.balanced',
            question: 'Greens would round this plate out.',
            dismissalKey: 'openPlate:2026-08-16:breakfast',
            onDismissed: () => fired++,
          ),
        ),
      );

      await tester.tap(find.byType(OpenPlateHint));
      await tester.pump();
      expect(fired, 1);
    });

    testWidgets('a11y: hint is announced by label', (tester) async {
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            questionKey: 'openPlate.balanced',
            question: 'Greens would round this plate out.',
            dismissalKey: 'openPlate:2026-08-16:breakfast',
            onDismissed: () {},
          ),
        ),
      );

      final semantics = tester.getSemantics(find.byType(OpenPlateHint));
      expect(semantics.label, contains('Greens would round this plate out.'));
    });
  });

  group('OpenDent renders OpenPlateHint when the active coach has a question '
      '(FR5)', () {
    testWidgets('renders the hint when Coach.questionFor returns CoachFound', (
      tester,
    ) async {
      final coach = FakeCoach()
        ..emit(
          const CoachFound(
            CoachQuestion(
              key: 'openPlate.balanced',
              text: 'A calm, varied plate — anything you want to add?',
              anchor: CoachAnchor.openPlate,
              pattern: CompositionPattern.balanced,
            ),
          ),
        );

      await tester.pumpWidget(
        _wrap(
          OpenDent(slot: MealSlot.breakfast, day: DateTime(2026, 8, 16)),
          coach: coach,
        ),
      );

      expect(
        find.text('A calm, varied plate — anything you want to add?'),
        findsOneWidget,
      );
    });

    testWidgets('does not render the hint when Coach.questionFor returns '
        'NoCoachQuestion', (tester) async {
      final coach = FakeCoach(); // defaults to NoCoachQuestion
      await tester.pumpWidget(
        _wrap(
          OpenDent(slot: MealSlot.breakfast, day: DateTime(2026, 8, 16)),
          coach: coach,
        ),
      );

      expect(find.byType(OpenPlateHint), findsNothing);
      expect(find.text('An open, quiet place.'), findsOneWidget);
    });

    testWidgets(
      'tapping the hint hides it locally AND records a dismiss '
      'interaction through the use-case (AC #4 / HAPPY_PATH_OPEN_PLATE_HINT)',
      (tester) async {
        final coach = FakeCoach()
          ..emit(
            const CoachFound(
              CoachQuestion(
                key: 'openPlate.balanced',
                text: 'A calm, varied plate — anything you want to add?',
                anchor: CoachAnchor.openPlate,
                pattern: CompositionPattern.balanced,
              ),
            ),
          );
        final notes = FakeCoachNoteStore();

        await tester.pumpWidget(
          _wrap(
            OpenDent(slot: MealSlot.breakfast, day: DateTime(2026, 8, 16)),
            coach: coach,
            notes: notes,
          ),
        );
        expect(find.byType(OpenPlateHint), findsOneWidget);

        await tester.tap(find.byType(OpenPlateHint));
        await tester.pumpAndSettle();

        // The hint hides; the dent returns to its quiet form.
        expect(find.byType(OpenPlateHint), findsNothing);
        // F6: the dismissal is a DURABLE marker keyed by (day, slot) — no
        // synthetic plateLogId: 0 note, no interaction row.
        expect(notes.dismissed, {'openPlate:2026-08-16:breakfast'});
        expect(notes.interactions, isEmpty);
        expect(notes.byPlate, isEmpty);
      },
    );

    testWidgets('a persisted dismissal keeps the hint hidden on the next '
        'launch (F6)', (tester) async {
      final notes = FakeCoachNoteStore()
        ..dismissed.add('openPlate:2026-08-16:breakfast');
      final coach = FakeCoach()
        ..emit(
          const CoachFound(
            CoachQuestion(
              key: 'openPlate.balanced',
              text: 'A calm, varied plate — anything you want to add?',
              anchor: CoachAnchor.openPlate,
              pattern: CompositionPattern.balanced,
            ),
          ),
        );
      await tester.pumpWidget(
        _wrap(
          OpenDent(slot: MealSlot.breakfast, day: DateTime(2026, 8, 16)),
          coach: coach,
          notes: notes,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(OpenPlateHint), findsNothing);
    });

    testWidgets('the dismissal is per day and slot: another day asks again', (
      tester,
    ) async {
      final notes = FakeCoachNoteStore()
        ..dismissed.add('openPlate:2026-08-16:breakfast');
      final coach = FakeCoach()
        ..emit(
          const CoachFound(
            CoachQuestion(
              key: 'openPlate.balanced',
              text: 'A calm, varied plate — anything you want to add?',
              anchor: CoachAnchor.openPlate,
              pattern: CompositionPattern.balanced,
            ),
          ),
        );
      await tester.pumpWidget(
        _wrap(
          OpenDent(slot: MealSlot.breakfast, day: DateTime(2026, 8, 17)),
          coach: coach,
          notes: notes,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(OpenPlateHint), findsOneWidget);
    });
  });
}
