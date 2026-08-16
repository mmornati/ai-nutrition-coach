// Riverpod providers for the v1 coach note seam (Story 2.2 / 2.3 /
// AD-3).
//
// `coachNoteStoreProvider` is the `Provider<CoachNoteStore>` that the
// `CoachNoteGenerator` use-case writes through (and that the Day
// Board reads from). The active adapter is `LocalCoachNoteStore`
// against the same encrypted drift store `EncryptedStoreAdapter`
// writes to — AD-3 invariant: one store, no second source, no second
// mutation path.
//
// `coachNoteGeneratorProvider` is the wired `CoachNoteGenerator` —
// the single object the `RecordPlate` use-case invokes after a
// successful commit. It pulls `coachProvider` (Story 2.1) and
// `coachNoteStoreProvider` (Story 2.2) from the Riverpod graph; the
// production wiring at `main.dart` overrides `coachProvider` with
// `TemplateCoach()` and constructs `LocalCoachNoteStore` against the
// open `EncryptedStoreAdapter`.
//
// `coachNotesForPlateProvider` is the `FutureProvider.family` the
// `PlateRow` widget watches to render the whisper on each plate. The
// family key is `plateLogId`; the empty list is the legacy-data path
// (pre-2.2 plates have no note, render without the whisper).
//
// `recordCoachInteractionProvider` (Story 2.3) hands the
// `RecordCoachInteraction` use-case to the UI. The provider is
// overridden in `main.dart` with the wired use-case so the
// `CoachWhisper` and `OpenPlateHint` widgets can record the user's
// tap without re-instantiating the use-case.
//
// `depthFollowUpProvider` (Story 2.3) is a `FutureProvider.family`
// keyed on the post-resolve `CoachNote`. Tapping `[sure]` on a
// whisper invokes the use-case via this provider; the future
// resolves to the depth follow-up `CoachNote` (or `null` on the
// calm-degrade path). The `CoachWhisper` widget watches this
// provider to render the `CoachDepthPanel`.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'coach_provider.dart';

/// The wired `CoachNoteStore` — overridden in `main.dart` with the
/// `LocalCoachNoteStore` adapter constructed against the active
/// `EncryptedStore`. Tests inject a `FakeCoachNoteStore` (a hand-
/// rolled `_FakeEncryptedStore` equivalent that satisfies the
/// `CoachNoteStore` port).
final coachNoteStoreProvider = Provider<CoachNoteStore>(
  (ref) => throw UnimplementedError(
    'coachNoteStoreProvider must be overridden at the ProviderScope '
    'root with the result of `LocalCoachNoteStore(database: ...)`. '
    'See apps/client/lib/main.dart.',
  ),
);

/// The wired `CoachNoteGenerator` — the `RecordPlate` use-case reads
/// this and invokes `generateFor(plate)` after a successful commit.
/// Pulls `coachProvider` (Story 2.1) and `coachNoteStoreProvider`
/// (Story 2.2) from the graph.
final coachNoteGeneratorProvider = Provider<CoachNoteGenerator>(
  (ref) => CoachNoteGenerator(
    coach: ref.watch(coachProvider),
    store: ref.watch(coachNoteStoreProvider),
  ),
);

/// Coach notes anchored to a given `plateLogId`, in insertion order
/// (oldest first). The empty list is the legacy-data path — a plate
/// with no note renders without the whisper.
final coachNotesForPlateProvider =
    FutureProvider.family<List<CoachNote>, int>((ref, plateLogId) async {
  final store = ref.watch(coachNoteStoreProvider);
  return store.forPlate(plateLogId);
});

/// The wired `RecordCoachInteraction` use-case — overridden in
/// `main.dart` with a use-case constructed from `coachProvider`
/// + `coachNoteStoreProvider`. Tests inject a fake
/// `RecordCoachInteraction` to assert the dispatch contract without
/// pulling in the real use-case.
final recordCoachInteractionProvider = Provider<RecordCoachInteraction>(
  (ref) => RecordCoachInteraction(
    coach: ref.watch(coachProvider),
    store: ref.watch(coachNoteStoreProvider),
  ),
);

/// Resolved depth follow-up `CoachNote` for a tapped post-resolve
/// `CoachNote` (Story 2.3). Tapping `[sure]` on the post-resolve
/// whisper invokes the use-case via this provider; the family
/// resolves to the new `CoachNote` (with `anchor: depthFollowUp`)
/// on the happy path, or `null` when the active coach returned
/// `NoCoachQuestion` for the depth anchor, when the coach port
/// threw (defensive), or when the follow-up already exists for the
/// plate (idempotent second tap).
///
/// The provider is `autoDispose` so the depth follow-up state
/// collapses to `null` when the widget tears down — no stale
/// follow-up survives a navigation event.
///
/// Family key: the post-resolve `CoachNote` itself. The widget
/// caller (`CoachWhisper` rendered inside `PlateRow`) already
/// holds the note (rendered via `coachNotesForPlateProvider`), so
/// the family key is the same instance the widget taps on. Two
/// taps on the same note share the autoDispose cache; a second
/// tap is idempotent because the use-case's follow-up guard sees
/// an existing depth follow-up for the plate and returns `null`
/// (FR5).
final depthFollowUpProvider = FutureProvider.family
    .autoDispose<CoachNote?, CoachNote>((ref, note) async {
  final useCase = ref.watch(recordCoachInteractionProvider);
  final result = await useCase(
    note: note,
    kind: CoachInteraction.sure,
  );
  // The use-case returns a `RecordCoachInteractionSure` with the
  // (possibly-null) `followedUpNote`. The provider resolves to the
  // note itself so the UI does not have to pattern-match on the
  // sealed result hierarchy.
  return result.followedUpNote;
});
