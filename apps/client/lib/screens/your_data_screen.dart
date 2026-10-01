// Settings → Your data sub-screen (Story 4.1 shell + 4.2 export
// affordance, AD-8 / FR-9 / AD-9 / NFR10).
//
// The sub-screen is one calm list under Settings; the static
// content Story 4.1 ships is the AD-8 honest-copy anchor — the
// protection posture line that says "session-sealed, not at-rest
// encrypted" on web. Story 4.2 adds the export affordance
// (format + scope + export pill); Story 4.3 will add the sync
// status surface below the export section.
//
// AD-7: copy is keyed in `YourDataStrings` (in the integrations
// `coach_strings.dart`); never interpolated, named NDP reviewer
// signs off. The single value (`enYourDataStrings`) is the
// canonical, calm, non-judgmental copy.
//
// The screen is web-aware: on `kIsWeb` it reads the
// `webSessionKeyProvider`'s `isOpen` to render the locked /
// unlocked posture. On io the line is the unlocked posture (the
// mobile store is ChaCha20-Poly1305 at rest with its key in the
// Keychain/Keystore — Story 1.2 / AD-8, cipher pinned in Phase 2A).
//
// Phase 2A / D8: the screen also carries the "Erase all local data"
// action, behind a confirmation dialog. (This screen is not reachable
// from navigation yet — Phase 5 wires Settings; the action lives here
// so it is ready when the route lands.)
//
// The export affordance is a quiet two-segment row: format (CSV
// / JSON) + scope (today / this week / all history) + a single
// "Export" pill. The pill is debounced while a previous export
// is in flight (UX-DR10). On completion the screen renders a
// single calm line "exported: <file>" with the file name in
// mono. No card, no celebration. The export is a read-only
// copy; the source is untouched (AD-9 / FR-9 / UX-DR9).

import 'dart:convert';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/erase_provider.dart';
import '../state/exporter_provider.dart';
import '../state/platform_provider.dart';
import '../state/web_session_key_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/erase_local_data_dialog.dart';

class YourDataScreen extends ConsumerStatefulWidget {
  const YourDataScreen({super.key, this.copy = enYourDataStrings});

  final YourDataStrings copy;

  @override
  ConsumerState<YourDataScreen> createState() => _YourDataScreenState();
}

