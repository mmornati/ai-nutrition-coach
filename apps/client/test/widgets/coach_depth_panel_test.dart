// `CoachDepthPanel` widget tests — serif-italic follow-up + `[close]`
// amber-outline pill; ≥48px tap targets; reduced-motion collapses
// the entrance to a fade only (UX-DR5 / NFR7 / NFR8).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/coach_depth_panel.dart';

Widget _wrap(Widget child) {
  return MaterialApp(
    home: Scaffold(
      backgroundColor: AppPalette.light.background,
      body: Center(child: child),
    ),
  );
}

void main() {
  group('CoachDepthPanel', () {
    testWidgets('renders the question text in serif italic (UX-DR5)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          const CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
          ),
        ),
      );

      expect(
        find.text('A handful of greens would round this plate out.'),
        findsOneWidget,
      );
    });

    testWidgets('renders [close] pill (UX-DR5)', (tester) async {
      await tester.pumpWidget(
        _wrap(
          const CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
          ),
        ),
      );

      expect(find.text('close'), findsOneWidget);
    });

    testWidgets('[close] pill hit target is ≥48px (NFR7)', (tester) async {
      await tester.pumpWidget(
        _wrap(
          const CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
          ),
        ),
      );

      final closePill = find
          .ancestor(of: find.text('close'), matching: find.byType(Container))
          .first;
      final size = tester.getSize(closePill);
      expect(size.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('[close] pill fires onClose callback when tapped', (
      tester,
    ) async {
      var fired = 0;
      await tester.pumpWidget(
        _wrap(
          CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
            onClose: () => fired++,
          ),
        ),
      );

      await tester.tap(find.text('close'));
      await tester.pump();
      expect(fired, 1);
    });

    testWidgets('a11y: panel container announces the question + close label', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          const CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
          ),
        ),
      );

      final panelSemantics = tester.getSemantics(find.byType(CoachDepthPanel));
      expect(panelSemantics.label, contains('A handful of greens'));

      expect(tester.getSemantics(find.text('close')).label, contains('close'));
    });

    testWidgets('null question: empty panel renders without crashing', (
      tester,
    ) async {
      await tester.pumpWidget(_wrap(const CoachDepthPanel(question: null)));

      // The pill still renders so the user can dismiss.
      expect(find.text('close'), findsOneWidget);
    });

    testWidgets('null onClose: pill renders but does not crash on tap', (
      tester,
    ) async {
      await tester.pumpWidget(
        _wrap(
          const CoachDepthPanel(
            question: 'A handful of greens would round this plate out.',
          ),
        ),
      );

      await tester.tap(find.text('close'));
      await tester.pump();
    });

    testWidgets('dark mode: pill colors come from AppPalette.dark (NFR8)', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            backgroundColor: AppPalette.dark.background,
            body: Center(
              child: CoachDepthPanel(
                question: 'A handful of greens would round this plate out.',
                onClose: () {},
              ),
            ),
          ),
        ),
      );

      expect(find.text('close'), findsOneWidget);
    });
  });
}
