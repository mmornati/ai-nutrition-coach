// The capture fan-out modal sheet (Story 1.6 / UX-DR7).
//
// One modal bottom sheet surfaces three entry tiles the user can
// thumb-reach into:
//
//   * Snapshot        → dominant sage-deep tile, 96px tall (Story 1.8)
//   * Scan a barcode  → subtile, 56px tall (Story 1.7)
//   * Type or talk    → subtile, 56px tall (Story 1.5, already shipped)
//
// The sheet is a UI shell — it does no lookups or mutations itself
// (AD-1 / AD-3). Each tile takes a `VoidCallback`; the wiring lives at
// the call site (the Day Board) so the sheet never imports the domain
// ports. Tile taps pop the sheet and then invoke the callback, so the
// caller can push a route against a stable navigator stack.
//
// Reduced-motion: the standard Material modal-bottom-sheet transition
// has no overshoot, so `showModalBottomSheet` already satisfies
// "slides without bounce" (NFR8). No custom transition is needed here.
//
// No countdown, no spinner, no "did you mean to log faster?" pressure
// copy, no Tip Jar / monetization surface (UX-DR9 / UX-DR10 / FR15).

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Show the capture sheet. Returns when the sheet is closed by any
/// path: a tile tap, scrim tap, swipe-down, or back gesture.
Future<void> showCaptureSheet(
  BuildContext context, {
  required VoidCallback onSnapshot,
  required VoidCallback onScan,
  required VoidCallback onTypeOrTalk,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (sheetCtx) => CaptureSheet(
      onSnapshot: () {
        Navigator.of(sheetCtx).pop();
        onSnapshot();
      },
      onScan: () {
        Navigator.of(sheetCtx).pop();
        onScan();
      },
      onTypeOrTalk: () {
        Navigator.of(sheetCtx).pop();
        onTypeOrTalk();
      },
    ),
  );
}

class CaptureSheet extends StatelessWidget {
  const CaptureSheet({
    super.key,
    required this.onSnapshot,
    required this.onScan,
    required this.onTypeOrTalk,
  });

  final VoidCallback onSnapshot;
  final VoidCallback onScan;
  final VoidCallback onTypeOrTalk;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    return Material(
      color: palette.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.lg)),
      ),
      clipBehavior: Clip.antiAlias,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SnapshotTile(onTap: onSnapshot, palette: palette),
              const SizedBox(height: AppSpacing.sm),
              _Subtile(
                label: 'Scan a barcode',
                onTap: onScan,
                palette: palette,
              ),
              const SizedBox(height: AppSpacing.sm),
              _Subtile(
                label: 'Type or talk',
                onTap: onTypeOrTalk,
                palette: palette,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The dominant Snapshot tile — sage-deep fill, taller than the
/// subtiles, with a small mono whisper so the tile reads as "this is
/// the big action". The icon is decorative (camera_alt_outlined);
/// color is never the sole signal — the text label is also present.
class _SnapshotTile extends StatelessWidget {
  const _SnapshotTile({required this.onTap, required this.palette});

  final VoidCallback onTap;
  final AppPalette palette;

  static const double _height = 96;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: _height),
      child: Material(
        color: palette.sageDeep,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Semantics(
            button: true,
            label: 'Snapshot — photograph a plate',
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.camera_alt_outlined,
                    color: palette.background,
                    size: 28,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Snapshot',
                          style: AppTypography.ui.copyWith(
                            color: palette.background,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          'photo · coming soon',
                          style: AppTypography.monoWhisper.copyWith(
                            color: palette.background.withValues(alpha: 0.85),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A subtile — surface fill with a hairline border, shorter than the
/// Snapshot tile, with a chevron trailing edge that suggests
/// "tap to open" without shouting about it.
class _Subtile extends StatelessWidget {
  const _Subtile({
    required this.label,
    required this.onTap,
    required this.palette,
  });

  final String label;
  final VoidCallback onTap;
  final AppPalette palette;

  static const double _height = 56;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: _height),
      child: Material(
        color: palette.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          side: BorderSide(color: palette.hairline),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Semantics(
            button: true,
            label: label,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: AppTypography.ui.copyWith(color: palette.ink),
                    ),
                  ),
                  Icon(Icons.chevron_right, color: palette.inkMuted, size: 20),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
