// `RecognizedMatchSheet` — Story 1.8 / FR1.
//
// Modal bottom sheet that surfaces the photo path's resolved foods
// + closest-matches + manual-add fallback. Three affordances:
//
//   * A header card listing the rung's recognized foods (with
//     confidence + quantity preset). Tapping a row swaps the
//     selection to that food.
//   * A "closest matches" row — the same `FoodMatch` shape the
//     manual-entry screen uses; tapping a row swaps the selection
//     to that food and seeds the preset row.
//   * A manual-add field + "Log custom food" + a primary `Log`
//     button — a `DatabaseFood` built from whatever the user types
//     when nothing in the catalog fits.
//
// The `Log` button is gated on `_submitting` (NFR7 + AD-3). The
// commit goes through `RecordPlate` (the convergent mutation path)
// and writes `DateTime.now()` into `lastLogProvider` so the Day
// Board's quick-repeat affordance surfaces (UX-DR7 / UX-DR10).
//
// Why a sheet and not a full screen: the photo path is
// capture → resolve → confirm; the recognition can produce zero,
// one, or several foods, so the surface has to flex. A sheet keeps
// the camera preview behind it for the retake path (cancel +
// retry) without a full route push — the calm UX the spec calls
// for.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/last_log_provider.dart';
import '../state/log_plate.dart';
import '../theme/app_tokens.dart';
import '../l10n/l10n.dart';

/// Show the recognized match sheet. The future completes when the
/// sheet is dismissed (back gesture, tap outside, scrim swipe-down).
/// The `Log` action commits through `RecordPlate` *before* popping;
/// the sheet does not surface a commit failure — the Day Board's
/// quick-repeat affordance mirrors the [lastLogProvider] write so a
/// successful commit always surfaces.
Future<void> showRecognizedMatchSheet(
  BuildContext context, {
  required RecognitionResult result,
  required List<FoodMatch> closestMatches,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (sheetCtx) =>
        RecognizedMatchSheet(result: result, closestMatches: closestMatches),
  );
}

/// A pre-selected food + quantity combination the user has confirmed
/// in the sheet. Drives the `FoodEntryDraft` the `Log` button
/// commits.
class _SheetSelection {
  const _SheetSelection({required this.food, required this.quantity});

  final DatabaseFood food;
  final QuantityRange quantity;
}

/// Internal: the sheet's mutable state — current selection, manual
/// name, and the submit-in-flight flag. Lives on the widget's
/// `State` so it survives sheet rebuilds.
class RecognizedMatchSheet extends ConsumerStatefulWidget {
  const RecognizedMatchSheet({
    super.key,
    required this.result,
    required this.closestMatches,
  });

  /// The recognition result from `AiRung.recognize`. The sheet
  /// pattern-matches on this to choose the header copy:
  ///   * `RecognizedPlate(foods: [...])` — show the foods + closest
  ///     matches + manual.
  ///   * `RecognizedPlate(foods: [])` — show "Nothing matched" + the
  ///     closest matches + manual (the v1 `NoopAiRung` lands here).
  ///   * `NoMatch` — same surface as empty `RecognizedPlate` but
  ///     with the "nothing on this plate" calm copy.
  ///   * `RecognitionFailure` — show the calm failure line + closest
  ///     matches + manual; the log never fails.
  final RecognitionResult result;

  /// Ranked matches from `FoodCatalog.search('')`. Empty when the
  /// catalog returned `NotFoundFailure` (the manual-add field still
  /// works in that case).
  final List<FoodMatch> closestMatches;

  @override
  ConsumerState<RecognizedMatchSheet> createState() =>
      _RecognizedMatchSheetState();
}

