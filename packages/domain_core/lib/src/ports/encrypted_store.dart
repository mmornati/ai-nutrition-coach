// The single mutation surface for the encrypted local store (AD-3).
//
// Everything that wants to commit a `PlateLog` goes through this port:
//   * the `RecordPlate` use-case (which validates `entries.isNotEmpty`),
//   * the watch stream for the UI (`watchRecent`),
//   * the lifetime owner (`close`).
//
// Implementations live in `packages/integrations`:
//   * `EncryptedStoreAdapter` — mobile (drift on sqlite3mc, AES-256,
//     AD-8: at-rest via Keychain/Keystore).
//   * `WasmEncryptedStore` — web (Story 4.1 / AD-8: same drift schema
//     on `sqlite3.wasm` with a PBKDF2-derived session key held in
//     memory for the session lifetime only — session-sealed, not
//     at-rest encrypted).
//
// No domain mutation crosses this port as a raw exception — drift
// errors and web-side key-derivation failures are caught at the
// adapter boundary and surfaced as `StoreFailure`. The web adapter
// returns `StoreFailure(encryptedStoreError: WebSessionKeyFailure())`
// while the session is locked.

import '../entities/plate_log.dart';
import '../results/store_failure.dart';
import '../value_types/food_entry_draft.dart';

abstract interface class EncryptedStore {
  /// Commit a new plate. The store assigns the autoincrement `id` on the
  /// `PlateLog` and each entry's `plateLogId`; `RecordPlateSuccess` carries
  /// the resolved `PlateLog` back to the caller.
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  });

  /// Watch committed plates, newest first. `since` is a UTC cutoff for
  /// pagination / incremental loads. The stream emits one full snapshot
  /// per commit — never a cached copy held by a notifier (AD-3).
  Stream<List<PlateLog>> watchRecent({DateTime? since});

  /// Release any underlying handles (drift `NativeDatabase`, etc.).
  /// Called when the app shuts down or the provider is disposed.
  Future<void> close();
}
