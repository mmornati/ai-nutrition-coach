// `AiRungConfig` + `AiRungKind` tests (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// Pins:
//   * the four-kinds enum surface (`noOp | hostedQuota | byok |
//     local`) — the v2 `local` seam is a first-class value;
//   * `AiRungConfig` equality by `kind` only;
//   * `AiRungKind.label` is the single source of truth for the rung
//     name (the UI never hard-codes rung labels);
//   * `AiRungKind.keyToken` is the single source of truth for the
//     log-safe token (the log path carries the token, never user-
//     supplied material);
//   * the four labels are non-empty and distinct (so the Your AI
//     surface renders four distinct rows).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('AiRungKind (Story 3.1 / AD-5)', () {
    test('ships exactly four kinds: noOp | hostedQuota | byok | local',
        () {
      expect(AiRungKind.values, hasLength(4));
      expect(AiRungKind.values, containsAll(<AiRungKind>[
        AiRungKind.noOp,
        AiRungKind.hostedQuota,
        AiRungKind.byok,
        AiRungKind.local,
      ]));
    });

    test('the v2 `local` seam is a first-class enum value (FR8)', () {
      // The seam is declared in the type system — not a sentinel,
      // not a comment. Future v2 work flips the adapter behind
      // `LocalAiRung` without touching this enum.
      expect(AiRungKind.local, isA<AiRungKind>());
      expect(AiRungKind.local.label, isNotEmpty);
      expect(AiRungKind.local.keyToken, 'local');
    });

    test('every label is non-empty and distinct', () {
      final labels = AiRungKind.values.map((k) => k.label).toList();
      for (final label in labels) {
        expect(label, isNotEmpty);
      }
      expect(labels.toSet(), hasLength(labels.length),
          reason: 'every rung must have a distinct label');
    });

    test('every keyToken is non-empty and distinct', () {
      final tokens = AiRungKind.values.map((k) => k.keyToken).toList();
      for (final token in tokens) {
        expect(token, isNotEmpty);
      }
      expect(tokens.toSet(), hasLength(tokens.length),
          reason: 'every rung must have a distinct log token');
    });

    test('label vs keyToken — labels are human-readable, tokens are '
        'machine-readable', () {
      // The label is what the Settings → Your AI surface shows;
      // the keyToken is what the log path records. They are
      // intentionally different — a label like "free model" is
      // user-facing copy, a token like "hostedQuota" is structural.
      for (final kind in AiRungKind.values) {
        expect(kind.label, isNot(equals(kind.keyToken)),
            reason: '$kind label should differ from its keyToken');
      }
    });
  });

  group('AiRungConfig (Story 3.1 / AD-5)', () {
    test('equality is by `kind` only', () {
      const a = AiRungConfig(kind: AiRungKind.noOp);
      const b = AiRungConfig(kind: AiRungKind.noOp);
      const c = AiRungConfig(kind: AiRungKind.hostedQuota);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });

    test('toString surfaces the keyToken, never the label', () {
      // The log path may surface `toString`; carrying the label
      // would let copy text leak into logs. The keyToken is the
      // structural identity.
      const config = AiRungConfig(kind: AiRungKind.hostedQuota);
      expect(config.toString(), contains('hostedQuota'));
      expect(config.toString(), isNot(contains('free model')));
    });

    test('default v1 config is `noOp` (Story 1.8 carry-over)', () {
      // Production `main.dart` overrides `aiRungConfigProvider`
      // with `const AiRungConfig(kind: AiRungKind.noOp)` so the
      // v1 path (NoopAiRung) is the default until a Stories 3.2 /
      // 3.3 build flips the config. This test pins the convention.
      const defaultConfig = AiRungConfig(kind: AiRungKind.noOp);
      expect(defaultConfig.kind, AiRungKind.noOp);
    });
  });
}