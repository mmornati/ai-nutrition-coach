// `StatusChip` widget tests — mono `· local` chip (UX-DR6).
//
// The chip derives `· local` / `· pending` / `· synced` / `· retry later`
// from the per-plate sync-queue stream (Epic 4). The chip is a status
// marker, not an affordance: it is never a button, but its parent row owns the 48px hit target.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/sync_queue_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';
import 'package:openplate_client/widgets/status_chip.dart';

void main() {
  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Brightness brightness = Brightness.light,
    List<SyncOpStatus> perPlate = const <SyncOpStatus>[],
  }) async {
    final overrides = <Override>[
      syncQueuePerPlateProvider.overrideWith(
        (ref) => Stream<List<SyncOpStatus>>.value(perPlate),
      ),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: ThemeData(brightness: brightness),
          home: Scaffold(
            backgroundColor: brightness == Brightness.dark
                ? AppPalette.dark.background
                : AppPalette.light.background,
            body: Center(child: child),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  group('StatusChip', () {
    testWidgets('renders mono `· local` when the plate has no queue op', (
      tester,
    ) async {
      await pump(tester, const StatusChip(plateLogId: 1));

      final text = tester.widget<Text>(find.text('· local'));
      expect(text, isNotNull);
      // Role-bound typography: mono (UX-DR6) — the chip is never
      // louder than the row body.
      expect(text.style!.fontFamily, 'monospace');
      expect(text.style!.color, AppPalette.light.statusLocal);
    });

    testWidgets('reflects the queue status for its own plate only', (
      tester,
    ) async {
      await pump(
        tester,
        const StatusChip(plateLogId: 2),
        perPlate: const [
          SyncOpStatus(plateLogId: 1, status: SyncOpStatusValue.pending),
          SyncOpStatus(plateLogId: 2, status: SyncOpStatusValue.synced),
        ],
      );
      expect(find.text('· synced'), findsOneWidget);
      expect(find.text('· pending'), findsNothing);
      expect(find.text('· local'), findsNothing);
    });

    testWidgets('exposes a Semantics label announcing the status', (
      tester,
    ) async {
      await pump(tester, const StatusChip(plateLogId: 1));

      final semantics = tester.getSemantics(find.byType(StatusChip));
      expect(semantics.label, contains('Status:'));
      expect(semantics.label, contains('local'));
    });

    testWidgets('reads dark-palette status color in dark mode', (tester) async {
      await pump(
        tester,
        const StatusChip(plateLogId: 1),
        brightness: Brightness.dark,
      );

      final text = tester.widget<Text>(find.text('· local'));
      expect(text.style!.color, AppPalette.dark.statusLocal);
    });
  });
}
