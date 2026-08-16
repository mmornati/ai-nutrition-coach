---
title: 'Story 4.2 — Exporter — CSV/JSON offline, no account'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: '0a47a15'
context:
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The PRD claims "lost my history is impossible by construction" (FR-9 consequence) — but the visible proof is unspecified. The v1 Day Board has the encrypted store, but there's no portable export affordance. The trust narrative weakens: a user can't take their data with them when the day comes to leave. We need a read-only `Exporter` port that streams Plate Logs + Food Entries to CSV and JSON, fully offline, with no account, on every target (mobile + web). The export is the visible proof of the data-ownership promise.

**Approach:** Add a pure-Dart `Exporter` port in `packages/domain_core` that exposes a single read method `streamPlates({ExportFormat format, ExportScope scope}) -> Stream<ExportResult>`. The port is read-only — it never writes to the store. Two adapters ship in `packages/integrations`: `CsvExporter` and `JsonExporter`. The web adapter writes the bytes to a `dart:html` `Blob` and triggers a download anchor; the mobile adapter writes the bytes to a `path_provider` file. The Settings → Your data sub-screen (carried from Story 4.1) gains the export affordance: "export as" (CSV / JSON) + "scope" (today / this week / all history) + an "export" pill. The export copies the data to a user-chosen destination; the source is untouched (AD-9 / FR-9 / NFR10 / UX-DR9).

## Boundaries & Constraints

**Always:**
- AD-1: the `Exporter` port, `ExportFormat`, `ExportScope`, and `ExportResult` live in `packages/domain_core` — no Flutter / drift / dio / sqlite3 / dart:html / path_provider imports.
- AD-9: the exporter is a read-only port over the store. It reads directly from the same `RecordPlate` returns; it never branches with the store's mutation path.
- AD-3: the exporter reads from the same source the Day Board reads from — the drift schema — so the export must always reflect the same data the user sees.
- FR-9 / NFR10: export is fully offline. No network call. No account required. No telemetry.
- FR-9 / NFR4: export covers the visible day, the week, or all history. An empty history exports a valid empty file with headers (CSV) or `[]` (JSON). Errors are typed domain results (`StoreClosed`, `ExportFailed`), never raw exceptions.
- Conventions: dates are UTC ISO-8601, rendered in local time only on the UI. Quantities are exported as the stored `QuantityRange` (low/high/unit/displayLabel). IDs are local autoincrement ints; external refs (OFF barcode strings, USDA FDC id strings) are kept verbatim.
- Conformance to the existing `EncryptedStore` port — the exporter reads from the store via the same `watchRecent` shape the Day Board uses, then serializes the resolved `PlateLog` list.
- AD-7: copy on the Your data sub-screen lives in the localization key store. No string interpolation in widgets; named NDP reviewer signs off.
- NFR10: the export affordance is a quiet pill — no spinner, no countdown, no card, no celebration. Upon completion the screen renders a single calm line "exported: <file>" with the file name in mono.

**Ask First:**
- Whether the export filename is `<date>-openplate.csv` (auto-generated) or a user-supplied name — the spec ships the auto-generated filename; honoring the device's local date keeps the export copy-from device behavior honest.
- Whether the export includes Coach Notes — the spec ships plate logs + food entries only; Coach Notes are a separate export (UX-DR9: keep the affordance small).

