// Test-only bundle of Riverpod overrides that wires the Story 2.2
// coach provider chain onto every ProviderScope that already
// overrides `encryptedStoreProvider`. Without these, every path that
// renders the Day Board (or drives `RecordPlate`) throws
// `UnimplementedError` because `coachProvider` and
// `coachNoteStoreProvider` are sealed seams that must be overridden
// at the ProviderScope root — same pattern Story 1.5 (catalog) and
// Story 1.8 (photo / AI rung) ship.
//
// Callers invoke `withCoachProviders(overrides: [...])` to get a new
// list that prepends the coach providers onto their own overrides.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';

import '_fakes/fake_encrypted_store.dart';

/// Wrap any existing list of overrides with the coach provider
/// overrides every widget / provider test needs. The `coachProvider`
/// override uses `FakeCoach()` (Story 2.1) and the coach-note-store
/// override uses `FakeCoachNoteStore()` (Story 2.2). The pair
/// satisfies the Story 2.2 contract: the post-resolve whisper path
/// can be exercised end-to-end (RecordPlate → CoachNoteGenerator →
/// LocalCoachNoteStore → coachNotesForPlateProvider) without pulling
/// in a real drift database.
List<Override> withCoachProviders({
  required List<Override> overrides,
  Coach? coach,
  FakeCoachNoteStore? coachNotes,
}) {
  return [
    coachProvider.overrideWithValue(coach ?? FakeCoach()),
    coachNoteStoreProvider.overrideWithValue(
      coachNotes ?? FakeCoachNoteStore(),
    ),
    ...overrides,
  ];
}
