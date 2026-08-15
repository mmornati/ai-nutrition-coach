---
title: 'Story 1.7 — Scan a barcode on packaged food (FR2)'
type: 'feature'
created: '2026-08-15'
status: 'ready-for-dev'
review_loop_iteration: 0
baseline_commit: '37e22d7'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.5/1.6 opened the manual path and the capture sheet, but the barcode path (FR-2) — "point my camera at a barcode and get a recognized food in ≤2s" — is still missing. It's one of the three convergent entry paths the PRD requires.

**Approach:** Extend `FoodCatalog` (shipped by 1.5) with a `lookupByBarcode(String code)` method that hits Open Food Facts reads (no API key, public endpoint) via `dio`, caches results in the same offline LRU so a repeat scan works offline, and falls back gracefully on unknown barcodes. Add a `BarcodeScannerScreen` in `apps/client/lib/screens/` that mounts `mobile_scanner`'s `MobileScanner` widget, requests camera permission via `permission_handler`, scans one barcode at a time, calls `FoodCatalog.lookupByBarcode`, and routes the match through `RecordPlate`. Unknown barcodes show a "Not found — type it manually" surface that opens `ManualEntryScreen` with the scanned code pre-filled. Implement `capture_barcode_screen.dart` declared by 1.6.

## Boundaries & Constraints

**Always:**
- AD-1: barcode-specific domain logic (if any) stays in `packages/domain_core`; HTTP + camera live in `packages/integrations` and `apps/client`.
- AD-4: barcode path uses the same `FoodCatalog` port as the manual path (single seam).
- AD-3: confirmed barcodes commit through `RecordPlate`; no second mutation path.
- NFR1: known barcode resolves ≤2s on a midrange device.
- NFR5: cached resolution works offline; if a barcode is in the LRU and network is revoked, return the cached result.
- NFR7: camera permission denial falls back to manual entry with screen-reader parity.
- FR13: no biometric identification anywhere on the camera path; the camera stream is processed locally and only the barcode string is sent to OFF.

**Ask First:**
- Whether `mobile_scanner` is added to `apps/client/pubspec.yaml` now (it ships in 1.7 — declared in stack.md).
- Whether `permission_handler` is the permission surface or the platform's built-in prompt only (spec ships `permission_handler` for cross-platform parity).

