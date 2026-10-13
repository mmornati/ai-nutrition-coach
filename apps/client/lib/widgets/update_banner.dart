// The calm "A new version is ready" line (ADR-0003, docs/pwa.md).
//
// Shown only when the service worker has installed a new version in the
// background and it is waiting. One quiet line with two plain actions:
// "Reload" (activates the new version; the page reloads once the browser
// confirms it is in control) and "Later" (dismisses the line for this visit).
// No badge, no count, no modal, no repeat: the NDP standard
// (docs/no-dark-patterns-standard.md).
//
// Honest about the one consequence: reloading locks the encrypted store, so
// the passphrase is asked for again. The line says so.
//
// The signal is injected (`appUpdateProvider`), so the widget is tested with
// a `ManualAppUpdateSignal` instead of a real service worker.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/l10n.dart';
import '../state/pwa_provider.dart';
import '../theme/app_tokens.dart';

/// Wraps [child] and, while an update is waiting and not dismissed, puts the
/// banner above it.
class UpdateBanner extends ConsumerStatefulWidget {
  const UpdateBanner({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<UpdateBanner> createState() => _UpdateBannerState();
}

class _UpdateBannerState extends ConsumerState<UpdateBanner> {
  bool _dismissed = false;
  bool _applying = false;
  Timer? _reenable;

  @override
  void dispose() {
    _reenable?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signal = ref.watch(appUpdateProvider);
    return ValueListenableBuilder<bool>(
      valueListenable: signal.updateReady,
      child: widget.child,
      builder: (context, ready, child) {
        if (!ready || _dismissed) return child!;
        final palette = Theme.of(context).brightness == Brightness.dark
            ? AppPalette.dark
            : AppPalette.light;
        final l10n = context.l10n;
        // The app (the Navigator) comes FIRST in the child list and the column
        // is laid out upwards, so the banner is still drawn on top of the page
        // but is AFTER the Navigator in semantic order. A Navigator route
        // blocks the semantics of the siblings that precede it
        // (`BlockSemantics`), so the other order made the banner invisible to
        // screen readers (found by the browser smoke).
        return Column(
          verticalDirection: VerticalDirection.up,
          children: [
            Expanded(
              // The banner already covers the top safe area.
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: child!,
              ),
            ),
            Material(
              color: palette.surface,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.xs,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            l10n.updateReadyMessage,
                            style: AppTypography.uiMuted.copyWith(
                              color: palette.ink,
                            ),
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _applying
                            ? null
                            : () {
                                setState(() => _applying = true);
                                // A second tap while the reload is under way
                                // does nothing; but the button is never left
                                // disabled for good (a worker that never takes
                                // over must not make it a dead end).
                                _reenable?.cancel();
                                _reenable = Timer(
                                  const Duration(seconds: 12),
                                  () {
                                    if (mounted) {
                                      setState(() => _applying = false);
                                    }
                                  },
                                );
                                unawaited(signal.applyUpdate());
                              },
                        style: TextButton.styleFrom(
                          minimumSize: const Size(
                            AppTouchTargets.min,
                            AppTouchTargets.min,
                          ),
                          foregroundColor: palette.sageDeep,
                        ),
                        child: Text(l10n.updateReloadAction),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _dismissed = true),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(
                            AppTouchTargets.min,
                            AppTouchTargets.min,
                          ),
                          foregroundColor: palette.inkMuted,
                        ),
                        child: Text(l10n.updateLaterAction),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
