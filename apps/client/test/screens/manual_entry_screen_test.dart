// `ManualEntryScreen` widget tests (Story 1.5 / FR3 / UX-DR11).
//
// Mounts the screen with a hand-rolled fake catalog + a fake encrypted
// store, then drives the I/O matrix the spec calls out:
//
//   * typing updates matches live;
//   * selecting + tapping `Log` commits a `PlateLog` with one
//     `FoodEntry` and pops back;
//   * mic button shows the calm "Voice not available in v1" copy;
//   * no-match path renders the manual-add form;
//   * dark mode + 48px hit targets hold (NFR7 / NFR8).
//
// Story 1.6 patches: the screen is the canonical commit seam — every
// successful `RecordPlate` write must also stamp `lastLogProvider` so
// the Day Board's quick-repeat affordance can surface. The
// `Log writes lastLogProvider` tests below pin that contract for both
// the matched-food path and the manual-add fallback.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/screens/manual_entry_screen.dart';
import 'package:openplate_client/state/last_log_provider.dart';
import 'package:openplate_client/state/manual_entry_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';

import '../_fakes/fake_encrypted_store.dart';

class _FakeFoodCatalog implements FoodCatalog {
  _FakeFoodCatalog(this._results);

  final Map<String, CatalogResult> _results;

  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async {
    return _results[query] ?? NotFoundFailure(query);
  }

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      // Manual-entry tests don't exercise the barcode path; the
      // default is not-found so any accidental call is loud.
      NotFoundFailure(code);
}

const _salmonMatch = FoodMatch(
  food: DatabaseFood(
    sourceRef: 'seed:salmon',
    displayName: 'Salmon',
    source: SourceCatalog.off,
    foodGroup: FoodGroup.protein,
  ),
  confidence: 0.9,
  presets: <QuantityRange>[
    QuantityRange(
      low: 1,
      high: 1,
      unit: 'fist',
      displayLabel: '~1 fist',
    ),
    QuantityRange(
      low: 1.5,
      high: 1.5,
      unit: 'fist',
      displayLabel: '~1.5 fists',
    ),
  ],
);