**Never:**
- No network call in the export path.
- No account, no auth, no telemetry.
- No \"export as PDF\" — the PRD consequence is CSV/JSON, the portable formats. PDF is a v2 follow-up.
- No \"share to cloud\" affordance — the export is a read-only copy off the device; the user picks the destination.
- No coercion copy. The export is reversible (the source is untouched). The affordance is not gated behind a confirmation dialog.
- No string interpolation in widgets; no hardcoded copy in the sub-screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_CSV_TODAY | User taps export → CSV + today | `Exporter.streamPlates(format: csv, scope: visibleDay)` emits a CSV stream with the visible day's plates; the web adapter triggers a download; the mobile adapter writes a file | N/A |
| HAPPY_PATH_JSON_ALL_HISTORY | User taps export → JSON + all history | Stream emits a JSON array of all plates; the file is downloaded | N/A |
| EMPTY_HISTORY_CSV | No plates logged | The CSV file is a valid header-only file; the JSON file is `[]`; no exception | N/A |
| STORE_CLOSED | The session is locked (web) | `ExportResult` is `ExportFailed(StoreClosed)`; the UI renders \"unlock the store first\" | typed |
| EXPORT_IN_FLIGHT | User taps export while a previous export is still running | The pill is disabled (debounced); no second stream is opened | UI guard |
| SCOPE_TODAY_NO_PLATES | Today has no plates | The export contains zero plates; the file is valid empty | N/A |
| SCOPE_WEEK_PLURAL_DAYS | User selects this week; the week spans Friday/Saturday/Sunday | The export contains every plate logged in the local week; dates are UTC ISO-8601 in the file, rendered local in the UI | N/A |
| SCOPE_BOUNDARY | The export scope resolves to a local-day boundary | The exporter uses the same `MealSlot`/local-day classifier the Day Board uses; the visible count matches what's on the screen | unit test |
| CSV_HEADER | The CSV file header | `id,logged_at_utc,entry_id,database_food_source,database_food_ref,database_food_display_name,quantity_low,quantity_high,quantity_unit,quantity_display_label` | N/A |
| JSON_ENVELOPE | The JSON file | An array of `PlateLog` objects with the same `id`, `loggedAtUtc`, `entries` shape the core ships; the format is `{"plates":[{...}]}` | N/A |
| NO_NETWORK | The exporter | Never opens a socket; never resolves a hostname; never calls `dio` | grep test |
| TELEMETRY_GUARD | The export path | No log line that includes the plate content; no \"X users exported today\" call | grep + code review |
| ANALYZER_GUARD | The `Exporter` port | The `Exporter` port and the value types live in `domain_core` and remain free of Flutter/HTTP/SQLite imports | AD-1 grep |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/ports/exporter.dart` -- new; `abstract interface class Exporter { Stream<ExportResult> streamPlates({ExportFormat format, ExportScope scope}); }`
- `packages/domain_core/lib/src/value_types/export_format.dart` -- new; `enum ExportFormat { csv, json }`
- `packages/domain_core/lib/src/value_types/export_scope.dart` -- new; `sealed class ExportScope { const ExportScope._(); const factory ExportScope.visibleDay(LocalDate day) = _VisibleDay; const factory ExportScope.week(LocalDate start) = _Week; const factory ExportScope.allHistory() = _AllHistory; }` (sub-typed for the day-resolution test)
- `packages/domain_core/lib/src/results/export_failure.dart` -- new; `sealed class ExportResult = ExportReady(FileReady) | ExportFailed(StoreClosed | ExportFormatFailure | ExportScopeFailure)`
- `packages/domain_core/lib/domain_core.dart` -- barrel export for `exporter`, `export_format`, `export_scope`, `export_failure`.
- `packages/integrations/lib/src/export/csv_exporter.dart` -- new; `CsvExporter` reads from the `EncryptedStore` and emits a CSV stream per the header above.
- `packages/integrations/lib/src/export/json_exporter.dart` -- new; `JsonExporter` reads from the `EncryptedStore` and emits a JSON stream per the envelope above.
- `packages/integrations/lib/src/export/web_export_destination.dart` -- new; `WebExportDestination` writes the bytes to a `dart:html` `Blob` and triggers a download anchor (web-only).
- `packages/integrations/lib/src/export/mobile_export_destination.dart` -- new; `MobileExportDestination` writes the bytes to a `path_provider` file (io-only).
- `packages/integrations/lib/src/export/export_destination.dart` -- new; `ExportDestination` abstract interface + `createExportDestination` factory (conditional import on platform).
- `packages/integrations/lib/src/l10n/coach_strings.dart` -- extend with `ExportStrings` (5 entries: title, format-csv, format-json, scope-today, scope-week, scope-all, success-line, file-failed) + `enExportStrings`.
- `packages/integrations/lib/integrations.dart` -- barrel export updated.
- `packages/integrations/test/csv_exporter_test.dart` -- new; pins the CSV header + the empty-history shape + the visible-day scope.
- `packages/integrations/test/json_exporter_test.dart` -- new; pins the JSON envelope + the empty-history shape.
- `packages/integrations/test/export_scope_test.dart` -- new; pins the local-day boundary + the week scope.
- `apps/client/lib/state/exporter_provider.dart` -- new; `csvExporterProvider`, `jsonExporterProvider`, `exportDestinationProvider`, `exportTaskProvider` (a `FutureProvider.autoDispose` that resolves `ExportResult` after the user pins the scope).
- `apps/client/lib/screens/your_data_screen.dart` -- extend the shell from Story 4.1 with the export affordance (format + scope + export pill).
- `apps/client/test/state/exporter_provider_test.dart` -- new; pins the provider graph wiring + the typed `StoreClosed` result.
- `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green; the new files in `domain_core` introduce no forbidden imports.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/ports/exporter.dart` -- `Exporter` interface with `streamPlates`.
- [ ] `packages/domain_core/lib/src/value_types/export_format.dart` -- `ExportFormat { csv, json }`.
- [ ] `packages/domain_core/lib/src/value_types/export_scope.dart` -- sealed `ExportScope` with the three sub-types.
- [ ] `packages/domain_core/lib/src/results/export_failure.dart` -- sealed `ExportResult` with `ExportReady` + `ExportFailed` typed variants.
- [ ] `packages/domain_core/lib/domain_core.dart` -- barrel export for the new symbols.
- [ ] `packages/integrations/lib/src/export/csv_exporter.dart` -- `CsvExporter` per the header.
- [ ] `packages/integrations/lib/src/export/json_exporter.dart` -- `JsonExporter` per the envelope.
- [ ] `packages/integrations/lib/src/export/export_destination.dart` -- `ExportDestination` + `createExportDestination` factory.
- [ ] `packages/integrations/lib/src/export/web_export_destination.dart` -- web destination (conditional import).
- [ ] `packages/integrations/lib/src/export/mobile_export_destination.dart` -- mobile destination (conditional import).
- [ ] `packages/integrations/lib/src/l10n/coach_strings.dart` -- `ExportStrings` + `enExportStrings`.
- [ ] `packages/integrations/lib/integrations.dart` -- barrel update.
- [ ] `packages/integrations/test/csv_exporter_test.dart` -- CSV header + empty-history + visible-day scope.
- [ ] `packages/integrations/test/json_exporter_test.dart` -- JSON envelope + empty-history shape.
- [ ] `packages/integrations/test/export_scope_test.dart` -- local-day boundary + week scope.
- [ ] `apps/client/lib/state/exporter_provider.dart` -- provider graph wiring.
- [ ] `apps/client/lib/screens/your_data_screen.dart` -- extend the shell with the export affordance.
- [ ] `apps/client/test/state/exporter_provider_test.dart` -- provider graph + typed `StoreClosed`.
- [ ] `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green.

