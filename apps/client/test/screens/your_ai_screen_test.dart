// Settings → Your AI (Phase 3 / F5, N1, N7, S1, S4).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/your_ai_screen.dart';
import 'package:ai_nutrition_coach/state/ai_rung_provider.dart';
import 'package:ai_nutrition_coach/state/ai_settings_provider.dart';

class _Tester implements ByokConnectionTester {
  _Tester(this.result);
  ByokConnectionResult result;
  final List<String> keys = [];
  @override
  Future<ByokConnectionResult> testConnection({required String apiKey}) async {
    keys.add(apiKey);
    return result;
  }
}

class _Harness {
  _Harness({AiSettings initial = AiSettings.defaults, String? seededKey})
    : keys = InMemoryByokKeyStore(seed: seededKey),
      store = InMemoryAiSettingsStore(initial: initial),
      initial = initial,
      tester = _Tester(const ByokConnectionOk());

  final AiSettings initial;
  final InMemoryByokKeyStore keys;
  final InMemoryAiSettingsStore store;
  final _Tester tester;

  Widget app() => ProviderScope(
    overrides: [
      initialAiSettingsProvider.overrideWithValue(initial),
      aiSettingsStoreProvider.overrideWithValue(store),
      byokKeyStoreProvider.overrideWithValue(keys),
      quotaCounterProvider.overrideWithValue(InMemoryQuotaCounter(ceiling: 5)),
      hostedQuotaProviderProvider.overrideWithValue(
        const CloudflareWorkersAiProvider(),
      ),
      byokConnectionTesterFactoryProvider.overrideWithValue(
        ({required endpointUrl, required model}) => tester,
      ),
    ],
    child: const MaterialApp(home: YourAiScreen()),
  );
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

Finder _field(String label) => find.widgetWithText(TextField, label);

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.devicePixelRatio = 1.0;
    binding.platformDispatcher.views.first.physicalSize = const Size(800, 2200);
  });
  tearDown(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });

  testWidgets('"Ask before every photo upload" is on by default and the '
      'switch is stored (PV1)', (tester) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);

    final label = find.text('Ask before every photo upload');
    await tester.ensureVisible(label);
    expect(label, findsOneWidget);
    final sw = find.widgetWithText(
      SwitchListTile,
      'Ask before every photo upload',
    );
    expect(tester.widget<SwitchListTile>(sw).value, isTrue);

    await tester.tap(sw);
    await _settle(tester);
    expect((await h.store.read()).askBeforeEveryPhoto, isFalse);

    await tester.tap(sw);
    await _settle(tester);
    expect((await h.store.read()).askBeforeEveryPhoto, isTrue);
  });

  testWidgets('the help link opens the in-app privacy page, not a URL', (
    tester,
  ) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);
    expect(find.textContaining('Copy a link'), findsNothing);
    final link = find.text('What this app stores and sends');
    await tester.ensureVisible(link);
    expect(link, findsOneWidget);
  });

  testWidgets('lists the rungs; hosted and on-device are shown as '
      'unavailable and cannot be selected', (tester) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);

    expect(find.text('No AI'), findsOneWidget);
    expect(find.text('My own key'), findsOneWidget);
    expect(find.text('Free hosted model'), findsOneWidget);
    expect(find.text('Model on this device'), findsOneWidget);
    expect(find.text('Not available yet'), findsNWidgets(2));

    await tester.tap(find.text('Free hosted model'));
    await _settle(tester);
    expect(
      (await h.store.read()).rung.kind,
      AiRungKind.noOp,
      reason: 'an unavailable rung cannot be chosen',
    );
    // The BYOK form is hidden until "My own key" is chosen.
    expect(_field('Endpoint'), findsNothing);
  });

  testWidgets('the key field is obscured, never shows the key back, and is '
      'cleared after Save; only "ends with ••••last4" remains', (tester) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);

    await tester.tap(find.text('My own key'));
    await _settle(tester);

    final keyField = tester.widget<TextField>(_field('API key'));
    expect(keyField.obscureText, isTrue);
    expect(keyField.autocorrect, isFalse);
    expect(keyField.enableSuggestions, isFalse);

    await tester.enterText(_field('Endpoint'), 'https://api.example.com/v1');
    await tester.enterText(_field('Model'), 'vision-1');
    // A paste with whitespace / newline is cleaned by the field itself.
    await tester.enterText(
      _field('API key'),
      ' sk-or-v1-SECRETMATERIAL-9f3a\n',
    );
    await tester.pump();
    expect(
      tester.widget<TextField>(_field('API key')).controller!.text,
      'sk-or-v1-SECRETMATERIAL-9f3a',
    );

    await tester.tap(find.text('Save'));
    await _settle(tester);

    expect(find.text('Saved.'), findsOneWidget);
    expect(find.text('key saved • ends with ••••9f3a'), findsOneWidget);
    expect(find.textContaining('SECRETMATERIAL'), findsNothing);
    expect(
      tester.widget<TextField>(_field('API key')).controller!.text,
      isEmpty,
      reason: 'the field is cleared after saving',
    );
    expect(await h.keys.read(), 'sk-or-v1-SECRETMATERIAL-9f3a');
    final s = await h.store.read();
    expect(s.rung.kind, AiRungKind.byok);
    expect(s.byokEndpointUrl, 'https://api.example.com/v1');
    expect(s.toJsonString(), isNot(contains('SECRETMATERIAL')));
  });

  testWidgets('endpoint validation: http (non-local) is refused with calm '
      'copy and nothing is saved; localhost is fine', (tester) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);
    await tester.tap(find.text('My own key'));
    await _settle(tester);

    await tester.enterText(_field('Endpoint'), 'http://example.com/v1');
    await tester.enterText(_field('Model'), 'm');
    await tester.enterText(_field('API key'), 'sk-test-abcdef123456');
    await tester.tap(find.text('Save'));
    await _settle(tester);

    expect(
      find.text('Use https:// — plain http:// works only for localhost.'),
      findsOneWidget,
    );
    expect(await h.keys.hasKey(), isFalse);
    expect((await h.store.read()).rung.kind, AiRungKind.noOp);

    await tester.enterText(_field('Endpoint'), 'http://localhost:11434/v1');
    await tester.tap(find.text('Save'));
    await _settle(tester);
    expect(find.text('Saved.'), findsOneWidget);
    expect((await h.store.read()).rung.kind, AiRungKind.byok);
  });

  testWidgets('Test connection: uses the form, shows a calm result per '
      'outcome, saves nothing', (tester) async {
    final h = _Harness();
    await tester.pumpWidget(h.app());
    await _settle(tester);
    await tester.tap(find.text('My own key'));
    await _settle(tester);
    await tester.enterText(_field('Endpoint'), 'https://api.example.com/v1');
    await tester.enterText(_field('Model'), 'm');
    await tester.enterText(_field('API key'), 'sk-test-abcdef123456');

    final cases = <(ByokConnectionResult, String)>[
      (
        const ByokConnectionOk(),
        'Connected — the endpoint, model and key work.',
      ),
      (
        const ByokConnectionKeyRejected(),
        "The service didn't accept this key.",
      ),
      (
        const ByokConnectionRateLimited(),
        'The service asks to slow down. Try again a little later.',
      ),
      (
        const ByokConnectionUnreachable(ByokUnreachableReason.timeout),
        "The service didn't answer in time.",
      ),
      (
        const ByokConnectionUnreachable(ByokUnreachableReason.network),
        "Couldn't reach the service.",
      ),
      (
        const ByokConnectionUnexpectedStatus(404),
        'The service answered with an unexpected status (404).',
      ),
      (
        const ByokConnectionNotConfigured(),
        'Add an endpoint, a model and a key first.',
      ),
    ];
    for (final (result, text) in cases) {
      h.tester.result = result;
      await tester.tap(find.text('Test connection'));
      await _settle(tester);
      expect(find.text(text), findsOneWidget, reason: text);
    }
    expect(h.tester.keys.first, 'sk-test-abcdef123456');
    expect(await h.keys.hasKey(), isFalse, reason: 'a test saves nothing');
    expect((await h.store.read()).rung.kind, AiRungKind.noOp);

    h.tester.result = const ByokConnectionEndpointInvalid(
      ByokEndpointProblem.notHttps,
    );
    await tester.tap(find.text('Test connection'));
    await _settle(tester);
    expect(
      find.text('Use https:// — plain http:// works only for localhost.'),
      findsOneWidget,
    );
  });

  testWidgets('Remove key clears the key and returns to No AI', (tester) async {
    final h = _Harness(
      initial: const AiSettings(
        rung: AiRungConfig(
          kind: AiRungKind.byok,
          previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
        ),
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'm',
      ),
      seededKey: 'sk-stored-abcdef123456',
    );
    await tester.pumpWidget(h.app());
    await _settle(tester);

    expect(find.text('key saved • ends with ••••3456'), findsOneWidget);
    await tester.tap(find.text('Remove key'));
    await _settle(tester);

    expect(await h.keys.hasKey(), isFalse);
    expect((await h.store.read()).rung.kind, AiRungKind.noOp);
    expect(find.text('Key removed.'), findsOneWidget);
    expect(find.textContaining('••••'), findsNothing);
  });

  testWidgets('consented hosts are listed and revocable', (tester) async {
    final h = _Harness(
      initial: const AiSettings(
        photoConsentHosts: {'api.example.com', 'b.example.org'},
      ),
    );
    await tester.pumpWidget(h.app());
    await _settle(tester);

    expect(find.text('api.example.com'), findsOneWidget);
    expect(find.text('b.example.org'), findsOneWidget);
    await tester.tap(find.text('Revoke').first);
    await _settle(tester);

    expect(find.text('api.example.com'), findsNothing);
    expect((await h.store.read()).photoConsentHosts, {'b.example.org'});
  });

  testWidgets('nothing consented: says so', (tester) async {
    await tester.pumpWidget(_Harness().app());
    await _settle(tester);
    expect(
      find.text("You haven't allowed any service to receive photos."),
      findsOneWidget,
    );
  });
}
