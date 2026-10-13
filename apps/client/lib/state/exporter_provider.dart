// Settings → Your data export provider graph (Story 4.2 / AD-9).
//
// The Riverpod wiring for the export affordance. The exporter is
// built against the `encryptedStoreProvider` (already overridden
// in `main.dart`); the destination is platform-selected via
// `createExportDestination` (web download / mobile file path).
// The `exportTaskProvider` resolves a one-shot `ExportResult` from
// the user-pinned (format, scope) pair.
//
// AD-7: copy is keyed in `ExportStrings` (in the integrations
// `coach_strings.dart`); never interpolated. The export file name
// is auto-generated from the local date so the affordance is
// reversible and the source is untouched (AD-9 / FR-9 / UX-DR9).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'record_plate_provider.dart';

/// The CSV exporter — `CsvExporter` over the `encryptedStoreProvider`.
/// The CSV is the documented header + one row per food entry.
final Provider<Exporter> csvExporterProvider = Provider<Exporter>((ref) {
  return CsvExporter(store: ref.watch(encryptedStoreProvider));
});

/// The JSON exporter — `JsonExporter` over the same store. Reads
/// from the same source the CSV exporter reads from, so the two
/// formats always agree on what the export contains (AD-3).
final Provider<Exporter> jsonExporterProvider = Provider<Exporter>((ref) {
  return JsonExporter(store: ref.watch(encryptedStoreProvider));
});

/// The platform-selected export destination. The factory
/// resolves to a `WebExportDestination` on web (Blob download)
/// or a `MobileExportDestination` on io (path_provider file).
final Provider<ExportDestination> exportDestinationProvider =
    Provider<ExportDestination>((ref) {
      return createExportDestination();
    });

/// Resolve a one-shot `ExportResult` for the user-pinned (format,
/// scope) pair. The provider is autoDispose so a second export
/// starts a fresh stream.
final exportTaskProvider = FutureProvider.autoDispose
    .family<ExportResult, ({ExportFormat format, ExportScope scope})>((
      ref,
      args,
    ) async {
      final Exporter exporter = args.format == ExportFormat.csv
          ? ref.watch(csvExporterProvider)
          : ref.watch(jsonExporterProvider);
      final stream = exporter.streamPlates(
        format: args.format,
        scope: args.scope,
      );
      return stream.first;
    });

/// Build the export filename from the local date + format
/// extension. The filename is the user-facing artefact the
/// "exported: `file`" line references. AD-9: the file is a copy;
/// the source is untouched.
String exportFilename({
  required DateTime localDay,
  required ExportFormat format,
}) {
  final datePart =
      '${localDay.year.toString().padLeft(4, '0')}-'
      '${localDay.month.toString().padLeft(2, '0')}-'
      '${localDay.day.toString().padLeft(2, '0')}';
  final ext = format == ExportFormat.csv ? 'csv' : 'json';
  return '$datePart-ai-nutrition-coach.$ext';
}
