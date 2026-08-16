// `CaptureBarcodeScreen` — Story 1.7 / FR2.
//
// The camera scan surface. Replaces the 1.6 placeholder that
// threw `UnimplementedCaptureTarget(barcode)`.
//
// Flow:
//   1. On mount, request camera permission through the
//      `CameraPermission` port. `granted` → show the scanner; any
//      other state → render the calm "Camera denied" or
//      "Camera unavailable" copy with a tap-to-type affordance.
//   2. While the scanner is mounted, subscribe to `BarcodeScanner.scan()`
//      and feed each decoded code through
//      `FoodCatalog.lookupByBarcode`.
//   3. Pattern-match the sealed `CatalogResult`:
//        * `RankedMatches([single match])` → push
//          `BarcodeMatchSheet`. The sheet's Log button commits via
//          `RecordPlate` and writes `lastLogProvider` before
//          popping back to the Day Board.
//        * `NotFoundFailure` → render the calm "Not found — type it
//          manually" copy with a tap-to-`ManualEntryScreen` affordance
//          that pre-fills the scanned code.
//        * `CatalogFailure` → render the calm "Search isn't
//          available right now" line; manual entry still works.
//
// Multi-scan: when a scan resolves, the screen pauses until the
// surfaced sheet / affordance is dismissed; the scanner is then
// re-armed. Two sheets never stack (FR2 I/O matrix).
//
// Permissions: never asks twice, never nags (NFR7). If the user
// denies once, the screen renders the calm copy and a single
// tap-to-type affordance — there is no "Try again" button.
//
// Controller lifecycle (Patch H1): the screen owns the
// `MobileScannerController`'s `start()` / `stop()` lifecycle. The
// controller itself is exposed by the production `BarcodeScanner`
// via `previewController` so the screen feeds the SAME controller
// to both the `MobileScanner` widget and the adapter's `scan()`
// stream. One controller, one `start()` call per scan session.
//
// UX-DR10: no spinner, no countdown, no urgency. The scanner
// surface renders the camera preview with a quiet "Move closer or
// steady" hint when no decode lands, and that is the only urgency
// the user ever sees on this surface.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../state/manual_entry_provider.dart';
import '../state/scanner_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/barcode_match_sheet.dart';
import 'manual_entry_screen.dart';

class CaptureBarcodeScreen extends ConsumerStatefulWidget {
  const CaptureBarcodeScreen({super.key});

  @override
  ConsumerState<CaptureBarcodeScreen> createState() =>
      _CaptureBarcodeScreenState();
}

