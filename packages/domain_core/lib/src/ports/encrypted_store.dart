// The single mutation surface for the encrypted local store (AD-3).
//
// Everything that wants to commit a `PlateLog` goes through this port:
//   * the `RecordPlate` use-case (which validates `entries.isNotEmpty`),
//   * the date-ranged watch stream for the UI (`watchRange`) and the
//     one-shot range read for export (`readRange`),
//   * the single-plate removal (`deletePlate`, PV5),
//   * the lifetime owner (`close`).
//
// Implementations live in `packages/integrations`:
//   * `EncryptedStoreAdapter` — mobile (drift on sqlite3mc, ChaCha20-Poly1305,
//     AD-8: at-rest via Keychain/Keystore).
//   * `WasmEncryptedStore` — web (Phase 2B / AD-8, ADR-0002: same drift
//     schema on sqlite3mc compiled to WebAssembly, ChaCha20-Poly1305
//     pages persisted in IndexedDB, key derived from a user passphrase
//     and held in memory only while unlocked).
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

  /// Watch the plates logged in the half-open instant range `[from, to)`,
  /// newest first (the Day Board and the week strip pass local-calendar-day
  /// boundaries computed with `addCalendarDays`). Implemented as ONE join
  /// query — plates with their entries — served by the `logged_at_utc` and
  /// `plate_log_id` indexes, so cost follows the range, not the whole
  /// history, and is never one query per plate. The stream
  /// emits one full snapshot per change — never a cached copy held by a
  /// notifier (AD-3). While the store cannot serve reads (web: locked) it
  /// emits nothing or a typed `StoreStreamException`; it never throws raw.
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  });

  /// One-shot read of the plates in `[from, to)` (either bound may be
  /// omitted for an open end; both omitted reads everything — "all
  /// history" export). Newest first. Never throws: a failure is a typed
  /// `PlatesReadFailed`.
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to});

  /// Remove the plate [plateLogId], all of its food entries and (in the real
  /// stores, which share one database with the coach notes) its coach notes,
  /// their interactions and dismissal markers, in ONE transaction
  /// (privacy audit PV5: a wrong or another member's plate no longer needs
  /// "erase everything"). An unknown id is a success. The coach notes
  /// anchored to the plate are removed through `CoachNoteStore.deleteForPlate`
  /// (see the `DeletePlate` use case). Day Board / week-strip watch streams
  /// emit a fresh snapshot without the plate. Never throws.
  Future<DeletePlateResult> deletePlate(int plateLogId);

  /// Release any underlying handles (drift `NativeDatabase`, etc.).
  /// Called when the app shuts down or the provider is disposed.
  Future<void> close();
}
