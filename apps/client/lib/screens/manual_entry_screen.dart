// Manual-entry screen (Story 1.5 / FR3 / UX-DR11).
//
// Three affordances on one surface:
//   1. Text field — typed (or transcribed) query flows into the
//      `FoodCatalog` port via `manualEntryProvider`; ranked matches
//      render below.
//   2. Quantity preset row — chip-style row of honest ranges (`~1
//      fist`, `~2 cups`); the first preset on the selected match is
//      the default.
//   3. Log button — commits the selected match + chosen preset through
//      the convergent `RecordPlate` use-case (AD-3), then pops back to
//      the Day Board.
//
// The mic button always shows the calm "Voice not available in v1 —
// type instead" quiet copy on tap (FR3 / FR13). No audio is captured;
// the seam is wired through `voiceTranscriberProvider` so a future
// `speech_to_text`-backed adapter drops in behind the same provider.
//
// No-match path: when the catalog returns `NotFoundFailure` (or an
// empty result for a non-empty query), the ranked list disappears and
// a small manual-add form appears — a text field + Log button that
// commits a `DatabaseFood(displayName, source: manual)` so the user
// can still record the plate (FR3).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/last_log_provider.dart';
import '../state/manual_entry_provider.dart';
import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';

class ManualEntryScreen extends ConsumerStatefulWidget {
  const ManualEntryScreen({super.key, this.prefilledBarcode});

  /// Optional barcode that the screen should pre-populate. Used by
  /// the barcode path (Story 1.7) to hand the scanned code over
  /// when OFF couldn't resolve it — the user types the food name
  /// while the barcode is already in the field as the source ref.
  final String? prefilledBarcode;

  @override
  ConsumerState<ManualEntryScreen> createState() => _ManualEntryScreenState();
}

class _ManualEntryScreenState extends ConsumerState<ManualEntryScreen> {
  late final TextEditingController _queryController;
  final TextEditingController _manualController = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController();
    final prefilled = widget.prefilledBarcode;
    if (prefilled != null && prefilled.isNotEmpty) {
      // Patch M3: when the barcode path hands us a scanned code,
      // seed BOTH the visible search field AND the provider state
      // so the user lands on a screen where the barcode is already
      // typed into the search bar (not the custom-name field which
      // only renders AFTER the user types a query and gets zero
      // matches). The provider update is deferred to post-frame so
      // the initial build completes first.
      _queryController.text = prefilled;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(manualEntryProvider.notifier).updateQuery(prefilled);
      });
      // Pre-fill the manual-add controller too so the "Custom food
      // name" field has the barcode pre-loaded when the user reaches
      // the no-match form (FR3 fallback — the user can either commit
      // it verbatim or replace it with a human-readable name).
      _manualController.text = prefilled;
    }
  }

  @override
  void dispose() {
    _queryController.dispose();
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _onLogSelected() async {
    final entry = ref.read(manualEntryProvider);
    final selected = entry.selected;
    final preset = entry.chosenPreset;
    if (selected == null || preset == null) {
      _showSnack('Pick a quantity');
      return;
    }

    setState(() => _submitting = true);
    final result = await _commit([
      FoodEntryDraft(databaseFood: selected.food, quantity: preset),
    ]);
    if (!mounted) return;
    setState(() => _submitting = false);

    if (result is RecordPlateSuccess) {
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      ref.read(manualEntryProvider.notifier).clear();
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
    final result = await _commit([
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
    ]);
    if (!mounted) return;
    setState(() => _submitting = false);

    if (result is RecordPlateSuccess) {
      ref.read(lastLogProvider.notifier).state = DateTime.now();
      _manualController.clear();
      ref.read(manualEntryProvider.notifier).clear();
      Navigator.of(context).pop();
    } else if (result is StoreFailure) {
      _showSnack(_messageFor(result));
    }
  }

  Future<RecordPlateResult> _commit(List<FoodEntryDraft> entries) async {
    final recordPlate = ref.read(recordPlateProvider);
    final store = ref.read(encryptedStoreProvider);
    return recordPlate(entries: entries, store: store);
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

  void _onMicTap() {
    // FR3 / FR13: voice is transcription-only — never a voice-print.
    // The v1 adapter is a no-op (`NoopVoiceTranscriber`); the screen
    // surfaces the calm copy instead of capturing audio.
    _showSnack('Voice not available in v1 — type instead');
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final state = ref.watch(manualEntryProvider);

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Add a food',
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _QueryField(
                controller: _queryController,
                palette: palette,
                onChanged: (q) => ref
                    .read(manualEntryProvider.notifier)
                    .updateQuery(q),
                onMicTap: _onMicTap,
              ),
              const SizedBox(height: AppSpacing.md),
              if (state.lastError != null)
                _CalmLine(
                  text: state.lastError!,
                  palette: palette,
                  accent: palette.coach,
                ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: _Body(
                  state: state,
                  palette: palette,
                  manualController: _manualController,
                  onSelectMatch: (m) => ref
                      .read(manualEntryProvider.notifier)
                      .selectMatch(m),
                  onLogManual: _onLogManual,
                  submitting: _submitting,
                ),
              ),
              if (state.selected != null)
                _PresetRow(
                  state: state,
                  palette: palette,
                  onPick: (preset) => ref
                      .read(manualEntryProvider.notifier)
                      .selectPreset(preset),
                ),
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: state.selected != null && !_submitting
                      ? _onLogSelected
                      : null,
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

class _QueryField extends StatelessWidget {
  const _QueryField({
    required this.controller,
    required this.palette,
    required this.onChanged,
    required this.onMicTap,
  });

  final TextEditingController controller;
  final AppPalette palette;
  final ValueChanged<String> onChanged;
  final VoidCallback onMicTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Semantics(
            textField: true,
            label: 'Food search',
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: AppTypography.ui.copyWith(color: palette.ink),
              decoration: InputDecoration(
                labelText: 'Food search',
                labelStyle:
                    AppTypography.uiMuted.copyWith(color: palette.inkMuted),
                enabledBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: palette.hairline),
                ),
                focusedBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: palette.sage),
                ),
              ),
              textInputAction: TextInputAction.search,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Semantics(
          button: true,
          label: 'Voice not available in v1 — tap to see quiet copy',
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onMicTap,
            child: SizedBox(
              width: AppTouchTargets.min,
              height: AppTouchTargets.min,
              child: Center(
                child: Icon(
                  Icons.mic_none,
                  size: 24,
                  color: palette.inkMuted,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.state,
    required this.palette,
    required this.manualController,
    required this.onSelectMatch,
    required this.onLogManual,
    required this.submitting,
  });

  final ManualEntryState state;
  final AppPalette palette;
  final TextEditingController manualController;
  final ValueChanged<FoodMatch> onSelectMatch;
  final VoidCallback onLogManual;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    if (state.matches.isNotEmpty) {
      return _MatchList(
        state: state,
        palette: palette,
        onSelectMatch: onSelectMatch,
      );
    }
    if (state.query.trim().isEmpty) {
      return _Hint(
        text: 'Type a food name. We will rank the matches for you.',
        palette: palette,
      );
    }
    if (state.catalogStatus == ManualEntryCatalogStatus.notFound ||
        state.catalogStatus == ManualEntryCatalogStatus.catalogFailure) {
      return _ManualAddForm(
        controller: manualController,
        palette: palette,
        onLog: onLogManual,
        submitting: submitting,
      );
    }
    return const SizedBox.shrink();
  }
}

class _MatchList extends StatelessWidget {
  const _MatchList({
    required this.state,
    required this.palette,
    required this.onSelectMatch,
  });

  final ManualEntryState state;
  final AppPalette palette;
  final ValueChanged<FoodMatch> onSelectMatch;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      itemCount: state.matches.length,
      separatorBuilder: (_, _) => Divider(
        color: palette.hairline,
        height: AppSpacing.hairline,
      ),
      itemBuilder: (_, i) {
        final match = state.matches[i];
        final isSelected = state.selected == match;
        return _MatchRow(
          match: match,
          palette: palette,
          selected: isSelected,
          onTap: () => onSelectMatch(match),
        );
      },
    );
  }
}