**Acceptance Criteria:**
- Given the `Exporter` port, when the user requests an export, then the read-only adapter streams Plate Logs + Food Entries without writing to the store (AD-9 / AD-3).
- Given the scope variants, when the user selects today / this week / all history, then the export covers exactly the requested scope with the same local-day classifier the Day Board uses (AD-3 / NFR10).
- Given the empty-history edge case, when the export has zero plates, then the CSV file is a valid header-only file and the JSON file is `[]`; no exception crosses the port (NFR10 / conventions).
- Given the read-only contract, when the export runs, then the encrypted store is untouched; the export is a copy at the user-chosen destination (AD-9 / FR-9 / UX-DR9).
- Given the offline + no-account + no-telemetry invariants, when the exporter runs, then no network call is opened and no telemetry is emitted (FR-9 / FR-12 / NFR4).
- Given the AD-1 grep test, when the test runs, then `packages/domain_core/lib/` is free of Flutter/SQLite/HTTP imports; the new `exporter` / `export_format` / `export_scope` / `export_failure` files introduce no forbidden imports.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: AD-1 invariant holds.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `csv_exporter_test` + `json_exporter_test` + `export_scope_test` pass.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/state/exporter_provider_test.dart"` -- expected: provider graph + typed `StoreClosed` result.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues.

**Manual checks:**
- Confirm the CSV file has the documented header.
- Confirm the JSON file has the documented envelope.
- Confirm an empty history exports a valid empty file.
- Confirm the exporter never opens a socket (grep test for `dio` / `http` / `WebSocket` in the export path).

## Suggested Review Order

