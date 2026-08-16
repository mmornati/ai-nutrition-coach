// `ExportResult` sealed hierarchy (Story 4.2 / AD-9).
//
// Pins the `ExportReady` success + the three `ExportFailure`
// variants (`StoreClosed`, `ExportFormatFailure`,
// `ExportScopeFailure`). Pattern-match call sites in the UI /
// destination adapter rely on the sealed envelope being
// exhaustive.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('ExportResult', () {
    test('ExportReady carries a plate list', () {
      final ready = ExportReady(const <PlateLog>[]);
      expect(ready.plates, isEmpty);
    });

    test('StoreClosed is a typed failure', () {
      const f = StoreClosed();
      expect(f, isA<ExportFailure>());
    });

    test('ExportFormatFailure is a typed failure', () {
      const f = ExportFormatFailure();
      expect(f, isA<ExportFailure>());
    });

    test('ExportScopeFailure is a typed failure', () {
      const f = ExportScopeFailure();
      expect(f, isA<ExportFailure>());
    });

    test('sealed envelope is exhaustive', () {
      // analyzer enforces exhaustive coverage when a call site
      // pattern-matches on `ExportResult`. This test pins the
      // shape; the analyzer is the actual gate.
      ExportResult r = const StoreClosed();
      switch (r) {
        case ExportReady():
          fail('did not expect ExportReady');
        case ExportFailure():
          // sealed — covered.
          break;
      }
    });
  });
}