class _RecognizedMatchSheetState extends ConsumerState<RecognizedMatchSheet> {
  _SheetSelection? _selected;
  List<QuantityRange> _presets = const [];
  late final TextEditingController _manualController;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _manualController = TextEditingController();
    // Default to the first recognized food's `quantity` when the
    // rung returned at least one item; otherwise wait for the user
    // to pick a closest match or type a manual name.
    final result = widget.result;
    if (result is RecognizedPlate && result.foods.isNotEmpty) {
      final first = result.foods.first;
      _selected = _SheetSelection(
        food: first.databaseFood,
        quantity: first.quantity,
      );
      _presets = [first.quantity];
    } else if (widget.closestMatches.isNotEmpty) {
      final first = widget.closestMatches.first;
      _selected = _SheetSelection(
        food: first.food,
        quantity: first.presets.isNotEmpty ? first.presets.first : kOneServing,
      );
      _presets = _presetsFor(first);
    }
  }

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  /// Build the preset list for the currently-selected food.
  /// Combines the rung's suggested quantity (when applicable) with
  /// the catalog's curated presets for the same food, deduplicated.
  /// Falls back to a single `~1 serving` placeholder when neither
  /// side has curated presets (e.g. a recognized food that the
  /// catalog has not yet enriched).
  List<QuantityRange> _presetsFor(FoodMatch? match) {
    final result = widget.result;
    QuantityRange? rungQuantity;
    if (result is RecognizedPlate && match != null && result.foods.isNotEmpty) {
      for (final rec in result.foods) {
        if (rec.databaseFood == match.food) {
          rungQuantity = rec.quantity;
          break;
        }
      }
    }
    final List<QuantityRange> out = [];
    if (rungQuantity != null) out.add(rungQuantity);
    if (match != null) {
      for (final preset in match.presets) {
        if (!out.contains(preset)) out.add(preset);
      }
    }
    if (out.isEmpty) {
      out.add(kOneServing);
    }
    return out;
  }

  void _selectRecognized(RecognizedFood rec) {
    setState(() {
      _selected = _SheetSelection(
        food: rec.databaseFood,
        quantity: rec.quantity,
      );
      _presets = _presetsFor(null);
      _presets = [rec.quantity, ..._presets.where((p) => p != rec.quantity)];
      // Try to enrich with the closest match's catalog presets if
      // one matches the recognized food.
      for (final match in widget.closestMatches) {
        if (match.food == rec.databaseFood) {
          _presets = _presetsFor(match);
          break;
        }
      }
    });
  }

  void _selectClosestMatch(FoodMatch match) {
    setState(() {
      _selected = _SheetSelection(
        food: match.food,
        quantity: match.presets.isNotEmpty ? match.presets.first : kOneServing,
      );
      _presets = _presetsFor(match);
    });
  }

  void _selectPreset(QuantityRange preset) {
    final current = _selected;
    if (current == null) return;
    setState(() {
      _selected = _SheetSelection(food: current.food, quantity: preset);
    });
  }

  Future<void> _onLog() async {
    if (_submitting) return;
    final selection = _selected;
    if (selection == null) {
      _showSnack(context.l10n.pickFoodFirst);
      return;
    }
    await _commit(
      FoodEntryDraft(
        databaseFood: selection.food,
        quantity: selection.quantity,
      ),
    );
  }

  Future<void> _onLogManual() async {
    if (_submitting) return;
    final name = _manualController.text.trim();
    if (name.isEmpty) {
      _showSnack(context.l10n.typeNameFirst);
      return;
    }
    final committed = await _commit(
      FoodEntryDraft(databaseFood: manualFood(name), quantity: kOneServing),
    );
    if (committed) _manualController.clear();
  }

  /// Commit one entry; `true` when the plate was logged (the sheet then
  /// closes). The busy flag is reset in `finally` so a throwing store call
  /// can never leave the sheet stuck on "Logging…" (F7).
  Future<bool> _commit(FoodEntryDraft draft) async {
    setState(() => _submitting = true);
    final RecordPlateResult result;
    try {
      result = await commitPlate(ref, [draft]);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
    if (!mounted) return false;

    if (result is RecordPlateSuccess) {
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      Navigator.of(context).pop();
      return true;
    }
    if (result is StoreFailure) {
      _showSnack(logFailureMessage(context.l10n, result));
    }
    return false;
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

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
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Header(palette: palette, result: widget.result),
                const SizedBox(height: AppSpacing.md),
                if (widget.result case RecognizedPlate(
                  :final foods,
                ) when foods.isNotEmpty)
                  _RecognizedList(
                    foods: foods,
                    palette: palette,
                    selected: _selected,
                    onPick: _selectRecognized,
                  ),
                if (widget.closestMatches.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  _ClosestMatchesRow(
                    matches: widget.closestMatches,
                    palette: palette,
                    selected: _selected,
                    onPick: _selectClosestMatch,
                  ),
                ],
                if (_selected case final selected?) ...[
                  const SizedBox(height: AppSpacing.md),
                  _PresetRow(
                    presets: _presets,
                    chosen: selected.quantity,
                    palette: palette,
                    onPick: _selectPreset,
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                _ManualAddField(
                  controller: _manualController,
                  palette: palette,
                ),
                const SizedBox(height: AppSpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: _submitting ? null : _onLogManual,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(AppTouchTargets.min),
                      side: BorderSide(color: palette.hairline),
                      foregroundColor: palette.ink,
                    ),
                    child: Text(
                      _submitting
                          ? context.l10n.logging
                          : context.l10n.logCustomFood,
                      style: AppTypography.ui.copyWith(color: palette.ink),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: (_selected == null || _submitting)
                        ? null
                        : _onLog,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(AppTouchTargets.min),
                      backgroundColor: palette.sageDeep,
                    ),
                    child: Text(
                      _submitting
                          ? context.l10n.logging
                          : context.l10n.logAction,
                      style: AppTypography.ui.copyWith(
                        color: palette.background,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Header copy for the recognized-match sheet. Varies per
/// `RecognitionResult` variant so the user sees the right calm
/// message; the manual-add path is always available below.
class _Header extends StatelessWidget {
  const _Header({required this.palette, required this.result});

  final AppPalette palette;
  final RecognitionResult result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final String title;
    final String subtitle;
    switch (result) {
      case RecognizedPlate(:final foods):
        if (foods.isEmpty) {
          title = l10n.recognizedNothingMatched;
          subtitle = l10n.recognizedPickOrType;
        } else {
          title = l10n.recognizedLooksLike(foods.length);
          subtitle = l10n.recognizedTapToConfirm;
        }
      case NoMatch():
        title = l10n.recognizedNothingOnPlate;
        subtitle = l10n.recognizedPickOrType;
      case QuotaExhausted():
        title = enAiRungStrings.noticeShort;
        subtitle = enAiRungStrings.manualFallbackHint;
      case RecognitionFailure():
        title = l10n.searchUnavailable;
        subtitle = l10n.recognizedPickOrTypeFallback;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title, style: AppTypography.ui.copyWith(color: palette.ink)),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
      ],
    );
  }
}

/// Recognized-food list — one row per `RecognizedFood` from the
/// rung, with the confidence + quantity shown.
class _RecognizedList extends StatelessWidget {
  const _RecognizedList({
    required this.foods,
    required this.palette,
    required this.selected,
    required this.onPick,
  });

  final List<RecognizedFood> foods;
  final AppPalette palette;
  final _SheetSelection? selected;
  final ValueChanged<RecognizedFood> onPick;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final food in foods)
          _RecognizedRow(
            food: food,
            palette: palette,
            isSelected: selected?.food == food.databaseFood,
            onTap: () => onPick(food),
          ),
      ],
    );
  }
}

