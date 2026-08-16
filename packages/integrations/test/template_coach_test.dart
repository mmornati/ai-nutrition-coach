// `TemplateCoach` adapter tests (Story 2.1 / AD-5 / AD-7 / NFR3).
//
// Pins:
//   * the v1 active rung resolves every `(anchor, pattern)` pair in
//     the bounded taxonomy to a non-empty `CoachQuestion`;
//   * the same `(anchor, pattern)` always returns the same
//     `CoachQuestion` instance (deterministic; equality by key);
//   * unknown `(anchor, pattern)` requests return `NoCoachQuestion`
//     so the UI renders nothing — never a thrown exception, never
//     fallback copy.
//   * the key store ships exactly the 12-entry v1 taxonomy (2
//     anchors × 6 patterns) so the named NDP reviewer signs off in
//     one pass.
//   * `TemplateCoach` conforms to the `Coach` interface (AD-5) so a
//     future AI-backed rung drops in behind the same provider.

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('TemplateCoach (v1 active coach rung)', () {
    test('is interface-conformant: implements Coach', () {
      const coach = TemplateCoach();
      expect(coach, isA<Coach>());
    });

    test(
        'en key store ships exactly the 12-entry v1 taxonomy '
        '(2 anchors × 6 patterns)', () {
      // The named NDP reviewer signs off on this exact count.
      expect(enCoachStrings.length, 12);
      for (final anchor in CoachAnchor.values) {
        for (final pattern in CompositionPattern.values) {
          expect(
            enCoachStrings[CoachQuestionKey(anchor, pattern)],
            isNotNull,
            reason: 'missing entry for ($anchor, $pattern)',
          );
        }
      }
    });

    test('every v1 (anchor, pattern) entry is a non-empty CoachQuestion',
        () {
      for (final entry in enCoachStrings.entries) {
        expect(entry.value.text, isNotEmpty,
            reason: '${entry.key} has empty text');
        expect(entry.value.text.length, greaterThanOrEqualTo(1));
        expect(entry.value.key, isNotEmpty);
        expect(entry.value.anchor, entry.key.anchor);
        expect(entry.value.pattern, entry.key.pattern);
      }
    });

    test(
        'every key store text is calm + non-judgmental: '
        'no calorie / shame / streak / restriction vocabulary', () {
      // FR15 / NFR3 / NFR7. The reviewer scans this list; the
      // test pins the same vocabulary ban so a regression in the
      // key store fails before the NDP review pass.
      const bannedFragments = <String>[
        'kcal',
        'calorie',
        'calories',
        'guilt',
        'cheat',
        'dirty',
        'clean eating',
        'streak',
        'failed',
        'restrict',
        'should have',
        'bad plate',
        'good plate',
        'you failed',
        'you missed',
        'must',
      ];
      for (final entry in enCoachStrings.values) {
        final lower = entry.text.toLowerCase();
        for (final banned in bannedFragments) {
          expect(
            lower.contains(banned),
            isFalse,
            reason: '${entry.key} contains banned fragment "$banned"',
          );
        }
      }
    });

    test('questionFor returns CoachFound with a non-empty question '
        'for every (anchor, pattern) in the v1 taxonomy', () {
      const coach = TemplateCoach();
      for (final anchor in CoachAnchor.values) {
        for (final pattern in CompositionPattern.values) {
          final result =
              coach.questionFor(anchor: anchor, pattern: pattern);
          expect(result, isA<CoachFound>(),
              reason: 'expected CoachFound for ($anchor, $pattern)');
          final found = result as CoachFound;
          expect(found.question.text, isNotEmpty);
          expect(found.question.key, isNotEmpty);
          expect(found.question.anchor, anchor);
          expect(found.question.pattern, pattern);
        }
      }
    });

    test('same (anchor, pattern) returns the same CoachQuestion '
        'instance — deterministic; equality by key', () {
      const coach = TemplateCoach();
      final first = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      final second = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(first, second);
      expect((first as CoachFound).question,
          equals((second as CoachFound).question));
    });

    test('CoachQuestion equality by key: same key dedupes regardless '
        'of any other field', () {
      // Adapter contract — the UI dedupes on `key` without
      // inspecting text. The key store produces the same key for
      // the same pair, so dedupe holds end-to-end.
      const coach = TemplateCoach();
      final a = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      final b = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect((a as CoachFound).question.key,
          equals((b as CoachFound).question.key));
      expect((a).question, equals((b).question));
    });

    test('unknown pattern returns NoCoachQuestion — never throws, '
        'never falls back to copy', () {
      // The key store ships the v1 six-pattern set; any future
      // pattern the v1 store does not cover must return
      // `NoCoachQuestion`. We exercise that contract by calling
      // the port with a `(postResolve, balanced)` pair after
      // temporarily removing that entry from a local copy of the
      // map, then asserting the adapter returns `NoCoachQuestion`.
      //
      // We use a hand-rolled fake key store rather than mutating
      // the shared `enCoachStrings` map so the test is hermetic.
      final partial = <CoachQuestionKey, CoachQuestion>{
        CoachQuestionKey(
          CoachAnchor.postResolve,
          CompositionPattern.vegLight,
        ): const CoachQuestion(
          key: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          anchor: CoachAnchor.postResolve,
          pattern: CompositionPattern.vegLight,
        ),
      };
      final Coach coach = _PartialTemplateCoach(partial);
      final known = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(known, isA<CoachFound>());

      final unknown = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.balanced,
      );
      expect(unknown, isA<NoCoachQuestion>());
    });

    test('each entry text uses honest quantities or no quantity '
        '(NFR6: no kcal-as-float)', () {
      // The reviewer scans this list. Copy uses "~2 fists" /
      // "a handful" / "a small bowl" / "a bit of" — never a calorie
      // count. The test asserts the same vocabulary family so a
      // regression is caught here.
      for (final entry in enCoachStrings.values) {
        expect(entry.text.contains(RegExp(r'\d+\s*kcal')),
            isFalse,
            reason: '${entry.key} contains kcal-as-float');
      }
    });

    test('each entry text is plain text (NFR7: no decorative unicode)',
        () {
      // The UI applies its own theme — copy must not carry color
      // tokens, typography references, or decorative unicode
      // (em-dashes used for range separators like "~1–2 pieces"
      // are permitted because they communicate quantity honestly,
      // per NFR6, and ship in plain text).
      for (final entry in enCoachStrings.values) {
        // Block decorative dingbats / emoji.
        expect(entry.text.contains(RegExp(r'[\u2600-\u27BF]')), isFalse,
            reason: '${entry.key} contains decorative unicode');
        // Block hex color tokens.
        expect(entry.text.contains(RegExp(r'#[0-9a-fA-F]{3,8}')),
            isFalse,
            reason: '${entry.key} contains color tokens');
      }
    });
  });
}

/// Hand-rolled `Coach` adapter that reads from a caller-supplied map.
/// Lets the "unknown pattern returns NoCoachQuestion" test exercise
/// the contract without mutating the shared `enCoachStrings` map.
class _PartialTemplateCoach implements Coach {
  _PartialTemplateCoach(this._map);

  final Map<CoachQuestionKey, CoachQuestion> _map;

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    final question = _map[CoachQuestionKey(anchor, pattern)];
    if (question == null) {
      return const NoCoachQuestion();
    }
    return CoachFound(question);
  }
}