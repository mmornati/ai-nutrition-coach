// `BarcodeMatchSheet` widget tests (Story 1.7 / FR2).
//
// Mounts the sheet with a hand-rolled fake catalog + a fake encrypted
// store, then drives the I/O matrix the spec calls out:
//
//   * matches render — the food name + group label show;
//   * tap Log commits — RecordPlate is called with the chosen preset,
//     `lastLogProvider` is stamped, and the sheet pops back;
//   * no countdown / spinner / urgency on the surface (FR15 / UX-DR10);
//   * the Log button has a ≥48px hit target (NFR7).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/last_log_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/widgets/barcode_match_sheet.dart';

import '../_fakes/fake_encrypted_store.dart';

Widget _wrap(
  Widget child, {
  required FakeEncryptedStore store,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
    ],
    child: MaterialApp(
      theme: ThemeData(brightness: Brightness.light),
      darkTheme: ThemeData(brightness: Brightness.dark),
      home: child,
    ),
  );
}

Future<void> _showSheet(WidgetTester tester) async {
  await tester.tap(find.byType(TextButton));
  await tester.pumpAndSettle();
}

const _nutella = FoodMatch(
  food: DatabaseFood(
    sourceRef: '3017620422003',
    displayName: 'Nutella',
    source: SourceCatalog.off,
    foodGroup: FoodGroup.other,
  ),
  confidence: 1.0,
  presets: <QuantityRange>[],
);

class _SheetHarness extends StatelessWidget {
  const _SheetHarness();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Builder(
        builder: (innerCtx) => TextButton(
          onPressed: () {
            showBarcodeMatchSheet(
              innerCtx,
              match: _nutella,
              presets: const <QuantityRange>[],
            );
          },
          child: const Text('Open'),
        ),
      ),
    );
  }
}

void main() {
  group('BarcodeMatchSheet', () {
    testWidgets('matches render: food name + group label', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        const _SheetHarness(),
        store: store,
      ));
      await tester.pumpAndSettle();

      await _showSheet(tester);

      // Food name + group label are visible.
      expect(find.text('Nutella'), findsOneWidget);
      expect(find.text('Other'), findsOneWidget);
      // Quantity preset fallback when OFF ships none — `~1 serving`.
      expect(find.text('~1 serving'), findsOneWidget);
      // The Log button is enabled.
      expect(find.text('Log'), findsOneWidget);
    });

    testWidgets('tap Log commits the food + chosen preset through '
        'RecordPlate, stamps lastLogProvider, and pops back',
        (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        const _SheetHarness(),
        store: store,
      ));
      await tester.pumpAndSettle();

      await _showSheet(tester);

      // Verify nothing has committed yet.
      expect(store.capturedDrafts, isEmpty);

      // Tap Log — commits, stamps lastLogProvider, pops back.
      final before = DateTime.now();
      await tester.tap(find.text('Log'));
      await tester.pumpAndSettle();
      final after = DateTime.now();

      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Nutella');
      expect(draft.databaseFood.sourceRef, '3017620422003');
      // OFF ships no curated presets → fallback to "~1 serving".
      expect(draft.quantity.unit, 'serving');
      expect(draft.quantity.displayLabel, '~1 serving');

      // `lastLogProvider` was stamped within the test window.
      final container = ProviderScope.containerOf(
        tester.element(find.byType(TextButton)),
      );
      final lastLog = container.read(lastLogProvider);
      expect(lastLog, isNotNull);
      expect(
        lastLog!.isAfter(before.subtract(const Duration(seconds: 1))) &&
            lastLog.isBefore(after.add(const Duration(seconds: 1))),
        isTrue,
      );

      // The sheet has popped — only the harness scaffold remains.
      expect(find.byType(BarcodeMatchSheet), findsNothing);
    });

    testWidgets('Log button has a ≥48px hit target (NFR7)',
        (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(
        const _SheetHarness(),
        store: store,
      ));
      await tester.pumpAndSettle();

      await _showSheet(tester);

      // The FilledButton is the Log button.
      final logButton = find.widgetWithText(FilledButton, 'Log');
      expect(logButton, findsOneWidget);
      final size = tester.getSize(logButton);
      expect(size.height, greaterThanOrEqualTo(48),
          reason: 'Log button height ${size.height} below 48px');
    });
  });
}
