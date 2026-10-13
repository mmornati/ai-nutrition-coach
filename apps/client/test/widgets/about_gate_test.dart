// The one-time "About this app" notice (privacy audit PV1): shown before the
// first Day Board, dismissed once, remembered in the encrypted key/value
// store; on the web it comes before the passphrase screen and is not asked
// twice.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/about_notice_screen.dart';
import 'package:ai_nutrition_coach/screens/privacy_screen.dart';
import 'package:ai_nutrition_coach/state/privacy_provider.dart';
import 'package:ai_nutrition_coach/widgets/about_gate.dart';

class _FailingKv implements LocalKeyValueStore {
  _FailingKv({this.failRead = false, this.failWrite = false});
  final bool failRead;
  final bool failWrite;
  @override
  Future<String?> read(String key) async =>
      failRead ? throw StateError('unreadable') : null;
  @override
  Future<void> write(String key, String value) async {
    if (failWrite) throw const KeyValueStoreLocked();
  }

  @override
  Future<void> delete(String key) async {}
}

Widget _app(PrivacyPrefs prefs, Widget home) => ProviderScope(
  overrides: [privacyPrefsProvider.overrideWithValue(prefs)],
  child: MaterialApp(home: home),
);

const _child = Scaffold(body: Text('the day board'));

void main() {
  setUp(resetAboutNoticeSessionFlag);

  testWidgets('first run: the notice, not the child; copy is calm and honest', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        PrivacyPrefs(InMemoryKeyValueStore()),
        const AboutGate(child: _child),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(AboutNoticeScreen), findsOneWidget);
    expect(find.text('the day board'), findsNothing);
    expect(find.text('About this app'), findsOneWidget);
    expect(
      find.text('AI Nutrition Coach is designed for adults.'),
      findsOneWidget,
    );
    expect(find.textContaining('off by default'), findsOneWidget);
    expect(find.textContaining('only after you say yes'), findsOneWidget);
    expect(find.text('What this app stores and sends'), findsOneWidget);
    // One button, no checkbox, no countdown.
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('"Got it" shows the child and is kept: the next launch skips '
      'the notice', (tester) async {
    final kv = InMemoryKeyValueStore();
    await tester.pumpWidget(
      _app(PrivacyPrefs(kv), const AboutGate(child: _child)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Got it'));
    await tester.pumpAndSettle();
    expect(find.text('the day board'), findsOneWidget);
    expect(await PrivacyPrefs(kv).aboutAcknowledged(), isTrue);

    // A new launch (new widget tree, same encrypted store).
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      _app(PrivacyPrefs(kv), const AboutGate(child: _child)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AboutNoticeScreen), findsNothing);
    expect(find.text('the day board'), findsOneWidget);
  });

  testWidgets('the link opens the in-app privacy page', (tester) async {
    await tester.pumpWidget(
      _app(
        PrivacyPrefs(InMemoryKeyValueStore()),
        const AboutGate(child: _child),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('What this app stores and sends'));
    await tester.pumpAndSettle();
    expect(find.byType(PrivacyScreen), findsOneWidget);
  });

  testWidgets('an unreadable store shows the notice (never silently skips)', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        PrivacyPrefs(_FailingKv(failRead: true)),
        const AboutGate(child: _child),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AboutNoticeScreen), findsOneWidget);
  });

  testWidgets('a store that cannot be written still lets the person '
      'continue for this session', (tester) async {
    await tester.pumpWidget(
      _app(
        PrivacyPrefs(_FailingKv(failWrite: true)),
        const AboutGate(child: _child),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Got it'));
    await tester.pumpAndSettle();
    expect(find.text('the day board'), findsOneWidget);
  });

  group('web: before the passphrase screen', () {
    testWidgets('shown first, then the child; the post-unlock gate writes '
        'the acknowledgement silently and does not ask again', (tester) async {
      await tester.pumpWidget(
        _app(
          PrivacyPrefs(InMemoryKeyValueStore()),
          const AboutGate.beforeStore(child: _child),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(AboutNoticeScreen), findsOneWidget);
      await tester.tap(find.text('Got it'));
      await tester.pumpAndSettle();
      expect(find.text('the day board'), findsOneWidget);

      // The store now exists (passphrase created, scope restarted).
      final kv = InMemoryKeyValueStore();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        _app(PrivacyPrefs(kv), const AboutGate(child: _child)),
      );
      await tester.pumpAndSettle();
      expect(find.byType(AboutNoticeScreen), findsNothing);
      expect(find.text('the day board'), findsOneWidget);
      expect(await PrivacyPrefs(kv).aboutAcknowledged(), isTrue);
    });

    testWidgets('without having seen it first, the post-unlock gate asks', (
      tester,
    ) async {
      await tester.pumpWidget(
        _app(
          PrivacyPrefs(InMemoryKeyValueStore()),
          const AboutGate(child: _child),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(AboutNoticeScreen), findsOneWidget);
    });
  });
}
