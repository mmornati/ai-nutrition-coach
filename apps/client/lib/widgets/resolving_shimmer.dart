// `ResolvingShimmer` — Story 1.8 / UX-DR10 / FR15 / NFR8.
//
// The photo path's "resolving" surface — between capture and the
// recognition result. Three rules baked in:
//
//   * No spinner, no countdown, no urgency (UX-DR10 / FR15).
//   * Inline shimmer only — the user never gets a "did the app
//     freeze?" moment because the visual stays calm.
//   * Reduced-motion = fade only (NFR8). When `MediaQuery.disableAnimationsOf`
//     is true, the shimmer stops sweeping and the surface fades
//     gently into place.
//
// The shimmer is a thin sage sweep across the matched-food card
// silhouette + a mono "reading…" arcnote below (UX-DR10 — mono for
// status, arcnotes; never humanist sans). The widget is
// self-contained so the screen and the match sheet can both render
// it without dragging a parent style in.

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../l10n/l10n.dart';

/// Quiet inline shimmer + mono "reading…" arcnote.
///
/// Renders:
///   * a fixed-aspect shimmer block (the food card silhouette),
///   * a mono "reading…" arcnote beneath it.
///
/// Reduced-motion (NFR8) collapses the shimmer to a fade-only
/// transition — the block fades in once and stays static. The
/// arcnote still renders so the user knows the path is resolving;
/// we never surface a spinner or countdown (FR15).
class ResolvingShimmer extends StatefulWidget {
  const ResolvingShimmer({super.key});

  @override
  State<ResolvingShimmer> createState() => _ResolvingShimmerState();
}

class _ResolvingShimmerState extends State<ResolvingShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      // 1.6s is the calm cadence — slow enough that the sweep
      // reads as "thinking", fast enough that the user does not
      // feel the surface is stalled. Reduced-motion overrides this
      // to a static block; see `build`.
      duration: const Duration(milliseconds: 1600),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    // Flutter 3.44's `MediaQueryData` does not yet expose
    // `disableAnimationsOf` — fall back to the broader
    // `disableAnimations` flag (NFR8 reduced-motion collapses the
    // shimmer to a static block; the arcnote still renders so the
    // user knows the path is resolving).
    final reducedMotion = MediaQuery.of(context).disableAnimations;

    if (reducedMotion) {
      // NFR8: reduced-motion collapses the shimmer to a static
      // block + the arcnote. The block uses the surface tone so it
      // reads as "something is here" without any sweep.
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _ShimmerBlock(palette: palette, opacity: 1.0),
          const SizedBox(height: AppSpacing.sm),
          Text(
            context.l10n.resolvingReading,
            style: AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
          ),
        ],
      );
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _ShimmerBlock(
              palette: palette,
              opacity: 0.6 + 0.4 * _controller.value,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              context.l10n.resolvingReading,
              style: AppTypography.monoWhisper.copyWith(
                color: palette.inkMuted,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The shimmer silhouette — a fixed-aspect card-shaped block that
/// the shimmer sweep travels across. Width is `double.infinity`
/// (matches the surrounding card / list rows); height is the
/// matched-food card's typical aspect ratio so the user reads it
/// as "the food row is loading".
class _ShimmerBlock extends StatelessWidget {
  const _ShimmerBlock({required this.palette, required this.opacity});

  final AppPalette palette;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: SizedBox(
        width: double.infinity,
        height: AppSpacing.xxl + AppSpacing.lg,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.surface.withValues(alpha: opacity),
          ),
        ),
      ),
    );
  }
}
