// `webSessionKeyProvider` wiring pin (Story 4.1 / AD-8).
//
// The provider is a process-wide singleton; the Day Board and the
// lock screen both read it. The provider has no override at
// startup — the production graph resolves the singleton from
// `WebSessionKey()` directly. The test pins the no-override shape.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

import 'package:ai_nutrition_coach/state/web_session_key_provider.dart';

void main() {
  test('webSessionKeyProvider returns the process-wide singleton', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final a = container.read(webSessionKeyProvider);
    final b = container.read(webSessionKeyProvider);
    expect(identical(a, b), isTrue);
    expect(a, isA<WebSessionKey>());
  });
}
