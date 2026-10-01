// Shared helpers for the capture surfaces that commit a plate (manual entry,
// barcode sheet, photo sheet). They each used to carry their own copy of the
// same commit call, failure copy and "one serving / custom food" literals —
// and each set a `_submitting` flag that a throwing store call left stuck
// (security review F7 / F10).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'clock_provider.dart';
import 'record_plate_provider.dart';

/// Commit [entries] through `RecordPlate` on the wired store, stamped with
/// the app's clock (`clockProvider`, i.e. `DateTime.now` in production and a
/// fixed instant in tests, so the plate lands on the day / slot the test
/// expects). NEVER throws:
/// anything unexpected comes back as a typed `StoreFailure`, so callers can
/// reset their busy flag in a plain `finally` and always show calm copy.
Future<RecordPlateResult> commitPlate(
  WidgetRef ref,
  List<FoodEntryDraft> entries,
) async {
  try {
    return await ref.read(recordPlateProvider)(
      entries: entries,
      store: ref.read(encryptedStoreProvider),
      loggedAtUtc: ref.read(clockProvider)().toUtc(),
    );
  } on Exception {
    return const StoreFailure(encryptedStoreError: StoreOperationFailure());
  }
}

/// The calm one-line copy for a failed log.
String logFailureMessage(StoreFailure failure) {
  return switch (failure) {
    StoreFailure(platformError: UnsupportedPlatformFailure()) =>
      'Mobile-only in v1.',
    StoreFailure(encryptedStoreError: SecureKeyFailure()) =>
      "History can't open on this device.",
    StoreFailure() => 'Could not log plate.',
  };
}

/// The quantity used when nothing better is known: "~1 serving".
const QuantityRange kOneServing = QuantityRange(
  low: 1,
  high: 1,
  unit: 'serving',
  displayLabel: '~1 serving',
);

/// The food for a name the user typed. Its group is unknown (`other`).
DatabaseFood manualFood(String name) => DatabaseFood(
  sourceRef: 'manual:${name.toLowerCase()}',
  displayName: name,
  source: SourceCatalog.manual,
);
