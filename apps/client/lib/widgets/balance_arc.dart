// 4-segment balance arc (UX-DR4) — Veg&Fruit / Protein / Starch / Dairy.
//
// A `CustomPainter` paints four short arcs (one quadrant each) on a
// hairline circular track. Filled segments are painted in the palette's
// sage accent; unfilled segments fall through to the `sageTrack` hairline.
// A mono "3 of 4" arcnote sits just below the arc.
//
// Screen-reader contract: the screen-reader announces the food groups,
// not the count — color is never the sole signal. The `Semantics` node
// wraps the painter with a label that lists the four groups, and each
// segment has its own Semantics node carrying its group name + filled
// state.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// The four food-group buckets the arc reports on. Declaration order is
/// the order the arc paints — top, right, bottom, left.
enum BalanceArcGroup {
  vegFruit,
  protein,
  starch,
  dairy;

  String get label => switch (this) {
        BalanceArcGroup.vegFruit => 'Veg & Fruit',
        BalanceArcGroup.protein => 'Protein',
        BalanceArcGroup.starch => 'Starch',
        BalanceArcGroup.dairy => 'Dairy',
      };
}

/// The 4-segment balance arc. Sized to fit a 48px row budget (~64px
/// tall including the arcnote) — small enough to live on a meal row,
/// large enough for the arcnote to be mono-readable.
class BalanceArc extends StatelessWidget {
  // Non-const constructor: the `assert(filled.length == ...)` guard
  // cannot be evaluated in a const expression under the standard
  // constructors-in-immutables lint. The widget is still immutable
  // (no mutable state); the lint is suppressed at the class level.
  // ignore: prefer_const_constructors_in_immutables
  BalanceArc({
    super.key,
    required this.filled,
    this.size = 48,
    this.announceFilled = true,
  })  : assert(size >= 24, 'size must be ≥ 24px for the arc to render'),
        assert(
          filled.length == BalanceArcGroup.values.length,
          '`filled` must carry one entry per food-group bucket',
        );

  /// One entry per `BalanceArcGroup`, in the same order. `true` paints
  /// the sage fill on that quadrant; `false` leaves it on the track.
  final List<bool> filled;

  /// The arc's outer diameter. The default `48` matches the touch-target
  /// floor (NFR7) while leaving room for the arcnote below.
  final double size;

  /// When `true`, the merged Semantics label announces "n of 4" filled.
  /// Tests pin this to `false` so the count assertion is stable regardless
  /// of which segments are filled.
  final bool announceFilled;

  @override
  Widget build(BuildContext context) {
    final palette = _palette(context);
    final filledCount = filled.where((b) => b).length;
    final groups = BalanceArcGroup.values;
    final groupLabels = groups.map((g) => g.label).join(', ');
    final filledSummary = announceFilled
        ? '$filledCount of ${groups.length} filled: $groupLabels'
        : groupLabels;

    return Semantics(
      container: true,
      label: 'Balance arc — $filledSummary',
      child: ExcludeSemantics(
        excluding: !announceFilled,
        child: SizedBox(
          width: size,
          height: size,
          child: Stack(
            children: [
              SizedBox(
                width: size,
                height: size,
                child: CustomPaint(
                  painter: _ArcPainter(
                    filled: filled,
                    track: palette.sageTrack,
                    fill: palette.sage,
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Text(
                  '$filledCount of ${groups.length}',
                  textAlign: TextAlign.center,
                  style: AppTypography.monoWhisper.copyWith(
                    color: palette.inkMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  AppPalette _palette(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
  }
}

class _ArcPainter extends CustomPainter {
  _ArcPainter({
    required this.filled,
    required this.track,
    required this.fill,
  });

  final List<bool> filled;
  final Color track;
  final Color fill;

  static const double _strokeWidth = 4;
  static const double _segmentGapFraction = 0.10;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 - _strokeWidth;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final trackPaint = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.butt;

    final fillPaint = Paint()
      ..color = fill
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.butt;

    // 4 quadrants starting at -π/2 (12 o'clock), going clockwise.
    // Each quadrant covers 90°; we leave a small gap between segments
    // so the eye reads them as discrete buckets.
    const startAngle = -math.pi / 2;
    const sweep = math.pi / 2;
    final gap = sweep * _segmentGapFraction;
    final drawSweep = sweep - gap;

    for (var i = 0; i < 4; i++) {
      final segStart = startAngle + (sweep * i) + (gap / 2);
      final paint = filled[i] ? fillPaint : trackPaint;
      canvas.drawArc(rect, segStart, drawSweep, false, paint);
    }
  }

  @override
  bool shouldRepaint(_ArcPainter old) {
    if (old.track != track || old.fill != fill) return true;
    for (var i = 0; i < filled.length; i++) {
      if (old.filled[i] != filled[i]) return true;
    }
    return false;
  }
}
