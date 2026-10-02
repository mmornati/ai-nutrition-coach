// The app's `ThemeData`, built from the design tokens (`app_tokens.dart`).
//
// Lives apart from `main.dart` so the accessibility guideline tests pump the
// screens under the exact theme production uses.

import 'package:flutter/material.dart';

import 'app_tokens.dart';

ThemeData buildAppTheme(Brightness brightness) {
  final palette = brightness == Brightness.dark
      ? AppPalette.dark
      : AppPalette.light;
  return ThemeData(
    brightness: brightness,
    scaffoldBackgroundColor: palette.background,
    colorScheme: ColorScheme.fromSeed(
      seedColor: palette.sage,
      brightness: brightness,
    ),
    textTheme: const TextTheme(
      bodyMedium: AppTypography.ui,
      bodySmall: AppTypography.uiMuted,
      labelSmall: AppTypography.mono,
    ),
  );
}