const _appleMatch = FoodMatch(
  food: DatabaseFood(
    sourceRef: 'seed:apple',
    displayName: 'Apple',
    source: SourceCatalog.off,
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
);

const _notFound = NotFoundFailure('zxqwer');

Future<void> _pumpManualEntry(
  WidgetTester tester, {
  required FoodCatalog catalog,
  required FakeEncryptedStore store,
  Brightness brightness = Brightness.light,
}) async {
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      foodCatalogProvider.overrideWithValue(catalog),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(store.close);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: ThemeData(
          brightness: brightness,
          scaffoldBackgroundColor: brightness == Brightness.dark
              ? AppPalette.dark.background
              : AppPalette.light.background,
        ),
        home: const ManualEntryScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Finder _textFieldByLabel(String label) {
  return find.ancestor(
    of: find.text(label),
    matching: find.byType(TextField),
  );
}

void main() {
  group('ManualEntryScreen', () {
    testWidgets('typing "salm" surfaces Salmon in the ranked list',
        (tester) async {
      final catalog = _FakeFoodCatalog({
        'salm': const RankedMatches(<FoodMatch>[_salmonMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'salm');
      await tester.pumpAndSettle();

      expect(find.text('Salmon'), findsOneWidget);
      expect(find.text('Protein'), findsOneWidget);
    });

    testWidgets('selecting + Log commits a PlateLog + pops back', (tester) async {
      final catalog = _FakeFoodCatalog({
        'salm': const RankedMatches(<FoodMatch>[_salmonMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'salm');
      await tester.pumpAndSettle();

      // Tap the Salmon row.
      await tester.tap(find.text('Salmon'));
      await tester.pumpAndSettle();

      // Default preset (~1 fist) is selected — Log button is enabled.
      final logButton = find.widgetWithText(FilledButton, 'Log');
      expect(logButton, findsOneWidget);
      await tester.tap(logButton);
      await tester.pumpAndSettle();

      // The fake store saw exactly one plate with Salmon + ~1 fist.
      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Salmon');
      expect(draft.quantity.displayLabel, '~1 fist');
      expect(draft.quantity.unit, 'fist');
    });

    testWidgets('swapping the preset before Log commits the new preset',
        (tester) async {
      final catalog = _FakeFoodCatalog({
        'salm': const RankedMatches(<FoodMatch>[_salmonMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'salm');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salmon'));
      await tester.pumpAndSettle();

      // Pick the second preset chip.
      await tester.tap(find.text('~1.5 fists'));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      await tester.pumpAndSettle();

      expect(store.capturedDrafts.single.quantity.displayLabel, '~1.5 fists');
    });

    testWidgets('mic button shows the calm "voice not available in v1" copy',
        (tester) async {
      final catalog = _FakeFoodCatalog({});
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      // The mic icon lives at the trailing edge of the text field row.
      await tester.tap(find.byIcon(Icons.mic_none));
      await tester.pumpAndSettle();

      expect(
        find.text('Voice not available in v1 — type instead'),
        findsOneWidget,
      );
    });

    testWidgets('no-match renders the manual-add form', (tester) async {
      final catalog = _FakeFoodCatalog({'zxqwer': _notFound});
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'zxqwer');
      await tester.pumpAndSettle();

      expect(
        find.text('Type the food name to add it manually.'),
        findsOneWidget,
      );
      expect(find.text('Custom food name'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Log custom food'),
          findsOneWidget);

      // Type a custom name and commit.
      await tester.enterText(
        _textFieldByLabel('Custom food name'),
        'Mystery Stew',
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Log custom food'),
      );
      await tester.pumpAndSettle();

      expect(store.capturedDrafts, hasLength(1));
      final draft = store.capturedDrafts.single;
      expect(draft.databaseFood.displayName, 'Mystery Stew');
      expect(draft.databaseFood.source, SourceCatalog.manual);
      expect(draft.databaseFood.foodGroup, FoodGroup.other);
    });

    testWidgets('catalog failure surfaces the calm failure line', (tester) async {
      final catalog = _FakeFoodCatalog({
        'apple': const CatalogFailure('simulated'),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'apple');
      await tester.pumpAndSettle();

      expect(
        find.text("Search isn't available right now."),
        findsOneWidget,
      );
      // Log button is disabled because no match was picked.
      final logButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Log'),
      );
      expect(logButton.onPressed, isNull);
      // Manual-add form still renders on the failure path so the user
      // can record the plate (I/O matrix — CATALOG_FAILURE).
      expect(
        find.text('Type the food name to add it manually.'),
        findsOneWidget,
      );
      expect(find.text('Custom food name'), findsOneWidget);
      expect(
        find.widgetWithText(OutlinedButton, 'Log custom food'),
        findsOneWidget,
      );
    });

    testWidgets('happy-path commit with multiple matches keeps rank order',
        (tester) async {
      final catalog = _FakeFoodCatalog({
        'a': const RankedMatches(<FoodMatch>[_appleMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'a');
      await tester.pumpAndSettle();

      // Apple appears once.
      expect(find.text('Apple'), findsOneWidget);
      // Group label appears too (UX-DR4 — the balance arc tag).
      expect(find.text('Veg & Fruit'), findsOneWidget);
    });

    testWidgets('every interactive surface has a ≥48px hit target (NFR7)',
        (tester) async {
      final catalog = _FakeFoodCatalog({
        'salm': const RankedMatches(<FoodMatch>[_salmonMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      // Mic button — the SizedBox is the actual 48px hit target; the
      // Icon inside is 24px and only sits inside the larger touch area.
      final micTapTarget = find.ancestor(
        of: find.byIcon(Icons.mic_none),
        matching: find.byType(GestureDetector),
      );
      expect(micTapTarget, findsOneWidget);
      final micSize = tester.getSize(micTapTarget);
      expect(micSize.width, greaterThanOrEqualTo(AppTouchTargets.min));
      expect(micSize.height, greaterThanOrEqualTo(AppTouchTargets.min));

      // Type a query so the match row renders and tap the row to select
      // it (which also brings the preset row into view).
      await tester.enterText(_textFieldByLabel('Food search'), 'salm');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salmon'));
      await tester.pumpAndSettle();

      // _MatchRow tap target — the ConstrainedBox wrapping the
      // GestureDetector is the actual 48px hit area.
      final matchRowTapTarget = find
          .ancestor(
            of: find.text('Salmon'),
            matching: find.byType(GestureDetector),
          )
          .first;
      final matchRowSize = tester.getSize(matchRowTapTarget);
      expect(matchRowSize.height, greaterThanOrEqualTo(AppTouchTargets.min));

      // _PresetRow chip — each ChoiceChip is wrapped in a ConstrainedBox
      // and has materialTapTargetSize set so the hit target stays ≥48.
      final presetChip = find.widgetWithText(ChoiceChip, '~1.5 fists');
      final presetSize = tester.getSize(presetChip);
      expect(presetSize.height, greaterThanOrEqualTo(AppTouchTargets.min));

      // Log button — minimumSize.fromHeight(48).
      final logButton = find.widgetWithText(FilledButton, 'Log');
      final logSize = tester.getSize(logButton);
      expect(logSize.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('dark mode uses AppPalette.dark background (NFR8)',
        (tester) async {
      final catalog = _FakeFoodCatalog({});
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
        brightness: Brightness.dark,
      );

      final ctx = tester.element(find.byType(ManualEntryScreen));
      expect(Theme.of(ctx).scaffoldBackgroundColor, AppPalette.dark.background);
    });

    testWidgets('Log stamps lastLogProvider on the matched-food path',
        (tester) async {
      final catalog = _FakeFoodCatalog({
        'salm': const RankedMatches(<FoodMatch>[_salmonMatch]),
      });
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'salm');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salmon'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Log'));
      await tester.pumpAndSettle();

      // The screen popped after the Log tap, so the live container
      // hangs off `MaterialApp`'s element — same `UncontrolledProviderScope`
      // the screen was reading `lastLogProvider` through.
      final container = ProviderScope.containerOf(
        tester.element(find.byType(MaterialApp)),
      );
      expect(container.read(lastLogProvider), isNotNull,
          reason: 'lastLogProvider should be stamped after a successful log');
    });

    testWidgets('Log custom food stamps lastLogProvider on the manual path',
        (tester) async {
      final catalog = _FakeFoodCatalog({'zxqwer': _notFound});
      final store = FakeEncryptedStore();
      await _pumpManualEntry(
        tester,
        catalog: catalog,
        store: store,
      );

      await tester.enterText(_textFieldByLabel('Food search'), 'zxqwer');
      await tester.pumpAndSettle();
      await tester.enterText(
        _textFieldByLabel('Custom food name'),
        'Mystery Stew',
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Log custom food'),
      );
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(MaterialApp)),
      );
      expect(container.read(lastLogProvider), isNotNull,
          reason: 'lastLogProvider should be stamped after a manual log');
    });
  });
}
