// Riverpod providers for the `RecordPlate` mutation and the date-ranged
// plate streams (AD-3).
//
// `recordPlateProvider` is a `Provider` that hands out a `RecordPlate`
// use-case instance. The actual store is wired via
// `encryptedStoreProvider` (overridden at the `ProviderScope` root in
// `main.dart`). The post-resolve coach generator is wired via
// `coachNoteGeneratorProvider` (Story 2.2) so every capture path
// lands the whisper deterministically after a successful commit.
//
// `platesInRangeProvider` is a `StreamProvider.family` derived from the
// store's `watchRange` — never a cached copy held by a notifier. The Day
// Board reads one local day, the week strip seven; neither loads the whole
// history (security review F8). The store commits before the provider emits
// (AD-3 convergent write path).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'coach_note_provider.dart';
import 'sync_queue_provider.dart';

/// The wired `EncryptedStore` — overridden in `main.dart` with the
/// platform-selected adapter (`createEncryptedStore()`).
final encryptedStoreProvider = Provider<EncryptedStore>(
  (ref) => throw UnimplementedError(
    'encryptedStoreProvider must be overridden at the ProviderScope root '
    'with the result of createEncryptedStore() — see apps/client/main.dart.',
  ),
);

/// The single sanctioned mutation path through the domain. Story 2.2
/// wires the post-resolve `CoachNoteGenerator` so every plate path
/// (manual / barcode / photo) fires the whisper after a successful
/// commit. Story 4.3 wires the `RecordSyncOp` enqueue so the
/// outbox receives the op right after the local commit
/// (AD-3 + AD-6 + FR-10). Both post-commit steps are guarded: a failure in
/// either yields `RecordPlateSuccess` with a warning, never a failure (F7).
final recordPlateProvider = Provider<RecordPlate>(
  (ref) => RecordPlate(
    generator: ref.watch(coachNoteGeneratorProvider),
    // No transport (v1) means nothing will ever drain the queue: do not
    // enqueue ops that can only pile up.
    syncOpEnqueue: ref.watch(syncTransportAvailableProvider)
        ? ref.watch(recordSyncOpProvider)
        : null,
    // Calm UI, loud diagnostics: a failed post-commit step is logged in
    // debug builds only (the plate itself is committed).
    onWarning: (warning) => debugPrint('openplate: $warning after commit'),
  ),
);

/// A half-open `[from, to)` range of instants. A record, so it is a value
/// (usable as a family key).
typedef PlateRange = ({DateTime from, DateTime to});

/// The plates logged in [range], newest first — a live derived view over
/// `EncryptedStore.watchRange`.
final platesInRangeProvider = StreamProvider.autoDispose
    .family<List<PlateLog>, PlateRange>(
      (ref, range) => ref
          .watch(encryptedStoreProvider)
          .watchRange(from: range.from, to: range.to),
    );

/// The range covering the local calendar day of [day] (DST-safe: the end is
/// `DateTime(y, m, d + 1)`, not `+ 24h`).
PlateRange localDayRange(DateTime day) =>
    (from: startOfLocalDay(day), to: startOfNextLocalDay(day));
