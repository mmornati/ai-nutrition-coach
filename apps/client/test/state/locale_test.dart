// An odd device locale must never stop the app from starting (a POSIX-style
// "en-US@posix" crashed the engine's locale parsing at boot; the bootstrap
// repairs the tag, and the app resolves anything to a shipped locale).

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/l10n/l10n.dart';
import 'package:openplate_client/main.dart';

void main() {
  final supported = AppLocalizations.supportedLocales;

  test('resolves every odd locale to a supported one, English by default', () {
    for (final locale in <Locale?>[
      null,
      const Locale('en'),
      const Locale('en', 'US'),
      const Locale('zz'),
      const Locale('fr', 'FR'),
      const Locale.fromSubtags(languageCode: 'und'),
      const Locale.fromSubtags(languageCode: 'en', scriptCode: 'Latn'),
    ]) {
      final resolved = resolveAppLocale(locale, supported);
      expect(supported, contains(resolved), reason: '$locale');
      expect(resolved.languageCode, 'en', reason: '$locale');
    }
  });

  testWidgets('the app builds under a locale it does not ship', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('zz', 'ZZ')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: supported,
        localeResolutionCallback: resolveAppLocale,
        home: Builder(builder: (c) => Text(c.l10n.appName)),
      ),
    );
    expect(find.text('OpenPlate'), findsOneWidget);
  });

  test(
    'the bootstrap script sanitises navigator.languages before the engine',
    () {
      final js = File('web/flutter_bootstrap.js').readAsStringSync();
      expect(js, contains('new Intl.Locale'));
      expect(js, contains("['en']"));
    },
  );
}
