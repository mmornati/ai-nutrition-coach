// The calm "new version is ready" line (ADR-0003): hidden until the service
// worker signals a waiting version, dismissible, honest about the lock, and
// "Reload" asks the signal to apply exactly once. The signal is the
// injectable seam (`ManualAppUpdateSignal`), so no browser is involved.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/state/pwa_provider.dart';
import 'package:openplate_client/widgets/update_banner.dart';

Future<void> _pump(WidgetTester tester, ManualAppUpdateSignal signal) =>
    tester.pumpWidget(
      ProviderScope(
        overrides: [appUpdateProvider.overrideWithValue(signal)],
        child: const MaterialApp(
          home: UpdateBanner(child: Scaffold(body: Text('the app'))),
        ),
      ),
    );

void main() {
  testWidgets('no banner until an update is ready; the app is always shown', (
    tester,
  ) async {
    final signal = ManualAppUpdateSignal();
    await _pump(tester, signal);
    expect(find.text('the app'), findsOneWidget);
    expect(find.textContaining('new version'), findsNothing);

    signal.markReady();
    await tester.pump();
    expect(find.text('the app'), findsOneWidget);
    expect(find.textContaining('A new version is ready'), findsOneWidget);
    expect(find.text('Reload'), findsOneWidget);
    expect(find.text('Later'), findsOneWidget);
  });

  testWidgets('says plainly that reloading locks the data', (tester) async {
    final signal = ManualAppUpdateSignal()..markReady();
    await _pump(tester, signal);
    expect(find.textContaining('passphrase'), findsOneWidget);
  });

  testWidgets('Reload applies the update (once, even if tapped twice)', (
    tester,
  ) async {
    final signal = ManualAppUpdateSignal()..markReady();
    await _pump(tester, signal);
    await tester.tap(find.text('Reload'));
    await tester.pump();
    await tester.tap(find.text('Reload'), warnIfMissed: false);
    await tester.pump();
    expect(signal.applyCalls, 1);
  });

  testWidgets('the button is never a dead end: re-enabled if the reload does '
      'not happen', (tester) async {
    final signal = ManualAppUpdateSignal()..markReady();
    await _pump(tester, signal);
    await tester.tap(find.text('Reload'));
    await tester.pump();
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Reload'))
          .onPressed,
      isNull,
    );
    await tester.pump(const Duration(seconds: 13));
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Reload'))
          .onPressed,
      isNotNull,
    );
    await tester.tap(find.text('Reload'));
    await tester.pump();
    expect(signal.applyCalls, 2);
  });

  testWidgets('Later dismisses the line without applying anything', (
    tester,
  ) async {
    final signal = ManualAppUpdateSignal()..markReady();
    await _pump(tester, signal);
    await tester.tap(find.text('Later'));
    await tester.pump();
    expect(find.textContaining('A new version is ready'), findsNothing);
    expect(find.text('the app'), findsOneWidget);
    expect(signal.applyCalls, 0);
  });

  testWidgets('announces itself to screen readers (live region), no badge', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final signal = ManualAppUpdateSignal()..markReady();
    await _pump(tester, signal);
    expect(
      tester.getSemantics(find.textContaining('A new version is ready')),
      isSemantics(isLiveRegion: true),
    );
    handle.dispose();
  });

  testWidgets('placed in MaterialApp.builder (as in the app) it is exposed to '
      'screen readers: the Navigator must not block its semantics', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final signal = ManualAppUpdateSignal()..markReady();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appUpdateProvider.overrideWithValue(signal)],
        child: MaterialApp(
          builder: (context, child) => UpdateBanner(child: child!),
          home: const Scaffold(body: Text('the app')),
        ),
      ),
    );
    expect(
      find.bySemanticsLabel(RegExp('A new version is ready')),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Reload'), findsOneWidget);
    expect(find.bySemanticsLabel('the app'), findsOneWidget);
    // ...and it is still on TOP of the page.
    expect(
      tester.getTopLeft(find.textContaining('A new version is ready')).dy,
      lessThan(tester.getTopLeft(find.text('the app')).dy),
    );
    handle.dispose();
  });

  testWidgets('with the default (inert) signal nothing is ever shown', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: UpdateBanner(child: Scaffold(body: Text('the app'))),
        ),
      ),
    );
    expect(find.textContaining('new version'), findsNothing);
    expect(const NoAppUpdateSignal().updateReady.value, isFalse);
  });
}
