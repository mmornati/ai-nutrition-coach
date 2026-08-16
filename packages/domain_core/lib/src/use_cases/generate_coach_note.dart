// `CoachNoteGenerator` use-case (FR4 / AD-3 / AD-5 / AD-7 / NFR3).
//
// The convergent write path for a post-resolve coach note. Fires
// after every successful `RecordPlate` commit (AD-3 — same
// use-case, every path) and:
//   1. Picks the `CompositionPattern` from the plate's resolved
//      food-group tally.
//   2. Asks the active `Coach` port for the question keyed on the
//      resolved `(anchor, pattern)` pair.
//   3. Persists one `CoachNote` via `CoachNoteStore.append`.
//   4. Returns a typed `CoachNoteGenerationResult` — never throws
//      across the boundary.
//
// AD-5: the use-case never branches on which coach rung is active
// (`TemplateCoach` v1, an AI-backed rung in Epic 3). It only
// inspects whether `questionFor` returned a `CoachFound` and
// pattern-matches the sealed `CoachQuestionResult` shape.
//
// Best-effort (calm degrade): the plate is already committed by the
// time the generator runs. If the pattern cannot be resolved
// (`emptyPlate`, `unknownPattern`) or the active coach returned
// `NoCoachQuestion`, the generator returns `NoCoachNoteGenerated`
// and the UI renders no whisper. If the store write fails, the
// generator collapses the failure into `NoCoachNoteGenerated(reason:
// 'appendFailed')` so the UI never inspects an exception.
//
// Pure-Dart: no Flutter / drift / dio / mobile_scanner / image_picker
// imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../entities/coach_note.dart';
import '../entities/database_food.dart';
import '../entities/plate_log.dart';
import '../ports/coach.dart';
import '../ports/coach_note_store.dart';
import '../results/coach_note_failure.dart';
import '../results/coach_question_result.dart';
import '../value_types/composition_pattern.dart';

class CoachNoteGenerator {
  const CoachNoteGenerator({
    required Coach coach,
    required CoachNoteStore store,
  })  : _coach = coach,
        _store = store;

  final Coach _coach;
  final CoachNoteStore _store;

  /// Generate and persist a post-resolve coach note for `plate`.
  ///
  /// Call from the `RecordPlate` use-case AFTER the store commit, so
  /// the assigned `plate.id` is available for the FK back-ref. The
  /// generator never throws — every failure path collapses to a
  /// typed `NoCoachNoteGenerated` result so the UI handles the
  /// empty case by hiding the whisper.
  Future<CoachNoteGenerationResult> generateFor(PlateLog plate) async {
    // Defensive: RecordPlate already refuses empty plates, but the
    // generator must not assume the invariant. An empty plate
    // produces no note.
    if (plate.entries.isEmpty) {
      return const NoCoachNoteGenerated('emptyPlate');
    }

    final pattern = _patternFor(plate);
    // The picker can return null only when no FoodGroup tally
    // resolves to a CompositionPattern entry — defensive against a
    // future tally shape that produces no dominant group.
    if (pattern == null) {
      return const NoCoachNoteGenerated('unknownPattern');
    }

    final CoachQuestionResult result;
    try {
      result = _coach.questionFor(
        anchor: CoachAnchor.postResolve,
        pattern: pattern,
      );
    } on Object {
      // Calm degrade: a future AI rung may misbehave; the port
      // contract is "collapse to NoCoachQuestion". The use-case
      // never lets an exception cross the boundary.
      return const NoCoachNoteGenerated('coachEmpty');
    }

    if (result is NoCoachQuestion) {
      return const NoCoachNoteGenerated('coachEmpty');
    }

    final found = result as CoachFound;
    final note = CoachNote(
      id: 0,
      plateLogId: plate.id,
      anchor: found.question.anchor,
      questionKey: found.question.key,
      text: found.question.text,
      generatedAt: DateTime.now().toUtc(),
    );

    final appendResult = await _store.append(note);
    return switch (appendResult) {
      CoachNoteAppended(:final note) => CoachNoteGenerated(note),
      CoachNoteAppendFailure() => const NoCoachNoteGenerated('appendFailed'),
    };
  }

  /// Resolve the `CompositionPattern` from the plate's resolved
  /// food-group tally. Pure-Dart, no I/O — the result is deterministic
  /// given the plate's entries.
  ///
  /// Rule order matters and is documented here so the matching tests
  /// pin the same priority. Each rule short-circuits on first match:
  ///   1. Plate has no resolvable food groups (every entry is
  ///      `FoodGroup.other`) → `null` (defensive — current seeds
  ///      never produce this, but the use-case must not assume the
  ///      future). The caller collapses this to
  ///      `NoCoachNoteGenerated('unknownPattern')`.
  ///   2. No veg on the plate → `vegLight` (calm nudge: a handful of
  ///      greens would round this plate out).
  ///   3. Protein-dominant plate (≥2 protein entries, more than veg)
  ///      → `proteinHeavy` (calm nudge: some greens would lighten this).
  ///   4. Starch-dominant plate (≥2 starch entries, more than veg)
  ///      → `starchHeavy` (calm nudge: some veg on the side).
  ///   5. Veg-rich plate (≥2 veg entries, no protein) → `vegRich`
  ///      (calm nudge: a protein on the side would complete this).
  ///   6. No dairy on a plate that has at most one major group
  ///      (veg / protein / starch) → `dairyLight` (calm nudge: if
  ///      you have a bit of dairy around, it would round this off).
  ///   7. Otherwise → `balanced` (calm close: nice plate — anything
  ///      you would change next time?).
  ///
  /// `dairyLight` only fires for plates that aren't already broadly
  /// balanced — the test pins this so a 1V+1P+1S plate without dairy
  /// resolves to `balanced`, not `dairyLight`.
  static CompositionPattern? _patternFor(PlateLog plate) {
    var veg = 0;
    var protein = 0;
    var starch = 0;
    var dairy = 0;
    var other = 0;
    for (final entry in plate.entries) {
      switch (entry.databaseFood.foodGroup) {
        case FoodGroup.vegFruit:
          veg++;
        case FoodGroup.protein:
          protein++;
        case FoodGroup.starch:
          starch++;
        case FoodGroup.dairy:
          dairy++;
        case FoodGroup.other:
          other++;
      }
    }

    final major = veg + protein + starch + dairy;
    final hasVeg = veg > 0;
    final hasProtein = protein > 0;
    final hasStarch = starch > 0;
    final majorGroupCount =
        (hasVeg ? 1 : 0) + (hasProtein ? 1 : 0) + (hasStarch ? 1 : 0);

    if (major == 0) {
      // Defensive: every entry was `FoodGroup.other`. No resolvable
      // pattern.
      return null;
    }
    if (!hasVeg) {
      return CompositionPattern.vegLight;
    }
    if (protein >= 2 && protein > veg) {
      return CompositionPattern.proteinHeavy;
    }
    if (starch >= 2 && starch > veg) {
      return CompositionPattern.starchHeavy;
    }
    if (veg >= 2 && protein == 0) {
      return CompositionPattern.vegRich;
    }
    if (dairy == 0 && majorGroupCount <= 1) {
      return CompositionPattern.dairyLight;
    }
    // `other` is intentionally not consulted for the balanced
    // decision — a plate with only `other` entries was already
    // caught by the `major == 0` guard. Here the plate has at least
    // one resolvable major group.
    return CompositionPattern.balanced;
  }
}
