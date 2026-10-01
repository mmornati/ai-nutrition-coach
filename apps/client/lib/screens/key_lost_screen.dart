// The calm "your history can't be opened" surface (Phase 2A / D7 / D8).
//
// Shown instead of the Day Board for ANY startup failure (review 2): a
// lost key (`enKeyLostStrings`) or any other reason the protected store
// could not be opened (`enStoreOpenFailedStrings`). The first case: the
// encrypted database exists on
// this device but its key is gone (restored backup, keystore reset,
// device migration). Nothing can read that data and silently minting a
// new key would only hide the problem, so the one way forward is the
// explicit, confirmed "Erase local data and start over".
//
// AD-7: copy keyed in `KeyLostStrings` / `YourDataStrings`. FR-15:
// factual, never blaming, no pressure.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/erase_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/erase_local_data_dialog.dart';

class KeyLostScreen extends ConsumerStatefulWidget {
  const KeyLostScreen({
    super.key,
    this.copy = enKeyLostStrings,
    this.dataCopy = enYourDataStrings,
  });

  final KeyLostStrings copy;
  final YourDataStrings dataCopy;

  @override
  ConsumerState<KeyLostScreen> createState() => _KeyLostScreenState();
}

class _KeyLostScreenState extends ConsumerState<KeyLostScreen> {
  bool _busy = false;
  String? _message;

  Future<void> _erase() async {
    if (_busy) return;
    final result = await confirmAndEraseLocalData(
      context: context,
      copy: widget.dataCopy,
      erase: () {
        setState(() => _busy = true);
        return ref.read(eraseLocalDataProvider)();
      },
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _message = switch (result) {
        null => null,
        EraseLocalDataSuccess() => widget.dataCopy.eraseDone,
        EraseLocalDataFailure() => widget.dataCopy.eraseFailed,
      };
    });
    if (result is EraseLocalDataSuccess) {
      // First-run state: rebuild the app on a fresh store (review 8).
      ref.read(appRestartProvider)();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Semantics(
                header: true,
                child: Text(
                  widget.copy.title,
                  style: AppTypography.ui.copyWith(color: palette.ink),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                widget.copy.body,
                style: AppTypography.coach.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                height: AppTouchTargets.min,
                child: OutlinedButton(
                  onPressed: _busy ? null : _erase,
                  child: Text(widget.copy.action),
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  _message!,
                  style: AppTypography.coach.copyWith(color: palette.inkMuted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
