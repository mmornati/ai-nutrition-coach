// Convenience access to the generated localizations (AD-7).
//
// `context.l10n` resolves the delegate installed by `AiNutritionCoachApp`; when a
// widget is pumped under a bare `MaterialApp` (most widget tests) there is no
// delegate, and it falls back to the English strings so the same widgets work
// there unchanged.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../state/day_board_provider.dart' show MealSlot;
import 'app_localizations.dart';
import 'app_localizations_en.dart';

export 'app_localizations.dart';

final AppLocalizations _fallback = AppLocalizationsEn();

/// Tests that pump a widget under a bare `MaterialApp` (no delegates) set this
/// (see `test/flutter_test_config.dart`); everything else must install
/// `AppLocalizations.localizationsDelegates`, and a debug build asserts if it
/// did not. In release the English fallback is used rather than crashing.
bool debugAllowMissingL10n = false;

extension AppL10n on BuildContext {
  AppLocalizations get l10n {
    final found = Localizations.of<AppLocalizations>(this, AppLocalizations);
    if (found != null) return found;
    assert(
      debugAllowMissingL10n,
      'AppLocalizations.delegate is not installed above this widget: add '
      'AppLocalizations.localizationsDelegates to the MaterialApp.',
    );
    return _fallback;
  }

  /// The active locale as an intl tag (`en_US`, `fr`, ...).
  String get localeTag => Localizations.localeOf(this).toString();

  /// The full weekday name of [date] in the active locale.
  String weekdayName(DateTime date) => DateFormat.EEEE(localeTag).format(date);

  /// A clock time of [localTime] in the active locale's 24h `HH:mm` form.
  String clockTime(DateTime localTime) =>
      DateFormat.Hm(localeTag).format(localTime);
}

extension AppL10nLabels on AppLocalizations {
  String slotLabel(MealSlot slot) => switch (slot) {
    MealSlot.breakfast => slotBreakfast,
    MealSlot.lunch => slotLunch,
    MealSlot.dinner => slotDinner,
    MealSlot.late => slotLate,
  };

  String foodGroupLabel(FoodGroup group) => switch (group) {
    FoodGroup.vegFruit => foodGroupVegFruit,
    FoodGroup.protein => foodGroupProtein,
    FoodGroup.starch => foodGroupStarch,
    FoodGroup.dairy => foodGroupDairy,
    FoodGroup.other => foodGroupOther,
  };
}
