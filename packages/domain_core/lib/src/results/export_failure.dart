// Typed export results (Story 4.2 / AD-9 / FR-9 / NFR10).
//
// The exporter never throws; every failure is a typed variant the
// UI pattern-matches. The variants follow the existing
// `StoreFailure` / `RecognitionFailure` envelope conventions
// (sealed `ExportResult` with `ExportReady` / `ExportFailed`).
//
// AD-1: the result type lives in `domain_core`; pure-Dart; no
// Flutter / SQLite / HTTP / web imports.

import '../entities/plate_log.dart';

sealed class ExportResult {
  const ExportResult();
}

/// The exporter produced a `PlateLog` list. The destination
/// adapter serializes the list to CSV or JSON and writes it to
/// the user-chosen destination.
class ExportReady extends ExportResult {
  const ExportReady(this.plates);
  final List<PlateLog> plates;
}

/// The exporter refused the request. The reason is one of the
/// sealed variants below.
sealed class ExportFailure extends ExportResult {
  const ExportFailure();
}

/// The encrypted store is closed (web session locked). The UI
/// surfaces the calm "unlock the store first" line.
class StoreClosed extends ExportFailure {
  const StoreClosed();
}

/// The export format could not serialize a row (defensive; should
/// not happen for v1 row shapes).
class ExportFormatFailure extends ExportFailure {
  const ExportFormatFailure();
}

/// The scope could not be resolved (e.g. an unparseable date).
class ExportScopeFailure extends ExportFailure {
  const ExportScopeFailure();
}
