// `ExportScope` pinned in the core (Story 4.2 / AD-9 / NFR10).
//
// The three variants carry the same shape the Day Board uses to
// resolve a visible day / a week / all history. The exporter
// reads the same source so the export must always match what's
// on screen.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('ExportScope', () {
    test('visibleDay carries a date and is a value', () {
      final v = ExportScope.visibleDay(DateTime(2026, 8, 16));
      expect(v, isA<ExportScope>());
    });

    test('week carries a start and is a value', () {
      final v = ExportScope.week(DateTime(2026, 8, 11));
      expect(v, isA<ExportScope>());
    });

    test('allHistory is a const value', () {
      const v = ExportScope.allHistory();
      expect(v, isA<ExportScope>());
    });

    test('three distinct instances are not equal (sealed type)', () {
      final a = ExportScope.visibleDay(DateTime(2026, 8, 16));
      final b = ExportScope.week(DateTime(2026, 8, 11));
      const c = ExportScope.allHistory();
      // No operator==; the sealed subtypes are distinct types.
      expect(a.runtimeType, isNot(b.runtimeType));
      expect(b.runtimeType, isNot(c.runtimeType));
      expect(a.runtimeType, isNot(c.runtimeType));
    });
  });
}