/// One row of the recognized-food list. ≥48px hit target (NFR7).
class _RecognizedRow extends StatelessWidget {
  const _RecognizedRow({
    required this.food,
    required this.palette,
    required this.isSelected,
    required this.onTap,
  });

  final RecognizedFood food;
  final AppPalette palette;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: isSelected,
      label: context.l10n.recognizedSemantics(
        food.databaseFood.displayName,
        context.l10n.foodGroupLabel(food.databaseFood.foodGroup),
        food.quantity.displayLabel,
        food.confidence.toStringAsFixed(2),
      ),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.sm,
              horizontal: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        food.databaseFood.displayName,
                        style: AppTypography.ui.copyWith(
                          color: isSelected ? palette.sageDeep : palette.ink,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        context.l10n.recognizedDetail(
                          context.l10n.foodGroupLabel(
                            food.databaseFood.foodGroup,
                          ),
                          food.quantity.displayLabel,
                          (food.confidence * 100).toStringAsFixed(0),
                        ),
                        style: AppTypography.monoWhisper.copyWith(
                          color: palette.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  Icon(Icons.check, color: palette.sageDeep, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Closest-matches row — surfaces the catalog's `FoodMatch`es
/// ranked against an empty query so the user can pick what the rung
/// missed. Mirrors the manual-entry screen's match list.
class _ClosestMatchesRow extends StatelessWidget {
  const _ClosestMatchesRow({
    required this.matches,
    required this.palette,
    required this.selected,
    required this.onPick,
  });

  final List<FoodMatch> matches;
  final AppPalette palette;
  final _SheetSelection? selected;
  final ValueChanged<FoodMatch> onPick;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          context.l10n.closestMatches,
          style: AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.xs),
        for (final match in matches)
          _ClosestMatchRow(
            match: match,
            palette: palette,
            isSelected: selected?.food == match.food,
            onTap: () => onPick(match),
          ),
      ],
    );
  }
}

