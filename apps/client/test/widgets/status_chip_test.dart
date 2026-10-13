// `StatusChip` widget tests — mono status chip (UX-DR6) and its honesty
// (security review F4).
//
// While there is no sync transport (v1) the chip says `· on this device` and
// nothing else — it never claims `pending` or `synced`, whatever the queue
// holds. With a transport it derives `· pending` / `· synced` /
// `· retry later` from the per-plate sync-queue stream. The chip is a status
// marker, not an affordance: it is never a button, but its parent row owns
// the 48px hit target.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/sync_queue_provider.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/status_chip.dart';

class _Transport implements SyncAdapter {
  const _Transport();

  @override
  bool get hasTransport => true;

  @override
  Future<DrainResult> drain(SyncOp op) async => const Drained();
}

void main() {
  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Brightness brightness = Brightness.light,
    List<SyncOpStatus> perPlate = const <SyncOpStatus>[],
    bool transport = false,
  }) async {
    final overrides = <Override>[
      if (transport) syncAdapterProvider.overrideWithValue(const _Transport()),
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

  group('StatusChip without a sync transport (v1)', () {
    testWidgets('renders mono `· on this device`', (tester) async {
      await pump(tester, const StatusChip(plateLogId: 1));

      final text = tester.widget<Text>(find.text('· on this device'));
      // Role-bound typography: mono (UX-DR6) — the chip is never
      // louder than the row body.
      expect(text.style!.fontFamily, 'monospace');
      expect(text.style!.color, AppPalette.light.statusLocal);
    });

    testWidgets('NEVER says synced / pending, whatever the queue holds', (
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
      expect(find.text('· on this device'), findsOneWidget);
      expect(find.text('· synced'), findsNothing);
      expect(find.text('· pending'), findsNothing);
    });

    testWidgets('the default wiring has no transport', (tester) async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(syncTransportAvailableProvider), isFalse);
      expect(container.read(syncAdapterProvider).hasTransport, isFalse);
    });

    testWidgets('exposes a Semantics label announcing the status', (
      tester,
    ) async {
      await pump(tester, const StatusChip(plateLogId: 1));

      final semantics = tester.getSemantics(find.byType(StatusChip));
      expect(semantics.label, contains('Status:'));
      expect(semantics.label, contains('on this device'));
      expect(semantics.label, isNot(contains('synced')));
    });

    testWidgets('reads dark-palette status color in dark mode', (tester) async {
      await pump(
        tester,
        const StatusChip(plateLogId: 1),
        brightness: Brightness.dark,
      );

      final text = tester.widget<Text>(find.text('· on this device'));
      expect(text.style!.color, AppPalette.dark.statusLocal);
    });
  });

  group('StatusChip with a transport', () {
    testWidgets('reflects the queue status for its own plate only', (
      tester,
    ) async {
      await pump(
        tester,
        const StatusChip(plateLogId: 2),
        transport: true,
        perPlate: const [
          SyncOpStatus(plateLogId: 1, status: SyncOpStatusValue.pending),
          SyncOpStatus(plateLogId: 2, status: SyncOpStatusValue.synced),
        ],
      );
      expect(find.text('· synced'), findsOneWidget);
      expect(find.text('· pending'), findsNothing);
    });

    testWidgets('a plate with no op is still on this device', (tester) async {
      await pump(tester, const StatusChip(plateLogId: 9), transport: true);
      expect(find.text('· on this device'), findsOneWidget);
    });
  });
}