class _YourDataScreenState extends ConsumerState<YourDataScreen> {
  ExportFormat _format = ExportFormat.csv;
  ExportScope _scope = const ExportScope.allHistory();
  bool _busy = false;
  String? _lastFile;
  String? _lastError;
  bool _erasing = false;
  String? _eraseMessage;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final locked =
        ref.watch(isWebProvider) && !ref.watch(webSessionKeyProvider).isOpen;
    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(
          widget.copy.title,
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: ListView(
            children: [
              Text(
                locked
                    ? widget.copy.lockedProtection
                    : widget.copy.unlockedProtection,
                style: AppTypography.coach.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              const Divider(height: AppSpacing.hairline),
              const SizedBox(height: AppSpacing.lg),
              if (!locked) _exportSection(palette, widget.copy),
              // Story 4.3 — sync status surface lands here.
              const SizedBox(height: AppSpacing.lg),
              const Divider(height: AppSpacing.hairline),
              const SizedBox(height: AppSpacing.lg),
              _eraseSection(palette, widget.copy),
            ],
          ),
        ),
      ),
    );
  }

  /// The "Erase all local data" affordance (Phase 2A / D8): a label, one
  /// calm explanatory sentence, and a single quiet pill that opens the
  /// confirmation dialog.
  Widget _eraseSection(AppPalette palette, YourDataStrings copy) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          copy.eraseLabel,
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          copy.eraseExplain,
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: AppTouchTargets.min,
          child: OutlinedButton(
            onPressed: _erasing ? null : _runErase,
            child: Text(copy.eraseButton),
          ),
        ),
        if (_eraseMessage != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            _eraseMessage!,
            style: AppTypography.coach.copyWith(color: palette.inkMuted),
          ),
        ],
      ],
    );
  }

  Future<void> _runErase() async {
    if (_erasing) return;
    final result = await confirmAndEraseLocalData(
      context: context,
      copy: widget.copy,
      erase: () {
        setState(() => _erasing = true);
        return ref.read(eraseLocalDataProvider)();
      },
    );
    if (!mounted) return;
    setState(() {
      _erasing = false;
      _eraseMessage = switch (result) {
        null => null,
        EraseLocalDataSuccess() => widget.copy.eraseDone,
        EraseLocalDataFailure() => widget.copy.eraseFailed,
      };
    });
    if (result is EraseLocalDataSuccess) {
      // First-run state: rebuild the app on a fresh store (review 8).
      ref.read(appRestartProvider)();
    }
  }

  /// The export affordance. Two rows (format / scope) of two
  /// quiet pills each + a single "Export" pill below. The
  /// `_busy` flag is set while the export is in flight; the
  /// pill is disabled so a second tap cannot open a second
  /// stream (UX-DR10).
  Widget _exportSection(AppPalette palette, YourDataStrings copy) {
    final exportCopy = enExportStrings;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          exportCopy.formatLabel,
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.xs),
        _pillRow(
          palette: palette,
          options: const [
            ('csv', ExportFormat.csv),
            ('json', ExportFormat.json),
          ],
          labels: const {ExportFormat.csv: 'CSV', ExportFormat.json: 'JSON'},
          selected: _format,
          onSelect: (v) => setState(() => _format = v),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          exportCopy.scopeLabel,
          style: AppTypography.coach.copyWith(color: palette.inkMuted),
        ),
        const SizedBox(height: AppSpacing.xs),
        _scopeRow(palette, exportCopy),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: AppTouchTargets.min,
          child: OutlinedButton(
            onPressed: _busy ? null : _runExport,
            child: Text(exportCopy.exportButton),
          ),
        ),
        if (_lastFile != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${exportCopy.exportedLine}$_lastFile',
            style: AppTypography.mono.copyWith(color: palette.inkMuted),
          ),
        ],
        if (_lastError != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            _lastError!,
            style: AppTypography.coach.copyWith(color: palette.inkMuted),
          ),
        ],
      ],
    );
  }

  /// The scope row. Each pill toggles `_scope`; the export
  /// resolves the scope at run time so the affordance is
  /// reversible.
  Widget _scopeRow(AppPalette palette, ExportStrings copy) {
    final scopes = <ExportScope>[
      ExportScope.visibleDay(DateTime.now()),
      ExportScope.week(DateTime.now()),
      const ExportScope.allHistory(),
    ];
    return Wrap(
      spacing: AppSpacing.xs,
      children: [
        for (final s in scopes)
          _pill(
            palette: palette,
            label: _scopeLabel(s, copy),
            selected: _sameScope(s, _scope),
            onTap: () => setState(() => _scope = s),
          ),
      ],
    );
  }

  /// Compare two scopes by variant. The sealed subtypes are
  /// private; comparing `runtimeType` is the public surface the
  /// sealed class exposes (Dart 3 sealed-class identity).
  bool _sameScope(ExportScope a, ExportScope b) {
    return a.runtimeType == b.runtimeType;
  }

  /// Resolve a label for each `ExportScope` variant. The
  /// sealed subtypes are private; the `when` method carries the
  /// variant's payload.
  String _scopeLabel(ExportScope s, ExportStrings copy) {
    return s.when(
      visibleDay: (_) => copy.scopeToday,
      week: (_) => copy.scopeWeek,
      allHistory: () => copy.scopeAll,
    );
  }

  /// A two-pill row used by the format row. Each pill toggles
  /// the value; the `selected` value matches the current
  /// `_format`.
  Widget _pillRow<T>({
    required AppPalette palette,
    required List<(String, T)> options,
    required Map<T, String> labels,
    required T selected,
    required ValueChanged<T> onSelect,
  }) {
    return Wrap(
      spacing: AppSpacing.xs,
      children: [
        for (final opt in options)
          _pill(
            palette: palette,
            label: labels[opt.$2] ?? opt.$1,
            selected: opt.$2 == selected,
            onTap: () => onSelect(opt.$2),
          ),
      ],
    );
  }

  Widget _pill({
    required AppPalette palette,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(
          minHeight: AppTouchTargets.min,
          minWidth: 64,
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected ? palette.sage : palette.hairline,
              width: 1,
            ),
            borderRadius: BorderRadius.circular(0),
          ),
          child: Center(
            child: Text(
              label,
              style: AppTypography.ui.copyWith(
                color: selected ? palette.sage : palette.ink,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Run the export. Reads the `ExportReady` from the
  /// `exportTaskProvider`, serializes the plate list to the
  /// selected format, and writes the bytes to the
  /// platform-selected destination. The `_busy` flag debounces
  /// a second tap; `_lastFile` / `_lastError` surface the
  /// outcome as a single calm line.
  Future<void> _runExport() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _lastError = null;
    });
    try {
      final result = await ref.read(
        exportTaskProvider((format: _format, scope: _scope)).future,
      );
      switch (result) {
        case ExportReady(:final plates):
          final dest = ref.read(exportDestinationProvider);
          final bytes = switch (_format) {
            ExportFormat.csv => Uint8List.fromList(
              utf8.encode(serializePlatesToCsv(plates)),
            ),
            ExportFormat.json => Uint8List.fromList(
              utf8.encode(serializePlatesToJson(plates)),
            ),
          };
          final filename = exportFilename(
            localDay: DateTime.now(),
            format: _format,
          );
          await dest.write(
            filename: filename,
            mimeType: _format == ExportFormat.csv
                ? 'text/csv'
                : 'application/json',
            bytes: bytes,
          );
          if (!mounted) return;
          setState(() => _lastFile = filename);
        case ExportFailure():
          if (!mounted) return;
          setState(() => _lastError = enExportStrings.failedLine);
      }
    } on Object {
      if (!mounted) return;
      setState(() => _lastError = enExportStrings.failedLine);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
