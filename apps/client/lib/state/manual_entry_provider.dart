// Riverpod providers for the manual-entry flow (Story 1.5 / FR3).
//
// `foodCatalogProvider` is a `Provider<FoodCatalog>` that hands out the
// adapter the manual-entry screen reads through. It is overridden at
// the `ProviderScope` root in `main.dart` with
// `OfflineFirstFoodCatalog()` — the production seam.
//
// `voiceTranscriberProvider` is the parallel seam for the voice path.
// The v1 override is `NoopVoiceTranscriber()` — the mic button still
// renders and the screen surfaces the calm "Voice not available in v1
// — type instead" copy on tap (FR3 / FR13).
//
// `manualEntryProvider` is the `StateNotifier` that owns the
// in-flight manual-entry session: the live query, the ranked matches
// from the catalog, the currently selected match, and the chosen
// quantity preset. It is intentionally UI-local — when the screen
// pops back to the Day Board the provider's state is reset.
//
// State providers in Riverpod 3.x live in `package:flutter_riverpod/legacy.dart`;
// `StateNotifier` is the spec-mandated shape, so the legacy import
// stays. Epic 2 will lean on `NotifierProvider` for actual domain state;
// this surface stays ephemeral.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

/// The wired `FoodCatalog` — overridden in `main.dart` with
/// `OfflineFirstFoodCatalog()`.
final foodCatalogProvider = Provider<FoodCatalog>(
  (ref) => throw UnimplementedError(
    'foodCatalogProvider must be overridden at the ProviderScope root '
    'with the result of `OfflineFirstFoodCatalog()` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The wired `VoiceTranscriber` — overridden in `main.dart` with
/// `NoopVoiceTranscriber()` (Story 1.5 seam; real `speech_to_text`
/// adapter arrives in Epic 3+).
final voiceTranscriberProvider = Provider<VoiceTranscriber>(
  (ref) => throw UnimplementedError(
    'voiceTranscriberProvider must be overridden at the ProviderScope root '
    'with the result of `NoopVoiceTranscriber()` — see '
    'apps/client/lib/main.dart.',
  ),
);

/// The shape the manual-entry screen consumes. All fields are exposed
/// immutably; the notifier produces a new instance on every transition.
class ManualEntryState {
  const ManualEntryState({
    required this.query,
    required this.matches,
    required this.selected,
    required this.chosenPreset,
    required this.lastError,
    required this.catalogStatus,
  });

  /// Empty / initial state. The screen renders an empty text field and
  /// no matches.
  factory ManualEntryState.initial() => const ManualEntryState(
    query: '',
    matches: <FoodMatch>[],
    selected: null,
    chosenPreset: null,
    lastError: null,
    catalogStatus: ManualEntryCatalogStatus.idle,
  );

  /// The raw text the user has typed (or transcribed). Whitespace
  /// preserved — the catalog adapter trims for the cache key.
  final String query;

  /// The current ranked list from the catalog. Empty when the query is
  /// empty, when no match exists, or when the adapter failed.
  final List<FoodMatch> matches;

  /// The match the user has tapped to confirm. `null` until the user
  /// makes a selection; required for `Log` to be enabled.
  final FoodMatch? selected;

  /// The quantity preset the user has chosen for [selected]. Defaults
  /// to the first preset on the food when a match is selected; can be
  /// re-picked from the preset row.
  final QuantityRange? chosenPreset;

  /// Calm copy shown above the no-match form when the adapter could
  /// not produce a result. `null` when the adapter is healthy.
  final String? lastError;

  /// Coarse-grained status — used by the screen to decide whether to
  /// render the ranked list, the manual-add form, or the calm failure
  /// line.
  final ManualEntryCatalogStatus catalogStatus;

  ManualEntryState copyWith({
    String? query,
    List<FoodMatch>? matches,
    FoodMatch? selected,
    bool clearSelected = false,
    QuantityRange? chosenPreset,
    bool clearChosenPreset = false,
    String? lastError,
    bool clearLastError = false,
    ManualEntryCatalogStatus? catalogStatus,
  }) {
    return ManualEntryState(
      query: query ?? this.query,
      matches: matches ?? this.matches,
      selected: clearSelected ? null : (selected ?? this.selected),
      chosenPreset: clearChosenPreset
          ? null
          : (chosenPreset ?? this.chosenPreset),
      lastError: clearLastError ? null : (lastError ?? this.lastError),
      catalogStatus: catalogStatus ?? this.catalogStatus,
    );
  }
}

/// Coarse-grained status of the catalog call. The screen renders
/// different affordances per status.
enum ManualEntryCatalogStatus {
  /// No query, no call. Default state.
  idle,

  /// Query resolved with at least one match.
  matched,

  /// Query resolved with zero matches.
  notFound,

  /// Adapter could not produce a result.
  catalogFailure,
}

/// The state machine behind [manualEntryProvider].
///
/// The notifier calls into [foodCatalogProvider] on every query change
/// and pattern-matches the sealed [CatalogResult] into the screen-
/// facing [ManualEntryState]. Selection / preset pick happen in-memory
/// — no further catalog call needed.
class ManualEntryNotifier extends StateNotifier<ManualEntryState> {
  ManualEntryNotifier(this._catalog) : super(ManualEntryState.initial());

  final FoodCatalog _catalog;

  /// Update the query and re-fetch the ranked list from the catalog.
  /// The screen calls this on every `onChanged`.
  Future<void> updateQuery(String rawQuery) async {
    final trimmed = rawQuery.trim();
    if (trimmed.isEmpty) {
      state = ManualEntryState.initial();
      return;
    }

    state = state.copyWith(
      query: rawQuery,
      clearSelected: true,
      clearChosenPreset: true,
      clearLastError: true,
    );

    final CatalogResult result;
    try {
      result = await _catalog.search(trimmed);
    } on Object catch (_) {
      // Adapter threw — surface the calm failure line, never rethrow.
      state = state.copyWith(
        matches: const <FoodMatch>[],
        catalogStatus: ManualEntryCatalogStatus.catalogFailure,
        lastError: "Search isn't available right now.",
        clearSelected: true,
        clearChosenPreset: true,
      );
      return;
    }

    switch (result) {
      case RankedMatches(:final matches):
        state = state.copyWith(
          matches: matches,
          catalogStatus: matches.isEmpty
              ? ManualEntryCatalogStatus.notFound
              : ManualEntryCatalogStatus.matched,
          clearLastError: true,
        );
      case NotFoundFailure():
        state = state.copyWith(
          matches: const <FoodMatch>[],
          catalogStatus: ManualEntryCatalogStatus.notFound,
          clearLastError: true,
          clearSelected: true,
          clearChosenPreset: true,
        );
      case CatalogFailure():
        state = state.copyWith(
          matches: const <FoodMatch>[],
          catalogStatus: ManualEntryCatalogStatus.catalogFailure,
          lastError: "Search isn't available right now.",
          clearSelected: true,
          clearChosenPreset: true,
        );
    }
  }

  /// Mark [match] as the selected food. The first preset on the match
  /// becomes the default chosen preset; the user can swap it via
  /// [selectPreset].
  void selectMatch(FoodMatch match) {
    final firstPreset = match.presets.isNotEmpty ? match.presets.first : null;
    state = state.copyWith(
      selected: match,
      chosenPreset: firstPreset,
      clearChosenPreset: firstPreset == null,
    );
  }

  /// Swap the chosen quantity preset for the currently-selected match.
  void selectPreset(QuantityRange preset) {
    state = state.copyWith(chosenPreset: preset);
  }

  /// Reset every field. Called when the screen pops back to the Day
  /// Board on a successful commit.
  void clear() {
    state = ManualEntryState.initial();
  }
}

/// The manual-entry session notifier — built on the spec-mandated
/// `StateNotifier` shape. Uses the legacy riverpod import because
/// `StateNotifier` lives in `package:flutter_riverpod/legacy.dart` in
/// Riverpod 3.x; the surface here is intentionally ephemeral and
/// Epic 2 will introduce `NotifierProvider` for actual domain state.
final manualEntryProvider =
    StateNotifierProvider<ManualEntryNotifier, ManualEntryState>(
      (ref) => ManualEntryNotifier(ref.watch(foodCatalogProvider)),
    );
