// Story 2.1 — `Coach` port + `CoachQuestion` value type + typed result
// hierarchy contract (AD-1 / AD-5 / AD-7 / NFR3).
//
// The structural AD-1 grep test in `domain_core_test.dart` already
// pins the "no Flutter / drift / dio / mobile_scanner / image_picker
// / dart:ui / dart:io" rule across `lib/**.dart`. This file pins the
// behavioural contract — the sealed result hierarchy, the value type
// shapes, and the AD-1/AD-5 promise that the port is interface-only
// and a concrete adapter is constructible against it.
//
// AD-1: the `Coach` port lives in the pure-Dart core. The grep test
// will fail if any forbidden import slips into the new files; this
// behavioural test pins the port surface so the AD-5 promise ("the
// active rung is selected by config; the core never branches on it")
// holds.
//
// AD-7 / NFR3: every coach string resolves by key from a single typed
// key store. `CoachQuestion` equality is by `key` — the UI dedupes
// on key without inspecting text. The v1 taxonomy is the six enum
// entries on `CompositionPattern` × two anchors on `CoachAnchor` =
// 12 entries. Tests pin both the sealed result hierarchy and the
// deterministic `key` → `CoachQuestion` mapping.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('CompositionPattern + CoachAnchor enums (NFR3)', () {
    test('CompositionPattern ships the exact v1 six-entry taxonomy', () {
      expect(CompositionPattern.values, <CompositionPattern>[
        CompositionPattern.vegLight,
        CompositionPattern.proteinHeavy,
        CompositionPattern.starchHeavy,
        CompositionPattern.dairyLight,
        CompositionPattern.vegRich,
        CompositionPattern.balanced,
      ]);
    });

    test('CoachAnchor ships the exact v1 three-entry anchor set', () {
      expect(CoachAnchor.values, <CoachAnchor>[
        CoachAnchor.postResolve,
        CoachAnchor.openPlate,
        CoachAnchor.depthFollowUp,
      ]);
    });

    test('CompositionPattern key tokens are stable kebab-cased tokens', () {
      expect(CompositionPattern.vegLight.keyToken, 'vegLight');
      expect(CompositionPattern.proteinHeavy.keyToken, 'proteinHeavy');
      expect(CompositionPattern.starchHeavy.keyToken, 'starchHeavy');
      expect(CompositionPattern.dairyLight.keyToken, 'dairyLight');
      expect(CompositionPattern.vegRich.keyToken, 'vegRich');
      expect(CompositionPattern.balanced.keyToken, 'balanced');
    });

    test('CoachAnchor key tokens are stable kebab-cased tokens', () {
      expect(CoachAnchor.postResolve.keyToken, 'post.resolve');
      expect(CoachAnchor.openPlate.keyToken, 'openPlate');
      expect(CoachAnchor.depthFollowUp.keyToken, 'depth.followUp');
    });
  });

  group('CoachQuestion value type (AD-7 / NFR3)', () {
    test('carries key + text + anchor + pattern; constructor is const', () {
      const q = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'A handful of greens would round this plate out.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(q.key, 'post.resolve.vegLight');
      expect(q.text, 'A handful of greens would round this plate out.');
      expect(q.anchor, CoachAnchor.postResolve);
      expect(q.pattern, CompositionPattern.vegLight);
    });

    test('equality is by key: same key compares equal regardless of text',
        () {
      const a = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'First copy.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      const b = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'Second copy (different).',
        anchor: CoachAnchor.openPlate,
        pattern: CompositionPattern.proteinHeavy,
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('different keys compare not equal', () {
      const a = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'Same text.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      const b = CoachQuestion(
        key: 'post.resolve.proteinHeavy',
        text: 'Same text.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.proteinHeavy,
      );
      expect(a, isNot(b));
    });

    test('copyWith swaps fields immutably', () {
      const q = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'Original copy.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      final updated = q.copyWith(text: 'Revised copy.');
      expect(updated.key, 'post.resolve.vegLight');
      expect(updated.text, 'Revised copy.');
      expect(updated.anchor, CoachAnchor.postResolve);
      expect(updated.pattern, CompositionPattern.vegLight);
    });
  });

  group('CoachQuestionResult is sealed: CoachFound | NoCoachQuestion', () {
    test('the two variants are the only members of the sealed hierarchy',
        () {
      const found = CoachFound(
        CoachQuestion(
          key: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          anchor: CoachAnchor.postResolve,
          pattern: CompositionPattern.vegLight,
        ),
      );
      const none = NoCoachQuestion();
      expect(found, isA<CoachQuestionResult>());
      expect(none, isA<CoachQuestionResult>());
    });

    test('CoachFound equality: same question compares equal', () {
      const q = CoachQuestion(
        key: 'post.resolve.vegLight',
        text: 'A handful of greens would round this plate out.',
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      const a = CoachFound(q);
      const b = CoachFound(q);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('NoCoachQuestion is a constant, equality-by-type singleton', () {
      const a = NoCoachQuestion();
      const b = NoCoachQuestion();
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });
  });

  group('Coach port contract (AD-1 / AD-5)', () {
    test(
        'Coach is interface-only: a minimal adapter returning the sealed '
        'result shape compiles against the port', () async {
      // The behavioural lock for AD-5: any adapter that returns the
      // sealed `CoachQuestionResult` shape is valid against the port.
      // Future AI-backed adapters must conform to the same signature.
      final Coach coach = _StubCoach();
      final found = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(found, isA<CoachFound>());
      expect((found as CoachFound).question.key, 'post.resolve.vegLight');

      final none = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.balanced,
      );
      expect(none, isA<NoCoachQuestion>());
    });

    test('the port signature accepts every (anchor, pattern) combination',
        () {
      // Compile-time + runtime lock: every entry in the v1 taxonomy
      // (2 anchors × 6 patterns = 12 calls) is a valid signature.
      const coach = _StubCoach();
      for (final anchor in CoachAnchor.values) {
        for (final pattern in CompositionPattern.values) {
          // The call itself is the assertion — if the signature
          // drifts, this won't compile.
          final result =
              coach.questionFor(anchor: anchor, pattern: pattern);
          expect(result, isA<CoachQuestionResult>());
        }
      }
    });
  });
}

/// Minimal `Coach` adapter — returns `CoachFound` for one
/// `(anchor, pattern)` pair and `NoCoachQuestion` for everything
/// else. Used only to assert the port is interface-only and a
/// concrete adapter is constructible against it.
class _StubCoach implements Coach {
  const _StubCoach();

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    if (anchor == CoachAnchor.postResolve &&
        pattern == CompositionPattern.vegLight) {
      return CoachFound(
        const CoachQuestion(
          key: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          anchor: CoachAnchor.postResolve,
          pattern: CompositionPattern.vegLight,
        ),
      );
    }
    return const NoCoachQuestion();
  }
}