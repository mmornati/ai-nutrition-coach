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
// `coachNotesForPlateProvider` is the `StreamProvider.family` the
// `PlateRow` widget watches to render the whisper on each plate. The
// family key is `plateLogId`; the empty list is the legacy-data path
// (pre-2.2 plates have no note, render without the whisper). It is a
// stream so a note appended right after the plate commit still shows up.
//
// `recordCoachInteractionProvider` (Story 2.3) hands the
// `RecordCoachInteraction` use-case to the UI. The provider is
// overridden in `main.dart` with the wired use-case so the
// `CoachWhisper` and `OpenPlateHint` widgets can record the user's
// tap without re-instantiating the use-case.
//
// `depthFollowUpProvider` (Story 2.3) is a family `Notifier` keyed on the
// post-resolve `CoachNote`; its `request()` method (called from the `[sure]`
// tap) runs the use-case and publishes the follow-up. The `CoachWhisper`
// widget watches its state to render the `CoachDepthPanel`.

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

/// Coach notes anchored to a given `plateLogId`, oldest first, as a STREAM
/// (security review F6). The post-resolve note is appended a moment AFTER
/// the plate commit; a one-shot read taken when the plate row first built
/// cached an empty list and never saw it. The watch re-emits when the note
/// lands. The empty list is the legacy-data path — a plate with no note
/// renders without the whisper.
final coachNotesForPlateProvider = StreamProvider.autoDispose
    .family<List<CoachNote>, int>(
      (ref, plateLogId) =>
          ref.watch(coachNoteStoreProvider).watchForPlate(plateLogId),
    );

/// The durable "quiet" markers (dismissed whispers and open-plate hints) as
/// a stream of keys (`coachNoteDismissalKey` / `openPlateDismissalKey`).
/// Persisted in the store, so a dismissal survives a restart (F6).
final coachDismissalsProvider = StreamProvider<Set<String>>(
  (ref) => ref.watch(coachNoteStoreProvider).watchDismissals(),
);

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

/// Where the depth follow-up for one whisper stands.
sealed class DepthFollowUpState {
  const DepthFollowUpState();
}

/// `[sure]` has not been tapped.
final class DepthFollowUpIdle extends DepthFollowUpState {
  const DepthFollowUpIdle();
}

/// The use-case is running.
final class DepthFollowUpLoading extends DepthFollowUpState {
  const DepthFollowUpLoading();
}

/// The use-case finished. [note] is the bounded depth follow-up, or `null` on
/// the calm-degrade path (the active coach had nothing for the depth anchor,
/// the store write failed, or a follow-up already existed — an idempotent
/// second tap, FR5).
final class DepthFollowUpReady extends DepthFollowUpState {
  const DepthFollowUpReady(this.note);

  final CoachNote? note;
}

/// The depth follow-up of one post-resolve whisper (Story 2.3 / FR5).
///
/// This replaces a `FutureProvider` whose BUILD ran the use-case: building a
/// provider must be free of side effects (a rebuild, a read from a test, a
/// second listener would each have appended a note and logged a tap — F6).
/// Now building is inert (`DepthFollowUpIdle`); the write happens only in
/// [request], which the whisper calls from the `[sure]` tap.
///
/// Family key: the post-resolve [CoachNote]. `autoDispose` so the state
/// collapses with the widget — no stale follow-up survives navigation.
class DepthFollowUpNotifier extends Notifier<DepthFollowUpState> {
  DepthFollowUpNotifier(this.note);

  final CoachNote note;

  @override
  DepthFollowUpState build() => const DepthFollowUpIdle();

  /// Record `[sure]` and resolve the follow-up. Safe to call twice: while
  /// loading or once ready it does nothing (the use-case is also idempotent
  /// at the store level).
  Future<void> request() async {
    if (state is! DepthFollowUpIdle) return;
    state = const DepthFollowUpLoading();
    CoachNote? followUp;
    try {
      final result = await ref.read(recordCoachInteractionProvider)(
        note: note,
        kind: CoachInteraction.sure,
      );
      followUp = result.followedUpNote;
    } on Object {
      followUp = null;
    }
    if (!ref.mounted) return;
    state = DepthFollowUpReady(followUp);
  }
}

final depthFollowUpProvider = NotifierProvider.autoDispose
    .family<DepthFollowUpNotifier, DepthFollowUpState, CoachNote>(
      DepthFollowUpNotifier.new,
    );
