// Minimal "Log a plate" screen — proves the convergent write path.
//
// One form: dish name + quantity preset + `Log` button. Below the form,
// a `recentPlatesProvider`-driven list shows the day's plates. The
// full Day Board (with status chips, week strip, capture sheet) lands
// with Story 1.3 / 1.6 — this surface is intentionally just enough to
// prove `RecordPlate` commits before any UI sees it.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';

class LogPlateScreen extends ConsumerStatefulWidget {
  const LogPlateScreen({super.key});

  @override
  ConsumerState<LogPlateScreen> createState() => _LogPlateScreenState();
}

class _LogPlateScreenState extends ConsumerState<LogPlateScreen> {
  final _dishController = TextEditingController();
  QuantityPreset _quantity = QuantityPreset.medium;
  bool _submitting = false;

  @override
  void dispose() {
    _dishController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final dish = _dishController.text.trim();
    if (dish.isEmpty) return;
    setState(() => _submitting = true);
    final draft = FoodEntryDraft(
      databaseFood: DatabaseFood(
        sourceRef: 'manual:${dish.toLowerCase()}',
        displayName: dish,
        source: SourceCatalog.manual,
      ),
      quantity: _quantity.range(unit: 'serving'),
    );
    final result = await ref.read(recordPlateProvider)(
      entries: [draft],
      store: ref.read(encryptedStoreProvider),
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (result is RecordPlateSuccess) {
      _dishController.clear();
    }
    final message = switch (result) {
      RecordPlateSuccess() => 'Plate logged.',
      StoreFailure(platformError: UnsupportedPlatformFailure()) =>
        'Mobile-only in v1.',
      StoreFailure(encryptedStoreError: SecureKeyFailure()) =>
        "History can't open on this device.",
      StoreFailure() => 'Could not log plate.',
    };
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final plates = ref.watch(recentPlatesProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Log a plate',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'What did you just eat?',
              style: AppTypography.coach.copyWith(color: palette.inkMuted),
            ),
            const SizedBox(height: AppSpacing.lg),
            TextField(
              controller: _dishController,
              style: AppTypography.ui.copyWith(color: palette.ink),
              decoration: InputDecoration(
                labelText: 'Dish',
                labelStyle: AppTypography.uiMuted.copyWith(
                  color: palette.inkMuted,
                ),
                enabledBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: palette.hairline),
                ),
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpacing.lg),
            Wrap(
              spacing: AppSpacing.sm,
              children: [
                for (final preset in QuantityPreset.values)
                  ChoiceChip(
                    label: Text(preset.label),
                    selected: _quantity == preset,
                    onSelected: (_) => setState(() => _quantity = preset),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
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
            const SizedBox(height: AppSpacing.xl),
            Text(
              'Recent plates',
              style: AppTypography.uiMuted.copyWith(color: palette.inkMuted),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: _RecentList(palette: palette, plates: plates),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentList extends StatelessWidget {
  const _RecentList({required this.palette, required this.plates});

  final AppPalette palette;
  final AsyncValue<List<PlateLog>> plates;

  @override
  Widget build(BuildContext context) {
    return plates.when(
      loading: () => Text(
        'reading…',
        style: AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
      ),
      error: (e, _) => Text(
        "history can't open on this device",
        style: AppTypography.coach.copyWith(color: palette.coach),
      ),
      data: (list) {
        if (list.isEmpty) {
          return Text(
            'An open, quiet place.',
            style: AppTypography.coach.copyWith(color: palette.inkMuted),
          );
        }
        return ListView.separated(
          itemCount: list.length,
          separatorBuilder: (_, _) =>
              Divider(color: palette.hairline, height: AppSpacing.hairline),
          itemBuilder: (_, i) => _RecentRow(palette: palette, plate: list[i]),
        );
      },
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.palette, required this.plate});

  final AppPalette palette;
  final PlateLog plate;

  @override
  Widget build(BuildContext context) {
    final first = plate.entries.isEmpty ? null : plate.entries.first;
    final dish = first?.databaseFood.displayName ?? '—';
    final range = first?.quantity.displayLabel ?? '';
    final more = plate.entries.length > 1
        ? ' +${plate.entries.length - 1}'
        : '';
    final time = _localTime(plate.loggedAtUtc);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Text(
            time,
            style: AppTypography.mono.copyWith(color: palette.inkMuted),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              '$dish$more',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
          Text(
            range,
            style: AppTypography.mono.copyWith(color: palette.inkMuted),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            '· local',
            style: AppTypography.monoWhisper.copyWith(
              color: palette.statusLocal,
            ),
          ),
        ],
      ),
    );
  }
}

String _localTime(DateTime utc) {
  final local = utc.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}

enum QuantityPreset {
  small('~1 small serving', low: 0.5, high: 1),
  medium('~1 serving', low: 1, high: 1),
  large('~1 large serving', low: 1, high: 2);

  const QuantityPreset(this.label, {required this.low, required this.high});

  final String label;
  final num low;
  final num high;

  QuantityRange range({required String unit}) =>
      QuantityRange(low: low, high: high, unit: unit, displayLabel: label);
}
