// `StatusChip` widget tests — mono `· local` chip (UX-DR6).
//
// The chip is the only base state in Epic 1 — `· pending` / `· synced`
// arrive with Epic 4. The chip is a status marker, not an affordance:
// it is never a button, but its parent row owns the 48px hit target.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/theme/app_tokens.dart';
import 'package:openplate_client/widgets/status_chip.dart';

void main() {
  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Brightness brightness = Brightness.light,
  }) {
    return tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: brightness),
        home: Scaffold(
          backgroundColor: brightness == Brightness.dark
              ? AppPalette.dark.background
              : AppPalette.light.background,
          body: Center(child: child),
        ),
      ),
    );
  }

  group('StatusChip', () {
    testWidgets('renders mono `· local` by default', (tester) async {
      await pump(tester, const StatusChip());

      final text = tester.widget<Text>(find.text('· local'));
      expect(text, isNotNull);
      // Role-bound typography: mono (UX-DR6) — the chip is never
      // louder than the row body.
      expect(text.style!.fontFamily, 'monospace');
      expect(text.style!.color, AppPalette.light.statusLocal);
    });

    testWidgets('custom label overrides the default', (tester) async {
      await pump(tester, const StatusChip(label: '· custom'));
      expect(find.text('· custom'), findsOneWidget);
      expect(find.text('· local'), findsNothing);
    });

    testWidgets('exposes a Semantics label announcing the status',
        (tester) async {
      await pump(tester, const StatusChip());

      final semantics = tester.getSemantics(find.byType(StatusChip));
      expect(semantics.label, contains('Status:'));
      expect(semantics.label, contains('· local'));
    });

    testWidgets('reads dark-palette status color in dark mode', (tester) async {
      await pump(
        tester,
        const StatusChip(),
        brightness: Brightness.dark,
      );

      final text = tester.widget<Text>(find.text('· local'));
      expect(text.style!.color, AppPalette.dark.statusLocal);
    });
  });
}
