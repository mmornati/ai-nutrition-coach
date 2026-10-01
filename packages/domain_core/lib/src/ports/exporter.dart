// The read-only `Exporter` port over the encrypted store
// (Story 4.2 / AD-9 / FR-9).
//
// The exporter streams `PlateLog` lists to CSV or JSON, scoped to
// the visible day, the week, or all history. The port is pure —
// the adapter writes the bytes to a user-chosen destination
// (web download / mobile file path). The port never branches the
// core on the export format or scope; the consumer picks.
//
// AD-9: export is read-only. The exporter never writes to the
// store; the source is untouched. The exporter reads from the same
// `EncryptedStore` the Day Board reads from, so the export always
// matches what's on screen (AD-3).
//
// Errors are typed (`ExportResult`); no raw exception crosses the
// port. The `StoreClosed` variant is raised when the web session
// is locked (Story 4.1); the mobile store can't be closed at
// runtime, so the variant is web-only in practice but lives in
// the result type so the pattern match is uniform.

import '../results/export_failure.dart';
import '../value_types/export_format.dart';
import '../value_types/export_scope.dart';

abstract interface class Exporter {
  /// Stream the resolved `PlateLog` list for the requested scope
  /// in the requested format. The stream emits exactly one event
  /// — the full list for the scope — then closes. Callers
  /// serialize the event to CSV / JSON at the destination.
  Stream<ExportResult> streamPlates({
    required ExportFormat format,
    required ExportScope scope,
  });

  /// Read a snapshot of the plates for the requested scope with ONE
  /// bounded range read on the store (`EncryptedStore.readRange`) — not a
  /// watch stream, and never the whole history for a one-day export.
  /// `ExportReady` on success; `StoreClosed` while the web store is locked;
  /// `ExportReadFailed` for any other store failure.
  Future<ExportResult> readPlates({required ExportScope scope});
}
