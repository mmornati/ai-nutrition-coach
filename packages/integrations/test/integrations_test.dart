// Smoke test for the integrations adapter package — at scaffold time the
// package exports a version constant only. Stories 1.2+ add real adapters
// and replace this placeholder with proper coverage.

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  test('integrations package resolves', () {
    expect(integrationsVersion, isNotEmpty);
  });
}
