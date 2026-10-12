// `CoachWhisper` widget tests — serif-italic question + `[sure]`
// sage pill + `[ask later]` amber outline pill; ≥48px tap targets;
// reduced-motion collapses the entrance to a fade only (UX-DR5 /
// NFR3 / NFR7 / NFR8).
//
// Story 2.3 extends the tests to cover the answer / dismiss / depth
// interaction:
//   * `[sure]` opens the depth panel via `depthFollowUpProvider`.
//   * `[ask later]` records the interaction through
//     `recordCoachInteractionProvider` and clears the whisper.
//   * Depth `[close]` records `depthAnswer` and closes the panel.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/coach_depth_panel.dart';
import 'package:ai_nutrition_coach/widgets/coach_whisper.dart';

import '../_fakes/fake_encrypted_store.dart';

final _postResolveNote = CoachNote(
  id: 1,
  plateLogId: 7,
  anchor: CoachAnchor.postResolve,
  questionKey: 'post.resolve.vegLight',
  text: 'A handful of greens would round this plate out.',
  generatedAt: DateTime.utc(2026, 8, 16),
);

Widget _wrap(Widget child, {FakeCoachNoteStore? notes, FakeCoach? coach}) {
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
  group('CoachWhisper', () {
    testWidgets('renders the question text in serif italic (UX-DR5)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A handful of greens would round this plate out.',
            note: _postResolveNote,
          ),
        ),
      );

      expect(
        find.text('A handful of greens would round this plate out.'),
        findsOneWidget,
      );
    });

    testWidgets('renders [sure] + [ask later] buttons (NFR7 / UX-DR5)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'Nice plate — anything you would change next time?',
            note: _postResolveNote,
          ),
        ),
      );

      expect(find.text('sure'), findsOneWidget);
      expect(find.text('ask later'), findsOneWidget);
    });

    testWidgets('both pills hit ≥48px on the short axis (NFR7)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A protein on the side would complete this plate.',
            note: _postResolveNote,
          ),
        ),
      );

      final surePill = find
          .ancestor(of: find.text('sure'), matching: find.byType(Container))
          .first;
      final askLaterPill = find
          .ancestor(
            of: find.text('ask later'),
            matching: find.byType(Container),
          )
          .first;

      final sureSize = tester.getSize(surePill);
      final askLaterSize = tester.getSize(askLaterPill);
      expect(sureSize.height, greaterThanOrEqualTo(AppTouchTargets.min));
      expect(askLaterSize.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('[sure] opens the depth panel via depthFollowUpProvider '
        '(Story 2.3 / FR5)', (tester) async {
      final coach = FakeCoach()
        ..emit(
          const CoachFound(
            CoachQuestion(
              key: 'depth.followUp.vegLight',
              text: 'A handful of greens would round this plate out.',
              anchor: CoachAnchor.depthFollowUp,
              pattern: CompositionPattern.vegLight,
            ),
          ),
        );
      final notes = FakeCoachNoteStore();
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A handful of greens would round this plate out.',
            note: _postResolveNote,
          ),
          notes: notes,
          coach: coach,
        ),
      );

      expect(find.byType(CoachDepthPanel), findsNothing);

      await tester.tap(find.text('sure'));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.byType(CoachDepthPanel), findsOneWidget);
      expect(
        find.text('A handful of greens would round this plate out.'),
        findsWidgets,
      );
      expect(notes.interactions, hasLength(1));
      expect(notes.interactions.first.kind, CoachInteraction.sure);
    });

    testWidgets('[ask later] records the interaction through the parent '
        'callback (Story 2.3 / FR5)', (tester) async {
      final notes = FakeCoachNoteStore();
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'Nice plate.',
            note: _postResolveNote,
            onAskLater: () {},
          ),
          notes: notes,
        ),
      );

      await tester.tap(find.text('ask later'));
      await tester.pumpAndSettle();

      expect(notes.interactions, hasLength(1));
      expect(notes.interactions.first.kind, CoachInteraction.askLater);
    });

    testWidgets('depth [close] records depthAnswer and closes the panel', (
      tester,
    ) async {
      final coach = FakeCoach()
        ..emit(
          const CoachFound(
            CoachQuestion(
              key: 'depth.followUp.vegLight',
              text: 'A handful of greens would round this plate out.',
              anchor: CoachAnchor.depthFollowUp,
              pattern: CompositionPattern.vegLight,
            ),
          ),
        );
      final notes = FakeCoachNoteStore();
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A handful of greens would round this plate out.',
            note: _postResolveNote,
          ),
          notes: notes,
          coach: coach,
        ),
      );

      await tester.tap(find.text('sure'));
      await tester.pumpAndSettle();
      expect(find.byType(CoachDepthPanel), findsOneWidget);

      await tester.tap(find.text('close'));
      await tester.pumpAndSettle();

      expect(find.byType(CoachDepthPanel), findsNothing);
      expect(notes.interactions, hasLength(2));
      expect(notes.interactions[0].kind, CoachInteraction.sure);
      expect(notes.interactions[1].kind, CoachInteraction.depthAnswer);
    });

    testWidgets('a11y: question is announced + buttons are labelled by name', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A handful of greens would round this plate out.',
            note: _postResolveNote,
          ),
        ),
      );

      final whisperSemantics = tester.getSemantics(find.byType(CoachWhisper));
      expect(whisperSemantics.label, contains('A handful of greens'));

      expect(tester.getSemantics(find.text('sure')).label, contains('sure'));
      expect(
        tester.getSemantics(find.text('ask later')).label,
        contains('ask later'),
      );
    });

    testWidgets('dark mode: pill colors come from AppPalette.dark (NFR8)', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
            coachProvider.overrideWithValue(FakeCoach()),
            coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
          ],
          child: MaterialApp(
            theme: ThemeData.dark(),
            home: Scaffold(
              backgroundColor: AppPalette.dark.background,
              body: Center(
                child: CoachWhisper(
                  question: 'A handful of greens would round this plate out.',
                  note: _postResolveNote,
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('sure'), findsOneWidget);
      expect(find.text('ask later'), findsOneWidget);
    });

    testWidgets('reduced-motion: still renders without crashing (NFR8)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'Nice plate — anything you would change next time?',
            note: _postResolveNote,
          ),
        ),
      );
      expect(find.byType(CoachWhisper), findsOneWidget);
    });

    testWidgets('null onAskLater: pill renders but does not crash on tap', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          CoachWhisper(
            question: 'A handful of greens would round this plate out.',
            note: _postResolveNote,
          ),
        ),
      );

      expect(find.text('sure'), findsOneWidget);
      expect(find.text('ask later'), findsOneWidget);

      await tester.tap(find.text('ask later'));
      await tester.pump();
    });
  });
}