class _CaptureBarcodeScreenState
    extends ConsumerState<CaptureBarcodeScreen> {
  /// Local permission state — initialised on first build via
  /// `WidgetsBinding.addPostFrameCallback` so we never call the
  /// permission API during build.
  CameraPermissionStatus? _permission;

  /// The current lookup result for the most recently scanned
  /// barcode. `null` while a lookup is in flight or before the
  /// first scan lands.
  CatalogResult? _lookupResult;
  String? _lookupBarcode;
  bool _lookupInFlight = false;

  /// Set to `true` while the match sheet / not-found affordance is
  /// on top of the camera. The scanner subscription drops incoming
  /// codes while this is set so two sheets never stack.
  bool _processing = false;

  /// Subscription on the active `BarcodeScanner` stream.
  StreamSubscription<BarcodeScan>? _scanSub;

  /// Resolved camera controller, cached on first access so `dispose`
  /// can stop the camera without reading from `ref` after the
  /// widget is unmounted (Riverpod forbids `ref.read` in `dispose`).
  /// `null` while permission is pending / denied / unavailable, or
  /// while the adapter is a `FakeBarcodeScanner` (test path).
  /// One controller, one `start()` call per session — Patch H1.
  MobileScannerController? _previewController;

  void _ensurePreviewController() {
    _previewController ??=
        ref.read(barcodeScannerProvider).previewController;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _ensurePermission();
    });
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    // Stop the adapter-owned controller; the adapter owns the
    // instance lifetime and will dispose it (Patch H1 — the screen
    // only owns start/stop, never dispose). The controller is read
    // from the cached field — `ref` is unsafe in `dispose`.
    final controller = _previewController;
    if (controller != null) {
      unawaited(controller.stop());
    }
    super.dispose();
  }

  Future<void> _ensurePermission() async {
    final permission = ref.read(cameraPermissionProvider);
    final status = await permission.request();
    if (!mounted) return;
    setState(() => _permission = status);
    if (status == CameraPermissionStatus.granted) {
      _startScanning();
    }
  }

  void _startScanning() {
    // Patch H1: ONE controller, ONE `start()` call. The adapter owns
    // the `MobileScannerController` instance; the screen owns its
    // start/stop lifecycle and feeds the same instance to the
    // `MobileScanner` widget + the adapter's `scan()` stream.
    _ensurePreviewController();
    final controller = _previewController;
    if (controller != null) {
      // Production path — the controller is real; start it once
      // permission is granted.
      unawaited(controller.start());
    }
    _scanSub = ref.read(barcodeScannerProvider).scan().listen(
      _onScan,
      onError: (Object _) {
        // Scanner errors are usually camera-init failures — surface
        // the calm "Camera unavailable" copy.
        if (!mounted) return;
        setState(() => _permission = CameraPermissionStatus.unavailable);
      },
    );
  }

  Future<void> _onScan(BarcodeScan event) async {
    if (_processing) return;
    final code = event.code.trim();
    if (code.isEmpty) return;

    setState(() {
      _processing = true;
      _lookupBarcode = code;
      _lookupResult = null;
      _lookupInFlight = true;
    });

    CatalogResult result;
    try {
      result = await ref.read(foodCatalogProvider).lookupByBarcode(code);
    } on Object catch (_) {
      // Adapter threw — surface the calm failure line. The screen
      // never rethrows so a UI-level error doesn't crash the camera
      // surface.
      result = CatalogFailure('lookup threw');
    }

    if (!mounted) {
      // Patch H2: the state is being torn down — calling `setState`
      // here would assert. Just return; the disposal path has
      // already cancelled the scan subscription and stopped the
      // controller.
      return;
    }
    setState(() {
      _lookupInFlight = false;
      _lookupResult = result;
    });

    // For match / not-found, the modal sheet / dialog becomes the
    // visible surface. Clear the inline block BEFORE awaiting the
    // dialog so the user does not see two "Type it manually"
    // surfaces stacked (Patch M2 — not-found duplicates).
    final bool clearsOnDismiss = result is RankedMatches ||
        result is NotFoundFailure;
    if (clearsOnDismiss && mounted) {
      setState(() {
        _lookupResult = null;
        _lookupBarcode = null;
      });
    }
    await _routeResult(result, code);

    if (!mounted) return;
    setState(() {
      _processing = false;
    });
  }

  Future<void> _routeResult(CatalogResult result, String code) async {
    switch (result) {
      case RankedMatches(:final matches) when matches.isNotEmpty:
        final match = matches.first;
        await showBarcodeMatchSheet(
          context,
          match: match,
          presets: match.presets,
        );
      case NotFoundFailure():
        // The not-found affordance renders inline (no modal stack);
        // the user taps "Type it manually" to push the manual
        // entry screen with the code pre-filled.
        await _showNotFoundAffordance(code);
      case CatalogFailure():
        // Rendered inline — manual entry still works.
        break;
      case RankedMatches():
        // Empty list — treat as not-found.
        await _showNotFoundAffordance(code);
    }
  }

  Future<void> _showNotFoundAffordance(String code) async {
    final shouldType = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        final palette = Theme.of(dialogCtx).brightness == Brightness.dark
            ? AppPalette.dark
            : AppPalette.light;
        return AlertDialog(
          backgroundColor: palette.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          title: Text(
            'Not found',
            style: AppTypography.ui.copyWith(color: palette.ink),
          ),
          content: Text(
            'This barcode isn\'t in the catalog yet. Type it manually?',
            style: AppTypography.ui.copyWith(color: palette.ink),
          ),
          actions: [
            TextButton(
              // Patch M1: the default `TextButton` minimum height is
              // ~36px; NFR7 requires ≥48px. Mirror the FilledButton
              // next to it so the cancel tap target is a full
              // accessible row.
              style: TextButton.styleFrom(
                minimumSize: const Size.fromHeight(AppTouchTargets.min),
              ),
              onPressed: () => Navigator.of(dialogCtx).pop(false),
              child: Text(
                'Scan again',
                style: AppTypography.ui.copyWith(color: palette.inkMuted),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogCtx).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: palette.sageDeep,
                minimumSize:
                    const Size.fromHeight(AppTouchTargets.min),
              ),
              child: Text(
                'Type it manually',
                style:
                    AppTypography.ui.copyWith(color: palette.background),
              ),
            ),
          ],
        );
      },
    );
    if (shouldType == true && mounted) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ManualEntryScreen(prefilledBarcode: code),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Scan a barcode',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        actions: [
          IconButton(
            tooltip: 'Type it manually',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ManualEntryScreen(),
                ),
              );
            },
            icon: Icon(Icons.keyboard_alt_outlined, color: palette.ink),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: _buildBody(palette),
        ),
      ),
    );
  }

  Widget _buildBody(AppPalette palette) {
    final permission = _permission;
    if (permission == null) {
      return const _Hint(text: 'Checking camera permission…');
    }
    switch (permission) {
      case CameraPermissionStatus.granted:
        // `_previewController` is the adapter-owned controller,
        // cached when `_startScanning` first ran.
        // Production: non-null, fed to the `MobileScanner` widget.
        // Tests: `FakeBarcodeScanner` returns null so we render a
        // plain placeholder — no real camera is ever mounted (Patch
        // H1).
        return _ScannerBody(
          controller: _previewController,
          palette: palette,
          result: _lookupResult,
          inFlight: _lookupInFlight,
          barcode: _lookupBarcode,
          onTypeInstead: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ManualEntryScreen(
                  prefilledBarcode: _lookupBarcode ?? '',
                ),
              ),
            );
          },
        );
      case CameraPermissionStatus.denied:
        return _DeniedCalm(palette: palette);
      case CameraPermissionStatus.unavailable:
        return _UnavailableCalm(palette: palette);
    }
  }
}