**Never:**
- No OFF write-back / contribution in this story (OQ-3 v2 deferred).
- No API key sent with OFF reads (FR2).
- No drift/SQLite imports in `apps/client/lib`.
- No barcode string sent to any third party other than OFF reads.
- No spinner / countdown / urgency on the scanner surface (FR15, UX-DR13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_KNOWN | User scans a known barcode (e.g., `3017620422003` — Nutella) | `FoodCatalog.lookupByBarcode` returns `RankedMatches([Nutella])` in ≤2s; the match sheet shows + quantity preset; `Log` commits a `PlateLog` via `RecordPlate` | N/A |
| HAPPY_PATH_CACHED | User scans the same known barcode again with network revoked | Same result from the offline LRU cache | N/A |
| UNKNOWN_BARCODE | User scans `0000000000000` | `NotFoundFailure` returned; screen shows "Not found — type it manually" with a tap-to-type affordance that opens `ManualEntryScreen` with the code pre-filled | N/A |
| OFFLINE_NEVER_SEEN | User scans a new barcode with network revoked | Same "Not found" path as online (offline-first: don't block on network); manual entry offered | N/A |
| PERMISSION_DENIED | User denies camera | Screen renders "Camera denied — type it instead" with a tap-to-type affordance; no nag | Calm copy, no nag |
| CAMERA_ERROR | Camera init fails (e.g., another app is using it) | Screen renders "Camera unavailable — type it instead"; no crash | Typed `CameraInitFailure` |
| CATALOG_FAILURE | OFF endpoint returns 5xx | "Search isn't available right now" calm line; manual entry still works | Typed `CatalogFailure` |
| MULTI_SCAN | User scans one, then another | Each scan is processed sequentially; previous sheet is dismissed; no two sheets stack | N/A |
| AMBIENT_LIGHT_LOW | Scanner can't decode | `MobileScanner` keeps trying with a quiet "Move closer or steady" hint; no countdown | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/ports/food_catalog.dart` -- extend with `Future<RankedMatches> lookupByBarcode(String code)` -- AD-4 single port
- `packages/domain_core/lib/src/results/catalog_failure.dart` -- add `NotFoundFailure` variant for barcode misses (already declared by 1.5; ensure the typed result covers barcode lookup)
- `packages/integrations/lib/src/catalog/offline_first_food_catalog.dart` -- extend with `lookupByBarcode` that hits OFF reads (no key) via `dio`, caches results, returns `NotFoundFailure` on miss
- `packages/integrations/lib/src/catalog/off_barcode_source.dart` -- new; `class OffBarcodeSource` wrapping `dio` with the public OFF read endpoint (`https://world.openfoodfacts.org/api/v2/product/{barcode}.json`)
- `packages/integrations/pubspec.yaml:1` -- add `dio: ^5.11.0` (network dependency lives only here; `apps/client` does not import dio)
- `packages/integrations/lib/integrations.dart:1` -- barrel update
- `packages/integrations/test/offline_first_food_catalog_test.dart` -- add `lookupByBarcode` tests: known barcode (mocked), cache hit, not-found, dio 5xx
- `apps/client/lib/screens/capture_barcode_screen.dart` -- replace the 1.6 placeholder; real implementation
- `apps/client/lib/state/scanner_provider.dart` -- new; `scannerProvider` (StateNotifier holding the latest scanned code) + `barcodeLookupProvider` (FutureProvider.family for the lookup result)
- `apps/client/lib/widgets/barcode_match_sheet.dart` -- new; the bottom sheet that shows the matched food + quantity presets + `Log` button
- `apps/client/lib/screens/day_board_screen.dart` -- wire the Scan tile in the capture sheet to `capture_barcode_screen.dart` (already declared by 1.6)
- `apps/client/pubspec.yaml:11` -- add `mobile_scanner: ^7.4.0` (camera), `permission_handler: ^11.3.1` (cross-platform permission)
- `apps/client/test/screens/capture_barcode_screen_test.dart` -- widget test: mocked scanner + mocked catalog commit via fake store
- `apps/client/test/widgets/barcode_match_sheet_test.dart` -- widget test: matches render; tap Log commits
- `apps/client/lib/main.dart:1` -- no changes needed (capture sheet already routes here from 1.6)

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/ports/food_catalog.dart` -- add `lookupByBarcode(String code)` method (default impl throws `UnimplementedError` so the offline catalog must opt in)
- [ ] `packages/integrations/lib/src/catalog/off_barcode_source.dart` -- `OffBarcodeSource` wrapping `dio` against the OFF public read endpoint; no API key
- [ ] `packages/integrations/lib/src/catalog/offline_first_food_catalog.dart` -- extend with `lookupByBarcode`; offline LRU hit short-circuits the network call
- [ ] `packages/integrations/pubspec.yaml:1` -- add `dio: ^5.11.0`
- [ ] `packages/integrations/lib/integrations.dart:1` -- barrel update
- [ ] `packages/integrations/test/offline_first_food_catalog_test.dart` -- add `lookupByBarcode` tests (mocked dio)
- [ ] `apps/client/pubspec.yaml:11` -- add `mobile_scanner: ^7.4.0`, `permission_handler: ^11.3.1`
- [ ] `apps/client/lib/state/scanner_provider.dart` -- `scannerProvider` + `barcodeLookupProvider`
- [ ] `apps/client/lib/widgets/barcode_match_sheet.dart` -- match sheet with quantity presets + `Log` button
- [ ] `apps/client/lib/screens/capture_barcode_screen.dart` -- replaces the 1.6 placeholder; real `MobileScanner` + permission flow + offline-aware routing
- [ ] `apps/client/lib/screens/day_board_screen.dart` -- Scan tile routes to `capture_barcode_screen.dart`
- [ ] `apps/client/test/screens/capture_barcode_screen_test.dart` -- widget tests with mocked scanner + catalog
- [ ] `apps/client/test/widgets/barcode_match_sheet_test.dart` -- match sheet tests
- [ ] `packages/domain_core/test/domain_core_test.dart:19` -- AD-1 grep test remains green

**Acceptance Criteria:**
- Given camera permission is granted, when a known barcode is scanned, then the `FoodCatalog` port resolves it through OFF (no API key) to a `DatabaseFood` with local cache, in ≤2s on a midrange device (FR2, NFR1).
- Given an unknown barcode, when it is scanned, then a graceful "Not found — type it manually" surface appears with a tap-to-type affordance that opens `ManualEntryScreen` with the code pre-filled (FR2).
- Given a previously-resolved barcode, when it is scanned with network revoked, then the same result is served from the offline LRU cache (FR9, UJ-5).
- Given camera permission is denied, when the screen renders, then a calm "Camera denied — type it instead" line appears and the user can type instead; no nag, no retry button (NFR7).
- Given the commit, when the user taps `Log`, then the barcode path commits through the same `RecordPlate` use-case as every other path (NFR2).
- Given the AD-1 grep test, when `melos run test` runs, then `packages/domain_core/lib/` remains free of drift/SQLite/dio imports.

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test"` -- expected: new widget + state tests pass
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues

**Manual checks:**
- Confirm `dio` is added only to `packages/integrations/pubspec.yaml` (never `apps/client`).
- Confirm `mobile_scanner` is the only camera dependency; no `qr_code_scanner` or other alt.

## Suggested Review Order

**FoodCatalog port extension (AD-4)**
- Single port addition; barcode + manual paths share the same seam.
  [`food_catalog.dart`](../../packages/domain_core/lib/src/ports/food_catalog.dart)

**Offline-first catalog extension (NFR5)**
- `lookupByBarcode` with LRU short-circuit.
  [`offline_first_food_catalog.dart`](../../packages/integrations/lib/src/catalog/offline_first_food_catalog.dart)

**OFF read source (FR2)**
- Public OFF read endpoint, no API key.
  [`off_barcode_source.dart`](../../packages/integrations/lib/src/catalog/off_barcode_source.dart)

**Capture barcode screen (NFR1, NFR7)**
- Camera permission + scanner + match sheet + commit.
  [`capture_barcode_screen.dart`](../../apps/client/lib/screens/capture_barcode_screen.dart)
