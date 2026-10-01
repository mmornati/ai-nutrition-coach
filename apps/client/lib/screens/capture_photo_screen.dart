// `CapturePhotoScreen` — Story 1.8 / FR1 / AD-5 / FR13 / NFR1 /
// NFR7 / UX-DR10.
//
// The photo-capture entry surface. Replaces the 1.6 placeholder that
// threw `UnimplementedCaptureTarget(photo)`.
//
// Flow:
//   1. On mount, the screen triggers a `PhotoCapture.capture()` so the OS
//      camera UI appears on first build (mirrors the barcode screen's
//      "open the scanner on mount" pattern), then dispatches a fresh
//      `AiRung.recognize` call. If the active rung would upload the photo
//      to a third-party host (BYOK), the user is asked ONCE per host
//      first (N1); "not now" skips the call and the photo is dropped.
//      The photo bytes are held in a local only — never in a provider
//      (N10).
//   2. While the rung is running, the screen renders a quiet
//      `ResolvingShimmer` — no spinner, no countdown, no urgency
//      (UX-DR10 / FR15).
//   3. On result, the screen routes through the sealed
//      `RecognitionResult`:
//        * `RecognizedPlate(foods: [one or more])` → render the
//          `RecognizedMatchSheet` with the recognized foods +
//          closest matches (catalog matches for each recognised name,
//          then the foods logged in the last week). The
//          sheet's `Log` button commits via `RecordPlate` and
//          writes `lastLogProvider` before popping back to the
//          Day Board.
//        * `RecognizedPlate(foods: [])` (NoopAiRung default) →
//          same surface, just the closest-matches + manual-add
//          form. The user can still log.
//        * `NoMatch` → calm "Nothing on this plate" copy +
//          closest-matches + manual-add. The log never fails.
//        * `RecognitionFailure` → calm "Search isn't available
//          right now" line + closest-matches + manual-add. The log
//          never fails.
//   4. Permission denial (camera denied / cancelled) renders the
//      calm "Camera denied — type it instead" copy + a tap-to-type
//      affordance that pushes `ManualEntryScreen`.
//
// Multi-shot: every capture starts a fresh recognition; a retake resets the
// surface, and only the latest capture's result renders on screen (FR13 I/O
// matrix).
//
// FR13: photo is processed with no identity linkage. The rung
// receives raw bytes, drops them after recognition, and never
// persists them. No face / voice biometric anywhere on this path.

import 'dart:async';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/ai_rung_provider.dart';
import '../state/ai_settings_provider.dart';
import '../state/clock_provider.dart';
import '../state/manual_entry_provider.dart';
import '../state/photo_provider.dart';
import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/photo_consent_dialog.dart';
import '../widgets/recognized_match_sheet.dart';
import '../widgets/resolving_shimmer.dart';
import 'manual_entry_screen.dart';

/// The local surface state of the photo screen.
///
/// `idle` is the initial state (camera not yet opened). `capturing`
/// means the OS camera UI is open or about to open. `resolving`
/// means a capture landed and the rung is running. `ready` means a
/// result is in hand and the match sheet should be shown. `denied`
/// means the user cancelled or the OS denied the permission prompt.
enum _PhotoSurfaceState { idle, capturing, resolving, ready, denied }

class CapturePhotoScreen extends ConsumerStatefulWidget {
  const CapturePhotoScreen({super.key});

  @override
  ConsumerState<CapturePhotoScreen> createState() => _CapturePhotoScreenState();
}

class _CapturePhotoScreenState extends ConsumerState<CapturePhotoScreen> {
  /// Local surface state — drives the calm copy + the shimmer +
  /// the match-sheet trigger. The provider holds the latest
  /// capture's bytes; this state field holds the resolved result
  /// after the rung returns.
  _PhotoSurfaceState _state = _PhotoSurfaceState.idle;

  /// The recognition result we resolved for the most recent
  /// capture. `null` while a call is in flight or before the first
  /// capture lands.
  RecognitionResult? _result;