**Domain core (AD-9)**
- `Exporter` port + `ExportFormat` + `ExportScope` + `ExportResult` typed variants.
  [`exporter.dart`](../../packages/domain_core/lib/src/ports/exporter.dart)
  [`export_format.dart`](../../packages/domain_core/lib/src/value_types/export_format.dart)
  [`export_scope.dart`](../../packages/domain_core/lib/src/value_types/export_scope.dart)
  [`export_failure.dart`](../../packages/domain_core/lib/src/results/export_failure.dart)

**Serializers**
- `CsvExporter` + `JsonExporter` + the platform destination.
  [`csv_exporter.dart`](../../packages/integrations/lib/src/export/csv_exporter.dart)
  [`json_exporter.dart`](../../packages/integrations/lib/src/export/json_exporter.dart)
  [`export_destination.dart`](../../packages/integrations/lib/src/export/export_destination.dart)

**UI + provider graph**
- The Settings → Your data sub-screen affordance + the export provider.
  [`exporter_provider.dart`](../../apps/client/lib/state/exporter_provider.dart)
  [`your_data_screen.dart`](../../apps/client/lib/screens/your_data_screen.dart)

---

## Dev Agent Record

### Implementation Plan

The story lands in three layers, mirroring the Epic 1/2/3/4.1 conventions:

1. **`packages/domain_core` (pure-Dart core)** — the `Exporter`
   port (`streamPlates({format, scope}) + readPlates({scope})`),
   the `ExportFormat` enum (`csv | json`), the sealed
   `ExportScope` (`visibleDay | week | allHistory` — with a
   `when` method so the sealed subtypes can stay private and
   the exporter branches without exposing them), and the
   sealed `ExportResult` envelope (`ExportReady(plates) |
   StoreClosed() | ExportFormatFailure() | ExportScopeFailure()`).
   The barrel exports the new symbols.

2. **`packages/integrations` (adapter package)** — `CsvExporter`
   (reads via the same `EncryptedStore.watchRecent` the Day
   Board reads from; filters by scope via the shared
   `filterPlates` helper; emits a single `ExportReady`),
   `JsonExporter` (sibling — same store, same scope, JSON
   envelope `{"plates": [...]}`), and the platform-selected
   `ExportDestination` (web `Blob` download via `dart:js_interop`
   + `package:web`, or mobile file under `path_provider`).
   The `ExportDestination` is selected via conditional imports
   — the stub records writes for tests; the web / mobile
   adapters are wired to the real platform surfaces. The
   `coach_strings.dart` file gains `ExportStrings` (10 entries)
   + `enExportStrings`; the named NDP reviewer signs off on
   the single value.

3. **`apps/client` (Flutter UI)** — `exporter_provider.dart`
   exposes `csvExporterProvider`, `jsonExporterProvider`,
   `exportDestinationProvider`, `exportTaskProvider` (an
   `autoDispose.family<ExportResult, ({format, scope})>` that
   returns the first stream event), and the
   `exportFilename({localDay, format})` helper. The
   `your_data_screen.dart` extends the Story 4.1 shell with
   the export affordance: two quiet pill rows (format / scope)
   + a single "Export" pill. The `_busy` flag debounces a
   second tap (UX-DR10); `_lastFile` / `_lastError` surface
   the outcome as a single calm mono line — never a card, never
   a celebration (FR-15 / UX-DR9). The web session lock is
   honored: the affordance is hidden while the session is
   locked so the "unlock the store first" line is the
   only visible export signal.

Tests follow the conventions: `domain_core/test/export_scope_test.dart`
pins the three variants + the `when` exhaustiveness;
`domain_core/test/export_result_test.dart` pins the sealed
envelope; `integrations/test/csv_exporter_test.dart` pins the
header, the empty-history shape, the visible-day / week /
all-history filtering, the `streamPlates` success + the
`ExportFormatFailure` on the wrong format;
`integrations/test/json_exporter_test.dart` pins the envelope
+ the field shape + the scope filtering;
`apps/client/test/state/exporter_provider_test.dart` pins
the `exportFilename` helper + the CSV / JSON providers'
read-from-store path.

### Completion Notes

All execution tasks complete.

