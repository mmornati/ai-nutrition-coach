// ───────────────────────────────────────────────────────────────────────────
// AI Nutrition Coach design tokens — Sage & Cream, light + dark.
//
// This is the shared token source for the UI layer. Tokens live here (and
// only here) so that no widget hard-codes a color, spacing step, radius, or
// font voice. A thin `ThemeData` adapter in `app_theme.dart` reads these and
// hands them to MaterialApp — story 1.3 will land that adapter.
//
// Design rules baked in:
//   * One sage accent (UX-DR1). No second accent.
//   * No red-as-guilt (FR15). Errors / warnings use neutral muted amber.
//   * 4px spacing scale (UX-DR2). Every gap is a multiple of 4.
//   * Typography voices are role-bound:
//       - humanist sans → all UI text
//       - serif italic  → the coach whisper
//       - mono          → quantities, status, arcnotes
//     No role crossover (epic-1-context.md § UX).
//
// Dark mode ships in v1 (NFR8). Both palettes live below; switch by handing
// `AppPalette.light` or `AppPalette.dark` to the theme adapter.
// ───────────────────────────────────────────────────────────────────────────

import 'package:flutter/painting.dart';

/// 4px spacing scale (UX-DR2).
class AppSpacing {
  AppSpacing._();

  static const double xxs = 2; // hairline-adjacent
  static const double xs = 4; // base step
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Hairline rule used to divide plate rows on the Day Board.
  static const double hairline = 1;
}

/// Corner radii. AI Nutrition Coach avoids pillowy fills; corners stay quiet.
class AppRadii {
  AppRadii._();

  static const double none = 0;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double pill = 999;
}

/// Sage & Cream palette — light variant.
///
/// Cream backgrounds, deep ink text, one sage accent. No red. The "warning"
/// tone is a muted amber so the UI never reads as guilt-driven.
class AppPalette {
  static const AppPalette light = AppPalette._light();
  static const AppPalette dark = AppPalette._dark();

  /// Background cream — warm, low-contrast, paper-like.
  final Color background;

  /// Surface one step off background — subtle dent, never a card.
  final Color surface;

  /// Primary ink for body text and icons.
  final Color ink;

  /// Secondary ink — captions, sub-labels.
  final Color inkMuted;

  /// Hairline rule divider (Day Board row separators, week-strip track).
  final Color hairline;

  /// The one sage accent (UX-DR1).
  final Color sage;

  /// Deep sage used for the dominant Snapshot tile in the capture sheet.
  final Color sageDeep;

  /// Quiet tonal sage tint for the balance-arc track and balanced-day dots.
  final Color sageTrack;

  /// Coach whisper — a warm muted amber, never red (FR15).
  final Color coach;

  /// Status chip base state in this epic: `· local`. Tiny mono, low contrast.
  final Color statusLocal;

  /// Status chip `· synced` state — sage-tint wash (UX-DR6). The
  /// sync whisper flips `· syncing → · synced` with this colour.
  final Color statusSynced;

  const AppPalette._light()
    : background = const Color(0xFFFBF7EE),
      surface = const Color(0xFFF3ECDD),
      ink = const Color(0xFF1F2421),
      inkMuted = const Color(0xFF5C5F55),
      hairline = const Color(0xFFE2DBC6),
      sage = const Color(0xFF6B8E5A),
      sageDeep = const Color(0xFF3F5A36),
      sageTrack = const Color(0xFFD7E1C9),
      coach = const Color(0xFF8A5A14),
      statusLocal = const Color(0xFF62645A),
      statusSynced = const Color(0xFF4F6F3F);

  const AppPalette._dark()
    : background = const Color(0xFF161A18),
      surface = const Color(0xFF1F2421),
      ink = const Color(0xFFEDE7D6),
      inkMuted = const Color(0xFF9AA197),
      hairline = const Color(0xFF2C332E),
      sage = const Color(0xFF9DBE8A),
      sageDeep = const Color(0xFFB7CFA8),
      sageTrack = const Color(0xFF33402C),
      coach = const Color(0xFFD8A35A),
      statusLocal = const Color(0xFF8E9588),
      statusSynced = const Color(0xFF9DBE8A);
}

/// Typography voices. Role-bound; do not cross (epic-1-context.md § UX).
///
/// At scaffold time these are the system defaults — humanist sans
/// (platform default), serif italic (system serif italic), and the platform
/// monospace face. Story 1.3 swaps these for the licensed families while
/// preserving the role mapping.
class AppTypography {
  AppTypography._();

  static const TextStyle ui = TextStyle(
    fontFamily: 'sans-serif',
    fontSize: 16,
    height: 1.35,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle uiMuted = TextStyle(
    fontFamily: 'sans-serif',
    fontSize: 14,
    height: 1.35,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle coach = TextStyle(
    fontFamily: 'serif',
    fontStyle: FontStyle.italic,
    fontSize: 15,
    height: 1.4,
    fontWeight: FontWeight.w400,
  );

  /// Mono is reserved for quantities, status chips, and arcnotes.
  static const TextStyle mono = TextStyle(
    fontFamily: 'monospace',
    fontSize: 13,
    height: 1.3,
    fontWeight: FontWeight.w500,
  );

  static const TextStyle monoWhisper = TextStyle(
    fontFamily: 'monospace',
    fontSize: 12,
    height: 1.3,
    fontWeight: FontWeight.w400,
  );
}

/// Touch target floor (UX: accessibility). Every tappable surface hits at
/// least 48px on its short axis.
class AppTouchTargets {
  AppTouchTargets._();
  static const double min = 48;
}
