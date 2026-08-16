// Riverpod providers for the v1 coach note seam (Story 2.2 / AD-3).
//
// `coachNoteStoreProvider` is the `Provider<CoachNoteStore>` that the
// `CoachNoteGenerator` use-case writes through (and that the Day Board
// reads from). The active adapter is `LocalCoachNoteStore` against
// the same encrypted drift store `EncryptedStoreAdapter` writes to —
// AD-3 invariant: one store, no second source, no second mutation
// path.
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