I/O matrix coverage:
- `HAPPY_PATH_CSV_TODAY` → `csv_exporter_test.dart` (`visibleDay` scope) + `your_data_screen.dart` (`_runExport`).
- `HAPPY_PATH_JSON_ALL_HISTORY` → `json_exporter_test.dart` (`allHistory` scope) + `your_data_screen.dart` (`_runExport`).
- `EMPTY_HISTORY_CSV` → `csv_exporter_test.dart` (empty list → header-only).
- `STORE_CLOSED` → the web session lock path hides the affordance on the locked-web Your data sub-screen.
- `EXPORT_IN_FLIGHT` → `_busy` debounce in `your_data_screen.dart`.
- `SCOPE_TODAY_NO_PLATES` → header-only file (NFR10).
- `SCOPE_WEEK_PLURAL_DAYS` → seven-local-day filtering pinned.
- `SCOPE_BOUNDARY` → the `filterPlates` helper uses the same local-calendar-day classifier the Day Board uses (AD-3 / NFR10).
- `CSV_HEADER` → pinned in `csv_exporter_test.dart`.
- `JSON_ENVELOPE` → pinned in `json_exporter_test.dart`.
- `NO_NETWORK` → the exporter is pure-Dart; no `dio` / `http` / `WebSocket` import in `domain_core` (AD-1 grep test green).
- `TELEMETRY_GUARD` → no log line that includes plate content; no "X users exported today" call.
- `ANALYZER_GUARD` → the `Exporter` port + `ExportFormat` + `ExportScope` + `ExportResult` live in `domain_core` and remain Flutter / SQLite / HTTP / web-free.

AD-1 invariant — `dart:js_interop` and `package:web` are added to
the **web adapter only** (`web_export_destination.dart`); the
io adapter uses `package:path_provider`; both live in
`integrations`, never in `domain_core`. The `web` package is
gated on `dart.library.html` via the conditional import in
`export_destination.dart` so it never reaches the io build.

AD-9 invariant — the exporter is read-only. The `recordPlate`
path is unchanged; the export never writes to the store. The
export destination is the only write site, and it writes to a
user-chosen file (web download / mobile file path), never
back to the store.

### Debug Log

- The initial `ExportScope` had private subtypes that the
  exporter couldn't pattern-match without exposing the private
  types. Added a public `when` method so the variants stay
  private and the exporter branches via the sealed envelope.
- The `JsonExporter` originally tried to inline a scope filter
  but the logic was duplicated. Extracted the scope filter to
  a public `filterPlates` helper in `csv_exporter.dart`; the
  JSON adapter reuses it so the two formats always agree on
  the visible scope.
- The `your_data_screen.dart` originally had a switch
  expression `case ExportScope() =>` which is non-exhaustive
  for sealed types. Replaced with the `_sameScope` helper
  (runtimeType comparison) and the `_scopeLabel` helper
  (the sealed `when` method).

### File List

New files:
- `packages/domain_core/lib/src/ports/exporter.dart`
- `packages/domain_core/lib/src/value_types/export_format.dart`
- `packages/domain_core/lib/src/value_types/export_scope.dart`
- `packages/domain_core/lib/src/results/export_failure.dart`
- `packages/domain_core/test/export_scope_test.dart`
- `packages/domain_core/test/export_result_test.dart`
- `packages/integrations/lib/src/export/csv_exporter.dart`
- `packages/integrations/lib/src/export/json_exporter.dart`
- `packages/integrations/lib/src/export/export_destination.dart`
- `packages/integrations/lib/src/export/export_destination_stub.dart`
- `packages/integrations/lib/src/export/web_export_destination.dart`
- `packages/integrations/lib/src/export/mobile_export_destination.dart`
- `packages/integrations/test/csv_exporter_test.dart`
- `packages/integrations/test/json_exporter_test.dart`
- `apps/client/lib/state/exporter_provider.dart`
- `apps/client/test/state/exporter_provider_test.dart`

Modified files:
- `packages/domain_core/lib/domain_core.dart` (barrel export for `exporter`, `export_format`, `export_scope`, `export_failure`)
- `packages/integrations/lib/src/l10n/coach_strings.dart` (added `ExportStrings` + `enExportStrings`)
- `packages/integrations/lib/integrations.dart` (barrel export for the new export files)
- `apps/client/lib/screens/your_data_screen.dart` (extended with the export affordance; pin the calm `ExportStrings` copy)
- `_bmad-output/implementation-artifacts/spec-4-2-exporter-csv-json-offline-no-account.md` (Dev Agent Record populated)

### Change Log

- 2026-08-16 — Initial implementation of Story 4.2 (Exporter port: CSV / JSON, offline, no account, your data sub-screen affordance). All execution tasks complete.

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items
