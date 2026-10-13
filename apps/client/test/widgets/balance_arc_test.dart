// `BalanceArc` widget tests — 4-segment sage-on-hairline custom painter
// (UX-DR4). The screen-reader announces food groups, not the count
// (NFR7 — color is never the sole signal).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/balance_arc.dart';

void main() {
  Future<void> pump(WidgetTester tester, Widget child) {
    return tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          backgroundColor: AppPalette.light.background,
          body: Center(child: child),
        ),
      ),
    );
  }

  group('BalanceArc', () {
    testWidgets('paints 4 segments and declares food groups via Semantics', (
      tester,
    ) async {
      await pump(
        tester,
        BalanceArc(
          filled: const [true, true, true, false],
          announceFilled: false,
        ),
      );

      // The arc itself — a `CustomPaint` with the painter — is on the
      // tree. Painting details are exercised by the parent widget test;
      // here we lock the structural contract.
      expect(
        find.descendant(
          of: find.byType(BalanceArc),
          matching: find.byType(CustomPaint),
        ),
        findsOneWidget,
      );

      // Semantics label lists the four food groups; NFR7 mandates
      // "color is never the sole signal" — the screen reader hears the
      // groups even when the arc is unfilled.
      final semantics = tester.getSemantics(find.byType(BalanceArc));
      final label = semantics.label;
      expect(label, contains('Veg & Fruit'));
      expect(label, contains('Protein'));
      expect(label, contains('Starch'));
      expect(label, contains('Dairy'));
    });

    testWidgets('filled count shows in mono arcnote when announceFilled=true', (
      tester,
    ) async {
      await pump(
        tester,
        BalanceArc(
          filled: const [true, true, true, false],
          announceFilled: true,
        ),
      );

      // 3 of 4 — the arcnote is mono, mono-whisper sized.
      expect(find.text('3 of 4'), findsOneWidget);
    });

    testWidgets('arcnote is visible even when announceFilled=false', (
      tester,
    ) async {
      await pump(
        tester,
        BalanceArc(
          filled: const [true, true, true, false],
          announceFilled: false,
        ),
      );

      // The visual "3 of 4" arcnote is always present (NFR7 / spec AC).
      // Only the Semantics suffix is gated by `announceFilled`.
      expect(find.text('3 of 4'), findsOneWidget);
    });

    test('constructor validates that filled has one entry per group', () {
      expect(
        () => BalanceArc(filled: const [true, true, false]),
        throwsA(isA<AssertionError>()),
      );
    });
  });
}