class _ScannerBody extends StatelessWidget {
  const _ScannerBody({
    required this.controller,
    required this.palette,
    required this.result,
    required this.inFlight,
    required this.barcode,
    required this.onTypeInstead,
  });

  /// The `MobileScannerController` from the production adapter, or
  /// `null` when the active `BarcodeScanner` is a fake (test path).
  /// When `null`, the body renders a flat placeholder instead of
  /// mounting `MobileScanner` — no real camera is ever touched in
  /// the test environment (Patch H1).
  final MobileScannerController? controller;
  final AppPalette palette;
  final CatalogResult? result;
  final bool inFlight;
  final String? barcode;
  final VoidCallback onTypeInstead;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.md),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (controller != null)
                  MobileScanner(
                    controller: controller!,
                    errorBuilder: (context, error) {
                      return _UnavailableCalm(palette: palette);
                    },
                  )
                else
                  // Patch H1 — test path. `FakeBarcodeScanner` returns
                  // null for `previewController`, so we never mount a
                  // real `MobileScanner` widget in tests.
                  Container(color: palette.surface),
                // Quiet hint — no countdown, no urgency (UX-DR10).
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: AppSpacing.md,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: AppSpacing.xs,
                      ),
                      decoration: BoxDecoration(
                        color: palette.surface.withValues(alpha: 0.85),
                        borderRadius:
                            BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        'Move closer or steady',
                        style: AppTypography.coach
                            .copyWith(color: palette.inkMuted),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _ResultLine(
          result: result,
          inFlight: inFlight,
          barcode: barcode,
          palette: palette,
          onTypeInstead: onTypeInstead,
        ),
      ],
    );
  }
}

class _ResultLine extends StatelessWidget {
  const _ResultLine({
    required this.result,
    required this.inFlight,
    required this.barcode,
    required this.palette,
    required this.onTypeInstead,
  });

  final CatalogResult? result;
  final bool inFlight;
  final String? barcode;
  final AppPalette palette;
  final VoidCallback onTypeInstead;

  @override
  Widget build(BuildContext context) {
    if (inFlight) {
      return _Hint(text: 'Looking up ${barcode ?? ''}…', palette: palette);
    }
    final result = this.result;
    if (result is CatalogFailure) {
      return _FailureBlock(palette: palette, onTypeInstead: onTypeInstead);
    }
    if (result is NotFoundFailure) {
      return _NotFoundBlock(palette: palette, onTypeInstead: onTypeInstead);
    }
    return _Hint(
      text: 'Aim at a packaged barcode to log it.',
      palette: palette,
    );
  }
}

class _DeniedCalm extends StatelessWidget {
  const _DeniedCalm({required this.palette});
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Camera denied — type it instead',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'You can still log a plate from the manual entry screen.',
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ManualEntryScreen(),
                ),
              );
            },
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              backgroundColor: palette.sageDeep,
            ),
            child: Text(
              'Type it manually',
              style: AppTypography.ui.copyWith(color: palette.background),
            ),
          ),
        ),
      ],
    );
  }
}

class _UnavailableCalm extends StatelessWidget {
  const _UnavailableCalm({required this.palette});
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Camera unavailable — type it instead',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'We couldn\'t start the camera. Manual entry still works.',
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ManualEntryScreen(),
                ),
              );
            },
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              backgroundColor: palette.sageDeep,
            ),
            child: Text(
              'Type it manually',
              style: AppTypography.ui.copyWith(color: palette.background),
            ),
          ),
        ),
      ],
    );
  }
}

class _NotFoundBlock extends StatelessWidget {
  const _NotFoundBlock({
    required this.palette,
    required this.onTypeInstead,
  });
  final AppPalette palette;
  final VoidCallback onTypeInstead;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Not found — type it manually',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        const SizedBox(height: AppSpacing.lg),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onTypeInstead,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              side: BorderSide(color: palette.hairline),
              foregroundColor: palette.ink,
            ),
            child: Text(
              'Type it manually',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
        ),
      ],
    );
  }
}

class _FailureBlock extends StatelessWidget {
  const _FailureBlock({
    required this.palette,
    required this.onTypeInstead,
  });
  final AppPalette palette;
  final VoidCallback onTypeInstead;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Search isn't available right now.",
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.lg),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onTypeInstead,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              side: BorderSide(color: palette.hairline),
              foregroundColor: palette.ink,
            ),
            child: Text(
              'Type it manually',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
        ),
      ],
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text, this.palette});
  final String text;
  final AppPalette? palette;

  @override
  Widget build(BuildContext context) {
    final p = palette ??
        (Theme.of(context).brightness == Brightness.dark
            ? AppPalette.dark
            : AppPalette.light);
    return Text(text, style: AppTypography.coach.copyWith(color: p.inkMuted));
  }
}
