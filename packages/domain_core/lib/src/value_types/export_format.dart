// The export format — CSV or JSON (Story 4.2 / AD-9 / FR-9).
//
// AD-1: the enum lives in `domain_core`; pure-Dart; no Flutter /
// SQLite / HTTP / web imports.

enum ExportFormat { csv, json }
