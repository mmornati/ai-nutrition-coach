// `OpenPlateHint` widget tests — serif-italic open-plate whisper
// rendered inside an `OpenDent` row when the active `Coach` port
// returns a non-empty `openPlate` question (FR5 / UX-DR5).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/state/day_board_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';
import 'package:openplate_client/widgets/open_dent.dart';
import 'package:openplate_client/widgets/open_plate_hint.dart';

import '../_fakes/fake_encrypted_store.dart';

Widget _wrap(
  Widget child, {
  FakeCoach? coach,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
      coachProvider.overrideWithValue(coach ?? FakeCoach()),
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
            question: 'Greens would round this plate out.',
            onTap: () {},
          ),
        ),
      );

      expect(
        find.text('Greens would round this plate out.'),
        findsOneWidget,
      );
    });

    testWidgets('hit target is ≥48px (NFR7)', (tester) async {
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            question: 'Greens would round this plate out.',
            onTap: () {},
          ),
        ),
      );

      final size = tester.getSize(find.byType(OpenPlateHint));
      expect(size.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('fires onTap callback when tapped', (tester) async {
      var fired = 0;
      await tester.pumpWidget(
        _wrap(
          OpenPlateHint(
            question: 'Greens would round this plate out.',
            onTap: () => fired++,
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
            question: 'Greens would round this plate out.',
            onTap: () {},
          ),
        ),
      );

      final semantics = tester.getSemantics(find.byType(OpenPlateHint));
      expect(semantics.label, contains('Greens would round this plate out.'));
    });
  });

  group('OpenDent renders OpenPlateHint when the active coach has a question '
      '(FR5)', () {
    testWidgets('renders the hint when Coach.questionFor returns CoachFound',
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

      await tester.pumpWidget(
        _wrap(const OpenDent(slot: MealSlot.breakfast), coach: coach),
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
        _wrap(const OpenDent(slot: MealSlot.breakfast), coach: coach),
      );

      expect(find.byType(OpenPlateHint), findsNothing);
      expect(find.text('An open, quiet place.'), findsOneWidget);
    });

    testWidgets('tapping the hint hides it locally', (tester) async {
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
        _wrap(const OpenDent(slot: MealSlot.breakfast), coach: coach),
      );
      expect(find.byType(OpenPlateHint), findsOneWidget);

      await tester.tap(find.byType(OpenPlateHint));
      await tester.pump();

      // The hint hides; the dent returns to its quiet form.
      expect(find.byType(OpenPlateHint), findsNothing);
    });
  });
}
