// The `AboutScreen` pin (Story 5.2 / FR-14 / OQ-4 / AD-7).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/about_screen.dart';

void main() {
  group('AboutScreen', () {
    testWidgets('renders the v2 managed-oversight notice line', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: AboutScreen(),
        ),
      );
      expect(
        find.textContaining('Family oversight is a v2 seam',
            findRichText: true),
        findsOneWidget,
      );
    });

    testWidgets('renders the open-source footmark', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: AboutScreen(),
        ),
      );
      expect(find.text('yours to run · open source'), findsOneWidget);
    });

    test('ManagedOversightStrings key set is anchored', () {
      expect(enManagedOversightStrings.v2Notice, isNotEmpty);
      expect(
        enManagedOversightStrings.v2Notice.toLowerCase(),
        contains('not in v1'),
      );
    });
  });
}
