// Your data, the PWA additions (ADR-0003): the storage-protection line (web),
// "Last export" (all platforms) and the ONE quiet, dismissible export
// suggestion (no badge, no modal, docs/no-dark-patterns-standard.md).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/screens/your_data_screen.dart';
import 'package:openplate_client/state/exporter_provider.dart';
import 'package:openplate_client/state/pwa_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/state/web_store_controller_provider.dart';

import '../_fakes/fake_encrypted_store.dart';
import '../_fakes/fake_web_store_controller.dart';

PlateLog _plate() => PlateLog(
  id: 1,
  loggedAtUtc: DateTime.now().toUtc(),
  entries: const <FoodEntry>[],
);

Future<ExportHistory> _pump(
  WidgetTester tester, {
  StoragePersistence? storage,
  FakeWebStoreController? web,
  bool withData = true,
  DateTime? lastExport,
  DateTime? dismissed,
  RecordingExportDestination? destination,
}) async {
  tester.view.physicalSize = const Size(800, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final history = ExportHistory(InMemoryKeyValueStore());
  if (lastExport != null) await history.record(lastExport);
  if (dismissed != null) await history.recordReminderDismissed(dismissed);
  final store = FakeEncryptedStore(initial: withData ? [_plate()] : const []);
  addTearDown(store.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        exportHistoryProvider.overrideWithValue(history),
        encryptedStoreProvider.overrideWithValue(store),
        if (storage != null)
          storagePersistenceProvider.overrideWithValue(
            FixedStoragePersistence(storage),
          ),
        if (web != null) webStoreControllerProvider.overrideWithValue(web),
        if (destination != null)
          exportDestinationProvider.overrideWithValue(destination),
      ],
      child: const MaterialApp(home: YourDataScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return history;
}

void main() {
  // The app installs GlobalMaterialLocalizations (which loads the date data);
  // a bare MaterialApp does not.
  setUpAll(() => initializeDateFormatting());

  group('storage protection line (web only)', () {
    testWidgets('protected', (tester) async {
      await _pump(
        tester,
        storage: StoragePersistence.protected,
        web: FakeWebStoreController(status: WebStoreStatus.unlocked),
      );
      expect(
        find.text('Storage: protected from automatic clean-up.'),
        findsOneWidget,
      );
    });

    testWidgets('not protected: says so and asks for regular exports', (
      tester,
    ) async {
      await _pump(
        tester,
        storage: StoragePersistence.notProtected,
        web: FakeWebStoreController(status: WebStoreStatus.unlocked),
      );
      expect(
        find.textContaining('may clear this data if space runs low'),
        findsOneWidget,
      );
      expect(find.textContaining('export regularly'), findsOneWidget);
    });

    testWidgets('unsupported, or not web: no line at all', (tester) async {
      await _pump(
        tester,
        storage: StoragePersistence.unsupported,
        web: FakeWebStoreController(status: WebStoreStatus.unlocked),
      );
      expect(find.textContaining('Storage:'), findsNothing);
      expect(find.textContaining('clean-up'), findsNothing);
    });

    testWidgets('mobile (no web controller) shows no storage line', (
      tester,
    ) async {
      await _pump(tester, storage: StoragePersistence.notProtected);
      expect(find.textContaining('Storage:'), findsNothing);
      expect(find.textContaining('may clear'), findsNothing);
    });
  });

  group('last export + the quiet suggestion', () {
    testWidgets('never exported + data: says never, suggests once, with a '
        '"Not now"', (tester) async {
      await _pump(tester);
      expect(find.text('Last export: never'), findsOneWidget);
      expect(find.textContaining('You have not exported yet'), findsOneWidget);
      expect(find.text('Not now'), findsOneWidget);
    });

    testWidgets('no data: no suggestion', (tester) async {
      await _pump(tester, withData: false);
      expect(find.textContaining('not exported yet'), findsNothing);
      expect(find.text('Not now'), findsNothing);
    });

    testWidgets('recent export: shows the date, no suggestion', (tester) async {
      await _pump(
        tester,
        lastExport: DateTime.now().subtract(const Duration(days: 3)),
      );
      expect(find.textContaining('Last export: '), findsOneWidget);
      expect(find.text('Last export: never'), findsNothing);
      expect(find.text('Not now'), findsNothing);
    });

    testWidgets('older than 14 days: the stale wording', (tester) async {
      await _pump(
        tester,
        lastExport: DateTime.now().subtract(const Duration(days: 20)),
      );
      expect(find.textContaining('It has been a while'), findsOneWidget);
    });

    testWidgets('"Not now" hides it and it stays quiet (persisted)', (
      tester,
    ) async {
      final history = await _pump(tester);
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
      expect(find.textContaining('not exported yet'), findsNothing);
      expect(find.text('Not now'), findsNothing);
      expect(await history.reminderDismissedAt(), isNotNull);
    });

    testWidgets('a dismissal within 14 days keeps it away on the next visit', (
      tester,
    ) async {
      await _pump(
        tester,
        dismissed: DateTime.now().subtract(const Duration(days: 2)),
      );
      expect(find.text('Not now'), findsNothing);
      expect(find.text('Last export: never'), findsOneWidget);
    });

    testWidgets('exporting records the date and clears the suggestion', (
      tester,
    ) async {
      final destination = RecordingExportDestination();
      final history = await _pump(tester, destination: destination);
      expect(await history.lastExportAt(), isNull);
      await tester.tap(find.text(enExportStrings.exportButton));
      await tester.pumpAndSettle();
      expect(destination.writes, hasLength(1));
      expect(await history.lastExportAt(), isNotNull);
      expect(find.text('Last export: never'), findsNothing);
      expect(find.text('Not now'), findsNothing);
    });
  });
}