  /// Closest-matches we resolved for the most recent capture.
  /// Empty list while a call is in flight, before the first
  /// capture, or when the catalog returned `NotFoundFailure`.
  List<FoodMatch> _closestMatches = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _captureOnce();
    });
  }

  @override
  void dispose() {
    super.dispose();
  }

  /// Open the OS camera UI and dispatch the captured photo through
  /// the rung + the catalog closest-matches lookup. Mirrors the
  /// barcode screen's "open the camera on mount" pattern.
  Future<void> _captureOnce() async {
    if (!mounted) return;
    setState(() {
      _state = _PhotoSurfaceState.capturing;
      _result = null;
      _closestMatches = const [];
    });

    Uint8List? bytes;
    try {
      bytes = await ref.read(photoCaptureProvider).capture();
    } on Object catch (_) {
      // Defensive — `image_picker` should not throw, but if a
      // platform channel misfires we land on the calm denied path
      // rather than crashing the camera surface.
      bytes = null;
    }

    if (!mounted) return;

    if (bytes == null) {
      setState(() => _state = _PhotoSurfaceState.denied);
      return;
    }

    // N1: before the photo goes to a third-party host, ask — once per
    // host. No host (no-AI rung, or nothing would be sent) means no ask.
    String? host;
    var consented = true;
    try {
      host = ref.read(photoUploadHostProvider);
    } on Object catch (_) {
      // Could not tell where this photo would go: fail closed — it goes
      // nowhere (the no-AI core takes over).
      consented = false;
    }
    if (host != null && !ref.read(photoConsentGrantedProvider(host))) {
      consented = await confirmPhotoUpload(context, host: host);
      if (!mounted) return;
      if (consented) {
        try {
          await ref.read(aiSettingsProvider.notifier).grantPhotoConsent(host);
        } on Object catch (_) {
          // Could not remember it. Fail closed: the rung's consent guard
          // reads the persisted setting, so this photo is NOT sent (the
          // no-AI path takes over) and they are asked again next
          // time.
          consented = false;
        }
      }
    }
    if (!mounted) return;

    setState(() => _state = _PhotoSurfaceState.resolving);

    // Recognise first; the closest matches are then derived from what the
    // rung saw (catalog matches for each recognised name) plus the foods
    // the user logged recently. A failed or empty recognition still offers
    // the recent foods, and manual-add always works.
    RecognitionResult recognition = const RecognitionFailure('unreachable');
    try {
      // Read the rung INSIDE the try (F1): a missing override or a
      // throwing adapter lands on the calm failure line, never on an
      // endless shimmer. A "not now" never reaches the rung: the photo is
      // dropped and the no-AI core (closest matches + manual) takes over.
      final future = consented
          ? ref.read(aiRungProvider).recognize(bytes)
          : Future<RecognitionResult>.value(
              const RecognizedPlate(foods: <RecognizedFood>[]),
            );
      recognition = await future;
    } on Object catch (_) {
      // Defensive — adapters must wrap in `RecognitionFailure`,
      // but a contract violation here should not crash the camera
      // surface. Surface the calm failure line instead.
      recognition = const RecognitionFailure('recognize threw');
    }
    if (!mounted) return;
    final closest = await _fetchClosestMatches(recognition);
    if (!mounted) return;
    setState(() {
      _closestMatches = closest;
      _result = recognition;
      _state = _PhotoSurfaceState.ready;
    });
    _openMatchSheetIfReady();
  }

  /// How many closest matches the sheet offers at most.
  static const int _maxClosestMatches = 8;

  /// The "closest matches" row (F9: it used to search the literal
  /// `'closest'`, which matches nothing, so the row was always empty):
  ///   1. catalog matches for each food the rung recognised (a few each);
  ///   2. then the foods the user logged in the last week, newest first.
  /// Duplicates (same `DatabaseFood`) are dropped. Never throws; an error in
  /// either source just leaves that part out.
  Future<List<FoodMatch>> _fetchClosestMatches(
    RecognitionResult recognition,
  ) async {
    final out = <FoodMatch>[];
    final seen = <String>{};
    void add(FoodMatch m) {
      if (out.length >= _maxClosestMatches) return;
      if (seen.add(m.food.sourceRef)) out.add(m);
    }

    if (recognition is RecognizedPlate) {
      final catalog = ref.read(foodCatalogProvider);
      for (final rec in recognition.foods.take(3)) {
        try {
          final result = await catalog.search(
            rec.databaseFood.displayName,
            limit: 4,
          );
          if (result is RankedMatches) result.matches.forEach(add);
        } on Object catch (_) {
          // This source is unavailable; the others still count.
        }
      }
    }

    try {
      final today = ref.read(todayProvider);
      final recent = await ref
          .read(encryptedStoreProvider)
          .readRange(
            from: addCalendarDays(today, -7),
            to: startOfNextLocalDay(today),
          );
      if (recent is PlatesRead) {
        for (final plate in recent.plates) {
          for (final entry in plate.entries) {
            add(
              FoodMatch(
                food: entry.databaseFood,
                confidence: 0.3,
                presets: [entry.quantity],
              ),
            );
          }
        }
      }
    } on Object catch (_) {
      // No history to offer.
    }
    return out;
  }

  /// Open the match sheet when both the rung result and the
  /// closest-matches lookup are in hand. Idempotent — if either
  /// side is still pending, this is a no-op.
  void _openMatchSheetIfReady() {
    final result = _result;
    if (result == null) return;
    if (_state != _PhotoSurfaceState.ready) return;
    if (!mounted) return;
    // The sheet is modal; when it dismisses (Log commits + pops,
    // or user taps the scrim / back gesture) the screen stays on
    // the capture surface so the user can retake or back out via
    // the AppBar back arrow. We do NOT pop the screen on sheet
    // dismissal — that was the bug the multi-shot I/O matrix test
    // exposed.
    showRecognizedMatchSheet(
      context,
      result: result,
      closestMatches: _closestMatches,
    );
  }

  Future<void> _retake() async {
    setState(() {
      _state = _PhotoSurfaceState.idle;
      _result = null;
      _closestMatches = const [];
    });
    await _captureOnce();
  }

  Future<void> _typeInstead() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const ManualEntryScreen()));
    if (!mounted) return;
    unawaited(Navigator.of(context).maybePop());
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
          'Snap a plate',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        actions: [
          IconButton(
            tooltip: 'Type it manually',
            onPressed: _typeInstead,
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
    switch (_state) {
      case _PhotoSurfaceState.idle:
      case _PhotoSurfaceState.capturing:
        return _OpeningCamera(palette: palette);
      case _PhotoSurfaceState.resolving:
        return _ResolvingBody(palette: palette, onRetake: _retake);
      case _PhotoSurfaceState.ready:
        return _ReadyBody(
          palette: palette,
          result: _result,
          closestMatches: _closestMatches,
          onRetake: _retake,
          onTypeInstead: _typeInstead,
        );
      case _PhotoSurfaceState.denied:
        return _DeniedCalm(palette: palette, onTypeInstead: _typeInstead);
    }
  }
}