/// One row of the closest-matches list. ≥48px hit target (NFR7).
class _ClosestMatchRow extends StatelessWidget {
  const _ClosestMatchRow({
    required this.match,
    required this.palette,
    required this.isSelected,
    required this.onTap,
  });

  final FoodMatch match;
  final AppPalette palette;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: isSelected,
      label: context.l10n.matchSemantics(
        match.food.displayName,
        context.l10n.foodGroupLabel(match.food.foodGroup),
        match.presets.length,
      ),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.sm,
              horizontal: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        match.food.displayName,
                        style: AppTypography.ui.copyWith(
                          color: isSelected ? palette.sageDeep : palette.ink,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        context.l10n.foodGroupLabel(match.food.foodGroup),
                        style: AppTypography.monoWhisper.copyWith(
                          color: palette.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  Icon(Icons.check, color: palette.sageDeep, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Quantity preset row for the currently-selected food. Mirrors
/// the manual-entry pattern; ≥48px hit target (NFR7).
class _PresetRow extends StatelessWidget {
  const _PresetRow({
    required this.presets,
    required this.chosen,
    required this.palette,
    required this.onPick,
  });

  final List<QuantityRange> presets;
  final QuantityRange chosen;
  final AppPalette palette;
  final ValueChanged<QuantityRange> onPick;

  @override
  Widget build(BuildContext context) {
    if (presets.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        for (final preset in presets)
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
            child: ChoiceChip(
              label: Text(
                preset.displayLabel,
                style: AppTypography.mono.copyWith(
                  color: chosen == preset ? palette.background : palette.ink,
                ),
              ),
              selected: chosen == preset,
              selectedColor: palette.sageDeep,
              backgroundColor: palette.surface,
              materialTapTargetSize: MaterialTapTargetSize.padded,
              onSelected: (_) => onPick(preset),
            ),
          ),
      ],
    );
  }
}

/// Manual-add text field. Used both by the user typing a custom
/// name and by the `Log custom food` button (NFR7 — separate button
/// from the main `Log` so the two affordances stay distinct).
class _ManualAddField extends StatelessWidget {
  const _ManualAddField({required this.controller, required this.palette});

  final TextEditingController controller;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: AppTypography.ui.copyWith(color: palette.ink),
      decoration: InputDecoration(
        labelText: context.l10n.customFoodName,
        labelStyle: AppTypography.uiMuted.copyWith(color: palette.inkMuted),
        enabledBorder: UnderlineInputBorder(
          borderSide: BorderSide(color: palette.hairline),
        ),
        focusedBorder: UnderlineInputBorder(
          borderSide: BorderSide(color: palette.sage),
        ),
      ),
      textInputAction: TextInputAction.done,
    );
  }
}
