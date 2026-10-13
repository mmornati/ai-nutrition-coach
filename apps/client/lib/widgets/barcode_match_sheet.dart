// `BarcodeMatchSheet` — Story 1.7 / FR2.
//
// Modal bottom sheet that surfaces a barcode-resolved `FoodMatch`
// from the `FoodCatalog.lookupByBarcode` port. Three affordances:
//   * Food name + group label (read-only).
//   * Quantity preset chips — re-uses the manual-entry pattern
//     (`ChoiceChip` with `minHeight: 48px` to satisfy NFR7). The
//     first preset is the default; tapping a chip swaps the chosen
//     preset.
//   * `Log` button — commits the resolved food + chosen preset
//     through `RecordPlate` (AD-3), writes `DateTime.now()` into
//     `lastLogProvider` so the Day Board's quick-repeat affordance
//     surfaces, and pops back to the Day Board.
//
// No countdown, no spinner, no "did you mean to log faster?"
// pressure copy. UX-DR10 / FR15.
//
// Why a sheet and not a full screen: the camera path is "scan
// → pick quantity → log"; one barcode resolves to one food, so the
// confirmation surface is small and ephemeral. A full route push
// would feel like a modal-on-modal layered with the capture sheet.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/last_log_provider.dart';
import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';

/// Show the match sheet. Returns the future the caller awaits; the
/// future completes when the sheet is dismissed (back gesture, tap
/// outside, scrim swipe-down). The `Log` action commits through
/// `RecordPlate` *before* popping — the sheet does not surface a
/// commit failure, the Day Board's quick-repeat affordance mirrors
/// the [lastLogProvider] write so a successful commit always
/// surfaces.
Future<void> showBarcodeMatchSheet(
  BuildContext context, {
  required FoodMatch match,
  required List<QuantityRange> presets,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (sheetCtx) => BarcodeMatchSheet(match: match, presets: presets),
  );
}

class BarcodeMatchSheet extends ConsumerStatefulWidget {
  const BarcodeMatchSheet({
    super.key,
    required this.match,
    required this.presets,
  });

  final FoodMatch match;
  final List<QuantityRange> presets;

  @override
  ConsumerState<BarcodeMatchSheet> createState() => _BarcodeMatchSheetState();
}

class _BarcodeMatchSheetState extends ConsumerState<BarcodeMatchSheet> {
  late QuantityRange _chosen;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // Default to the first preset (or a single-serving shim when
    // OFF ships no curated presets — barcode-resolved foods always
    // fall back to `~1 serving`).
    _chosen = widget.presets.isNotEmpty
        ? widget.presets.first
        : const QuantityRange(
            low: 1,
            high: 1,
            unit: 'serving',
            displayLabel: '~1 serving',
          );
  }

  Future<void> _onLog() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    final recordPlate = ref.read(recordPlateProvider);
    final store = ref.read(encryptedStoreProvider);
    final result = await recordPlate(
      entries: [
        FoodEntryDraft(databaseFood: widget.match.food, quantity: _chosen),
      ],
      store: store,
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (result is RecordPlateSuccess) {
      // Mirror the manual-entry path: stamp `lastLogProvider` so
      // the Day Board's quick-repeat affordance surfaces.
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      Navigator.of(context).pop();
    } else if (result is StoreFailure) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(_messageFor(result))));
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
              _FoodHeader(match: widget.match, palette: palette),
              const SizedBox(height: AppSpacing.md),
              _PresetRow(
                presets: widget.presets,
                chosen: _chosen,
                palette: palette,
                onPick: (preset) {
                  setState(() => _chosen = preset);
                },
              ),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _submitting ? null : _onLog,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(AppTouchTargets.min),
                    backgroundColor: palette.sageDeep,
                  ),
                  child: Text(
                    _submitting ? 'Logging…' : 'Log',
                    style: AppTypography.ui.copyWith(color: palette.background),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FoodHeader extends StatelessWidget {
  const _FoodHeader({required this.match, required this.palette});

  final FoodMatch match;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          match.food.displayName,
          style: AppTypography.ui.copyWith(color: palette.ink),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          match.food.foodGroup.label,
          style: AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
        ),
      ],
    );
  }
}

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
    // OFF doesn't ship curated presets for barcode products — the
    // sheet always offers a single "1 serving" placeholder so the
    // Log button stays enabled. The chip row reads naturally even
    // with one option.
    final shown = presets.isNotEmpty
        ? presets
        : <QuantityRange>[
            const QuantityRange(
              low: 1,
              high: 1,
              unit: 'serving',
              displayLabel: '~1 serving',
            ),
          ];
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        for (final preset in shown)
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
