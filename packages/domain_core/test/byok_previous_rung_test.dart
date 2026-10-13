// `ByokPreviousRung` tests (Story 3.3 / FR7).
//
// Pins:
//   * equality by `previousKind` only;
//   * `toString` surfaces the keyToken, never the label.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('ByokPreviousRung (Story 3.3 / FR7)', () {
    test('equality by previousKind only', () {
      const a = ByokPreviousRung(previousKind: AiRungKind.hostedQuota);
      const b = ByokPreviousRung(previousKind: AiRungKind.hostedQuota);
      const c = ByokPreviousRung(previousKind: AiRungKind.noOp);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });

    test('toString surfaces the keyToken, never the label', () {
      const r = ByokPreviousRung(previousKind: AiRungKind.hostedQuota);
      expect(r.toString(), contains('hostedQuota'));
      expect(r.toString(), isNot(contains('free model')));
    });
  });

  group('AiRungConfig with previousRung (Story 3.3 / FR7)', () {
    test('default has previousRung = null', () {
      const config = AiRungConfig(kind: AiRungKind.noOp);
      expect(config.previousRung, isNull);
    });

    test('byok config carries previousRung', () {
      const config = AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.hostedQuota),
      );
      expect(config.previousRung, isNotNull);
      expect(config.previousRung!.previousKind, AiRungKind.hostedQuota);
    });

    test('equality includes previousRung', () {
      const a = AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.hostedQuota),
      );
      const b = AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.hostedQuota),
      );
      const c = AiRungConfig(
        kind: AiRungKind.byok,
        previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });
  });
}
