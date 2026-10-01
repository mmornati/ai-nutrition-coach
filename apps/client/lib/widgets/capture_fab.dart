// The floating `+` capture affordance (Story 1.6 / UX-DR7 / NFR7).
//
// A circular `+` button anchored at the bottom-right of the Day
// Board. ≥48px hit target, sage-deep fill, no shadow (matches the
// design system's "no card-elevated feel" rule). Tapping the FAB
// opens the `CaptureSheet` via the three callbacks the caller wires
// (the FAB itself does no lookups or routing — AD-3).

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import 'capture_sheet.dart';

class CaptureFab extends StatelessWidget {
  const CaptureFab({
    super.key,
    required this.onSnapshot,
    required this.onScan,
    required this.onTypeOrTalk,
  });

  /// Pushed when the Snapshot tile is tapped. Routes to the
  /// placeholder photo screen until Story 1.8 ships the real flow.
  final VoidCallback onSnapshot;

  /// Pushed when the Scan tile is tapped. Routes to the placeholder
  /// barcode screen until Story 1.7 ships the real flow.
  final VoidCallback onScan;

  /// Pushed when the Type or talk tile is tapped. Routes to the
  /// `ManualEntryScreen` shipped by Story 1.5.
  final VoidCallback onTypeOrTalk;

  /// Outer diameter — 56px so the visible circle sits comfortably
  /// inside the 48px minimum hit target while leaving enough material
  /// for the `+` icon to read as a button.
  static const double _diameter = 56;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    return Semantics(
      button: true,
      label: 'Open capture sheet',
      child: Material(
        color: palette.sageDeep,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => showCaptureSheet(
            context,
            onSnapshot: onSnapshot,
            onScan: onScan,
            onTypeOrTalk: onTypeOrTalk,
          ),
          child: SizedBox(
            width: _diameter,
            height: _diameter,
            child: Center(
              child: Icon(Icons.add, color: palette.background, size: 28),
            ),
          ),
        ),
      ),
    );
  }
}
