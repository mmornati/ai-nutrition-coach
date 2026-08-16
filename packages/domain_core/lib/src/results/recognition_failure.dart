// Typed results crossing the `AiRung` port (conventions.md / AD-5).
//
// `RecognitionResult` is a sealed hierarchy with three variants:
//   * `RecognizedPlate`  — the rung produced zero or more foods. An
//     empty list is *not* a failure: the v1 `NoopAiRung` always
//     returns an empty `RecognizedPlate` so the photo path degrades
//     to "closest-matches + manual" (NFR5). UI distinguishes an
//     empty recognition from a failure by inspecting the list.
//   * `NoMatch`          — the rung produced nothing AND signaled
//     "there is genuinely no food on this plate" (e.g. the plate
//     photo is of an empty plate). Distinct from an empty
//     `RecognizedPlate` so the UI can show a different calm copy.
//   * `RecognitionFailure` — the adapter could not produce a
//     result (network down, model unavailable, etc.). The UI
//     renders the calm "Search isn't available right now" line and
//     still offers the closest-matches + manual fallback.
//
// `RecognitionFailure` carries an opaque `Object cause`; the UI
// never inspects it (only the adapter logs the raw cause).

import '../value_types/recognized_food.dart';

/// Result of an `AiRung.recognize` call. Exactly one of the three
/// variants applies per call.
sealed class RecognitionResult {
  const RecognitionResult();
}

/// The rung produced zero or more foods for the photo. An empty
/// [foods] list is *not* a failure — it means "I looked, but did not
/// find anything I can commit" and the UI offers the closest-matches
/// + manual-add path (the v1 `NoopAiRung` always returns this shape).
class RecognizedPlate extends RecognitionResult {
  const RecognizedPlate({required this.foods});

  /// The foods the rung resolved from the photo. May be empty —
  /// callers pattern-match on this list separately from
  /// [RecognitionFailure] and [NoMatch] to decide the next surface.
  final List<RecognizedFood> foods;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecognizedPlate && _listEq(other.foods, foods));

  @override
  int get hashCode =>
      Object.hash('RecognizedPlate', Object.hashAll(foods));

  @override
  String toString() => 'RecognizedPlate(${foods.length} foods)';
}

/// The rung looked at the photo and saw no food at all. Distinct
/// from an empty `RecognizedPlate` so the UI can render calm copy
/// without implying the rung malfunctioned.
class NoMatch extends RecognitionResult {
  const NoMatch();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is NoMatch;

  @override
  int get hashCode => (NoMatch).hashCode;

  @override
  String toString() => 'NoMatch()';
}

/// The rung could not produce a result — network down, recognizer
/// unavailable, malformed payload, etc. The UI renders the calm
/// failure line; only the adapter logs [cause].
class RecognitionFailure extends RecognitionResult {
  const RecognitionFailure(this.cause);

  final Object cause;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecognitionFailure && other.cause == cause);

  @override
  int get hashCode => Object.hash('RecognitionFailure', cause);

  @override
  String toString() => 'RecognitionFailure($cause)';
}

bool _listEq<T>(List<T> a, List<T> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
