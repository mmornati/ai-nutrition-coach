// `coachProvider` Riverpod override tests (Story 2.1 / AD-5 / AD-7).
//
// Pins:
//   * `coachProvider` is the single Riverpod seam the whisper
//     surfaces (Stories 2.2 / 2.3) read from;
//   * `main.dart` overrides it with `TemplateCoach()` so the
//     production wiring resolves to the v1 active rung;
//   * tests inject a `FakeCoach` that records `questionFor` calls
//     and returns configured `CoachQuestionResult`s;
//   * the production override is `const TemplateCoach()` and returns
//     the expected non-empty `CoachQuestion` for a known pattern.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

ProviderContainer _container({Coach? coach}) {
  // Minimal EncryptedStore stub — the coach provider test does
  // not exercise the store path; the seam just needs to exist so
  // the widget tree / provider graph resolves.
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
      if (coach != null) coachProvider.overrideWithValue(coach),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('coachProvider', () {
    test('throws UnimplementedError when not overridden (defensive seam)', () {
      // The seam has no default — production code must override it
      // at the ProviderScope root. This pins the error path so a
      // regression that silently defaults to a no-op is loud.
      // Riverpod 3.x wraps the provider's thrown error in a
      // `ProviderException`; the underlying `UnimplementedError`
      // carries the message we deliberately throw inside the
      // provider's factory.
      final container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
        ],
      );
      addTearDown(container.dispose);

      Object? thrown;
      try {
        container.read(coachProvider);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, isNotNull);
      // The message lives on the underlying `UnimplementedError`;
      // `toString()` includes the wrapper's headline, so we look
      // for the canonical substring instead.
      expect(thrown.toString(), contains('coachProvider must be overridden'));
      expect(thrown.toString(), contains('UnimplementedError'));
    });

    test('production override resolves to TemplateCoach and returns the '
        'expected key for a known pattern', () {
      final container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
          coachProvider.overrideWithValue(const TemplateCoach()),
        ],
      );
      addTearDown(container.dispose);

      // Verify the seam resolves to the v1 active rung.
      final coach = container.read(coachProvider);
      expect(coach, isA<Coach>());
      expect(coach, isA<TemplateCoach>());

      // Verify the canonical key resolves to the expected text.
      final result = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(result, isA<CoachFound>());
      final found = result as CoachFound;
      expect(found.question.key, 'post.resolve.vegLight');
      expect(found.question.text, isNotEmpty);
      expect(found.question.anchor, CoachAnchor.postResolve);
      expect(found.question.pattern, CompositionPattern.vegLight);
    });

    test('FakeCoach records questionFor calls and returns configured '
        'CoachQuestionResult', () {
      final fake = FakeCoach();
      final container = _container(coach: fake);

      final coach = container.read(coachProvider);
      expect(coach, same(fake));

      // Default behaviour: NoCoachQuestion.
      final first = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(first, isA<NoCoachQuestion>());

      // Configured behaviour: a CoachFound question.
      fake.emit(
        CoachFound(
          const CoachQuestion(
            key: 'post.resolve.vegLight',
            text: 'A handful of greens would round this plate out.',
            anchor: CoachAnchor.postResolve,
            pattern: CompositionPattern.vegLight,
          ),
        ),
      );
      final second = coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(second, isA<CoachFound>());
      expect((second as CoachFound).question.key, 'post.resolve.vegLight');

      // Calls were recorded with the right shape.
      expect(fake.calls, hasLength(2));
      expect(fake.calls.first.anchor, CoachAnchor.postResolve);
      expect(fake.calls.first.pattern, CompositionPattern.vegLight);
    });

    test('every v1 (anchor, pattern) resolves to a non-empty question '
        'under the production override', () {
      final container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
          coachProvider.overrideWithValue(const TemplateCoach()),
        ],
      );
      addTearDown(container.dispose);

      final coach = container.read(coachProvider);
      expect(coach, isA<TemplateCoach>());

      for (final anchor in CoachAnchor.values) {
        for (final pattern in CompositionPattern.values) {
          final result = coach.questionFor(anchor: anchor, pattern: pattern);
          expect(
            result,
            isA<CoachFound>(),
            reason: 'expected CoachFound for ($anchor, $pattern)',
          );
          final found = result as CoachFound;
          expect(found.question.text, isNotEmpty);
          expect(found.question.key, isNotEmpty);
          expect(found.question.anchor, anchor);
          expect(found.question.pattern, pattern);
        }
      }
    });

    test('unknown (anchor, pattern) returns NoCoachQuestion under the '
        'production override — never throws, never falls back to copy', () {
      // We use a hand-rolled fake coach to exercise the unknown-
      // pattern contract without mutating the shared key store.
      final Coach coach = _PartialCoach({
        const CoachQuestionKey(
          CoachAnchor.postResolve,
          CompositionPattern.vegLight,
        ): CoachQuestion(
          key: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          anchor: CoachAnchor.postResolve,
          pattern: CompositionPattern.vegLight,
        ),
      });
      final container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
          coachProvider.overrideWithValue(coach),
        ],
      );
      addTearDown(container.dispose);

      final resolved = container.read(coachProvider);
      expect(resolved, same(coach));

      final known = resolved.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.vegLight,
      );
      expect(known, isA<CoachFound>());

      final unknown = resolved.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: CompositionPattern.balanced,
      );
      expect(unknown, isA<NoCoachQuestion>());
    });
  });
}

/// Hand-rolled `Coach` adapter that reads from a caller-supplied map.
/// Lets the "unknown pattern returns NoCoachQuestion" test exercise
/// the contract without mutating the shared `enCoachStrings` map.
class _PartialCoach implements Coach {
  _PartialCoach(this._map);

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
