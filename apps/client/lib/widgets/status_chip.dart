// Mono `· local` / `· pending` / `· synced` / `· retry later` status
// chip (UX-DR6 / Story 4.3 / AD-6 / FR-10).
//
// Tiny mono text on the row's trailing edge — never louder than
// the row body (epic-1-context.md § Status chips). The chip reads
// from the per-plate sync-queue stream so the state is always
// derived from queue state (AD-3 invariant: the chip never holds
// a UI counter — it's a pure derivation).
//
// The flip is `Opacity`-only (no surface, no spinner, no countdown —
// UX-DR6). The `failed` state never uses a red-guilt colour
// (FR-15); it renders in the same muted-amber ink as the rest of
// the chrome, with the calm `· retry later` copy (AD-7).
//
// Touch-target contract: the chip lives inside a tappable row, so
// the row itself owns the 48px hit target. The chip itself is
// never a separate button.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/sync_queue_provider.dart';
import '../theme/app_tokens.dart';

class StatusChip extends ConsumerWidget {
  const StatusChip({
    super.key,
    required this.plateLogId,
    this.copy = enSyncQueueStrings,
  });

  final int plateLogId;
  final SyncQueueStrings copy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    // Default to `local` so the chip never reads stale data while
    // the per-plate stream is still resolving on first paint.
    final perPlate = ref.watch(syncQueuePerPlateProvider).value;
    final status = _statusFor(plateLogId, perPlate);

    final label = switch (status) {
      SyncOpStatusValue.pending => '· ${copy.pendingChip}',
      SyncOpStatusValue.synced => '· ${copy.syncedChip}',
      SyncOpStatusValue.failed => '· ${copy.failedChip}',
    };

    final colour = switch (status) {
      SyncOpStatusValue.synced => palette.statusSynced,
      SyncOpStatusValue.failed => palette.inkMuted,
      _ => palette.statusLocal,
    };

    return Semantics(
      label: 'Status: ${label.replaceFirst('· ', '')}',
      readOnly: true,
      child: AnimatedOpacity(
        opacity: 1,
        duration: const Duration(milliseconds: 240),
        child: Text(
          label,
          style: AppTypography.monoWhisper.copyWith(color: colour),
        ),
      ),
    );
  }

  SyncOpStatusValue _statusFor(
    int plateLogId,
    List<SyncOpStatus>? perPlate,
  ) {
    if (perPlate == null) return SyncOpStatusValue.synced;
    for (final entry in perPlate) {
      if (entry.plateLogId == plateLogId) return entry.status;
    }
    return SyncOpStatusValue.synced;
  }
}

/// A non-intrusive "retry later" hint rendered below the plate
/// stack when the queue has any `failed` ops. Single quiet line;
/// never a banner, never a modal (FR-15 / UX-DR13).
class SyncRetryLaterHint extends ConsumerWidget {
  const SyncRetryLaterHint({
    super.key,
    this.copy = enSyncQueueStrings,
  });

  final SyncQueueStrings copy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final state = ref.watch(syncQueueStateProvider).value;
    if (state == null || state.failed == 0) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Text(
        copy.retryLaterHint,
        style: AppTypography.coach.copyWith(color: palette.inkMuted),
      ),
    );
  }
}