class _MatchRow extends StatelessWidget {
  const _MatchRow({
    required this.match,
    required this.palette,
    required this.selected,
    required this.onTap,
  });

  final FoodMatch match;
  final AppPalette palette;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
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
                          color: selected ? palette.sageDeep : palette.ink,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        match.food.foodGroup.label,
                        style: AppTypography.monoWhisper.copyWith(
                          color: palette.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (selected)
                  Icon(
                    Icons.check,
                    color: palette.sageDeep,
                    size: 18,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PresetRow extends StatelessWidget {
  const _PresetRow({
    required this.state,
    required this.palette,
    required this.onPick,
  });

  final ManualEntryState state;
  final AppPalette palette;
  final ValueChanged<QuantityRange> onPick;

  @override
  Widget build(BuildContext context) {
    final presets = state.selected?.presets ?? const <QuantityRange>[];
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
                  color: state.chosenPreset == preset
                      ? palette.background
                      : palette.ink,
                ),
              ),
              selected: state.chosenPreset == preset,
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

class _ManualAddForm extends StatelessWidget {
  const _ManualAddForm({
    required this.controller,
    required this.palette,
    required this.onLog,
    required this.submitting,
  });

  final TextEditingController controller;
  final AppPalette palette;
  final VoidCallback onLog;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _Hint(
          text: 'Type the food name to add it manually.',
          palette: palette,
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
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
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: submitting ? null : onLog,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppTouchTargets.min),
              side: BorderSide(color: palette.hairline),
              foregroundColor: palette.ink,
            ),
            child: Text(
              submitting ? 'Logging…' : 'Log custom food',
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
        ),
      ],
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text, required this.palette});
  final String text;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.coach.copyWith(color: palette.inkMuted),
    );
  }
}

class _CalmLine extends StatelessWidget {
  const _CalmLine({
    required this.text,
    required this.palette,
    required this.accent,
  });
  final String text;
  final AppPalette palette;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.coach.copyWith(color: accent),
    );
  }
}
