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

import '../state/last_log_provider.dart';
import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';

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
    builder: (sheetCtx) => RecognizedMatchSheet(
      result: result,
      closestMatches: closestMatches,
    ),
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
        quantity: first.presets.isNotEmpty
            ? first.presets.first
            : const QuantityRange(
                low: 1,
                high: 1,
                unit: 'serving',
                displayLabel: '~1 serving',
              ),
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
    if (result is RecognizedPlate &&
        match != null &&
        result.foods.isNotEmpty) {
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
      out.add(
        const QuantityRange(
          low: 1,
          high: 1,
          unit: 'serving',
          displayLabel: '~1 serving',
        ),
      );
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
      _presets = [
        rec.quantity,
        ..._presets.where((p) => p != rec.quantity),
      ];
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
        quantity: match.presets.isNotEmpty
            ? match.presets.first
            : const QuantityRange(
                low: 1,
                high: 1,
                unit: 'serving',
                displayLabel: '~1 serving',
              ),
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
    final selection = _selected;
    if (selection == null) {
      _showSnack('Pick a food first');
      return;
    }
    setState(() => _submitting = true);

    final recordPlate = ref.read(recordPlateProvider);
    final store = ref.read(encryptedStoreProvider);
    final result = await recordPlate(
      entries: [
        FoodEntryDraft(
          databaseFood: selection.food,
          quantity: selection.quantity,
        ),
      ],
      store: store,
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (result is RecordPlateSuccess) {
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      Navigator.of(context).pop();
    } else if (result is StoreFailure) {
      _showSnack(_messageFor(result));
    }
  }

  Future<void> _onLogManual() async {
    final name = _manualController.text.trim();
    if (name.isEmpty) {
      _showSnack('Type a name first');
      return;
    }
    setState(() => _submitting = true);

    final recordPlate = ref.read(recordPlateProvider);
    final store = ref.read(encryptedStoreProvider);
    final result = await recordPlate(
      entries: [
        FoodEntryDraft(
          databaseFood: DatabaseFood(
            sourceRef: 'manual:${name.toLowerCase()}',
            displayName: name,
            source: SourceCatalog.manual,
            foodGroup: FoodGroup.other,
          ),
          quantity: const QuantityRange(
            low: 1,
            high: 1,
            unit: 'serving',
            displayLabel: '~1 serving',
          ),
        ),
      ],
      store: store,
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (result is RecordPlateSuccess) {
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      _manualController.clear();
      Navigator.of(context).pop();
    } else if (result is StoreFailure) {
      _showSnack(_messageFor(result));
    }
  }

  String _messageFor(StoreFailure failure) {
    return switch (failure) {
      StoreFailure(platformError: UnsupportedPlatformFailure()) =>
        'Mobile-only in v1.',
      StoreFailure(encryptedStoreError: SecureKeyFailure()) =>
        "History can't open on this device.",
      StoreFailure() => 'Could not log plate.',
    };
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
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(AppRadii.lg)),
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
                if (widget.result is RecognizedPlate &&
                    (widget.result as RecognizedPlate).foods.isNotEmpty)
                  _RecognizedList(
                    foods: (widget.result as RecognizedPlate).foods,
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
                if (_selected != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  _PresetRow(
                    presets: _presets,
                    chosen: _selected!.quantity,
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
                      minimumSize:
                          const Size.fromHeight(AppTouchTargets.min),
                      side: BorderSide(color: palette.hairline),
                      foregroundColor: palette.ink,
                    ),
                    child: Text(
                      _submitting ? 'Logging…' : 'Log custom food',
                      style:
                          AppTypography.ui.copyWith(color: palette.ink),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed:
                        (_selected == null || _submitting) ? null : _onLog,
                    style: FilledButton.styleFrom(
                      minimumSize:
                          const Size.fromHeight(AppTouchTargets.min),
                      backgroundColor: palette.sageDeep,
                    ),
                    child: Text(
                      _submitting ? 'Logging…' : 'Log',
                      style: AppTypography.ui
                          .copyWith(color: palette.background),
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
    final String title;
    final String subtitle;
    switch (result) {
      case RecognizedPlate(:final foods):
        if (foods.isEmpty) {
          title = 'Nothing matched';
          subtitle = 'Pick a closest match or type the food manually.';
        } else {
          title = 'Looks like ${foods.length} food${foods.length == 1 ? '' : 's'}';
          subtitle = 'Tap one to confirm, or pick another match.';
        }
      case NoMatch():
        title = 'Nothing on this plate';
        subtitle = 'Pick a closest match or type the food manually.';
      case RecognitionFailure():
        title = "Search isn't available right now.";
        subtitle = 'You can still pick a closest match or type it manually.';
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style:
              AppTypography.coach.copyWith(color: palette.inkMuted),
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
      label:
          '${food.databaseFood.displayName}, ${food.databaseFood.foodGroup.label}, '
          '${food.quantity.displayLabel}, confidence ${food.confidence.toStringAsFixed(2)}',
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
                        '${food.databaseFood.foodGroup.label}  '
                        '· ${food.quantity.displayLabel}  '
                        '· ${(food.confidence * 100).toStringAsFixed(0)}%',
                        style: AppTypography.monoWhisper
                            .copyWith(color: palette.inkMuted),
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
          'Closest matches',
          style:
              AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
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
      label:
          '${match.food.displayName}, ${match.food.foodGroup.label}, '
          '${match.presets.length} presets',
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
                        match.food.foodGroup.label,
                        style: AppTypography.monoWhisper
                            .copyWith(color: palette.inkMuted),
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
            constraints:
                const BoxConstraints(minHeight: AppTouchTargets.min),
            child: ChoiceChip(
              label: Text(
                preset.displayLabel,
                style: AppTypography.mono.copyWith(
                  color: chosen == preset
                      ? palette.background
                      : palette.ink,
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
        labelText: 'Custom food name',
        labelStyle:
            AppTypography.uiMuted.copyWith(color: palette.inkMuted),
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