/// The body rendered while the OS camera UI is open. A calm "Aim
/// at your plate" hint with the retake / type-instead affordances.
class _OpeningCamera extends StatelessWidget {
  const _OpeningCamera({required this.palette});

  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ResolvingShimmer(),
        const SizedBox(height: AppSpacing.md),
        Text(
          'Aim at your plate, then tap the shutter.',
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
      ],
    );
  }
}

/// The body rendered while the rung is running. Renders the
/// `ResolvingShimmer` + a calm "Retake" affordance. The match
/// sheet is mounted as soon as the rung result lands (see
/// `_openMatchSheetIfReady`).
class _ResolvingBody extends StatelessWidget {
  const _ResolvingBody({required this.palette, required this.onRetake});

  final AppPalette palette;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ResolvingShimmer(),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onRetake,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              side: BorderSide(color: palette.hairline),
              foregroundColor: palette.ink,
            ),
            child: Text(
              'Retake',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
        ),
      ],
    );
  }
}

/// The body rendered while the match sheet is up. Keeps a small
/// "Retake" affordance so the user can retry without backing out
/// through the navigation stack.
class _ReadyBody extends StatelessWidget {
  const _ReadyBody({
    required this.palette,
    required this.result,
    required this.closestMatches,
    required this.onRetake,
    required this.onTypeInstead,
  });

  final AppPalette palette;
  final RecognitionResult? result;
  final List<FoodMatch> closestMatches;
  final VoidCallback onRetake;
  final VoidCallback onTypeInstead;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _summaryFor(result),
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onRetake,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              side: BorderSide(color: palette.hairline),
              foregroundColor: palette.ink,
            ),
            child: Text(
              'Retake',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
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

  String _summaryFor(RecognitionResult? result) {
    if (result == null) return 'Reading your plate…';
    return switch (result) {
      RecognizedPlate(:final foods) =>
        foods.isEmpty
            ? 'No foods matched — pick one below.'
            : 'Found ${foods.length} food${foods.length == 1 ? '' : 's'} on this plate.',
      NoMatch() => 'Nothing on this plate — pick one below.',
      QuotaExhausted() => enAiRungStrings.noticeShort,
      RecognitionFailure() =>
        "Search isn't available right now. Pick a closest match below.",
    };
  }
}

/// The body rendered when the user cancels or the OS denies the
/// camera permission. Calm copy + a tap-to-type affordance (NFR7).
class _DeniedCalm extends StatelessWidget {
  const _DeniedCalm({required this.palette, required this.onTypeInstead});

  final AppPalette palette;
  final VoidCallback onTypeInstead;

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
            onPressed: onTypeInstead,
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
