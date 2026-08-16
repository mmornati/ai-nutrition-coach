// Riverpod providers for the `RecordPlate` mutation and the
// `recentPlatesProvider` watch stream (AD-3).
//
// `recordPlateProvider` is a `Provider` that hands out a `RecordPlate`
// use-case instance. The actual store is wired via
// `encryptedStoreProvider` (overridden at the `ProviderScope` root in
// `main.dart`). The post-resolve coach generator is wired via
// `coachNoteGeneratorProvider` (Story 2.2) so every capture path
// lands the whisper deterministically after a successful commit.
//
// `recentPlatesProvider` is a `StreamProvider` derived from the store's
// `watchRecent` stream — never a cached copy held by a notifier. UI
// screens read this as a single source of truth; the store commits
// before the provider emits (AD-3 convergent write path).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'coach_note_provider.dart';

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
/// commit.
final recordPlateProvider = Provider<RecordPlate>(
  (ref) => RecordPlate(generator: ref.watch(coachNoteGeneratorProvider)),
);

/// Recent plates — derived view over `watchRecent`, no cached mirror.
final recentPlatesProvider = StreamProvider<List<PlateLog>>(
  (ref) => ref.watch(encryptedStoreProvider).watchRecent(),
);
