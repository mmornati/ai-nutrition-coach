// Where mobile exports live (Phase 2A / D9) — shared by
// `MobileExportDestination` (writes there) and the local-data eraser
// (deletes there). Pure Dart; no IO imports.

/// Sub-directory of the platform temp directory that holds export files
/// between "written" and "handed to the share sheet". Never the
/// documents directory: that is included in device backups (iCloud /
/// iTunes) and, on iOS, can be exposed through the Files app.
const String kExportSubdirectory = 'ai_nutrition_coach_exports';

/// Exports written by builds before Phase 2A landed in the documents
/// directory as `YYYY-MM-DD-ai-nutrition-coach.csv|json` (`-openplate` before
/// the project rename). The eraser removes these legacy files too.
final RegExp legacyExportFileName = RegExp(
  r'^\d{4}-\d{2}-\d{2}-(ai-nutrition-coach|openplate)\.(csv|json)$',
);

/// The pre-rename name of [kExportSubdirectory]; the eraser removes it too.
const String kLegacyExportSubdirectory = 'openplate_exports';

/// Sub-directory of the temp/cache directory where `share_plus` on Android
/// copies every shared file so the receiving app can read it through a
/// content URI. That copy is outside our control after the hand-off, so
/// we purge old files in it and the eraser removes it.
const String kSharePlusCacheSubdirectory = 'share_plus';

/// Export files older than this are purged at the start of the next
/// export (never the whole directory: a hand-off may still be reading a
/// recent file).
const Duration kExportStaleAfter = Duration(hours: 1);
