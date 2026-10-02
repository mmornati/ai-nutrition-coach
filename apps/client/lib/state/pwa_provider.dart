// Riverpod seams for the installable-PWA features (ADR-0003): the service
// worker update signal, durable-storage status, the "install" prompt and the
// export history behind the quiet export suggestion.
//
// Every default is inert (no update, storage `unsupported`, no prompt), so
// widget tests and native builds never touch a browser API; `boot.dart`
// overrides them with the real web adapters. The browser plumbing lives in
// `packages/integrations/lib/src/pwa` (AD-1: the UI never imports it).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'record_plate_provider.dart';

/// "A new version is ready" (a waiting service worker).
final Provider<AppUpdateSignal> appUpdateProvider = Provider<AppUpdateSignal>(
  (ref) => const NoAppUpdateSignal(),
);

/// Durable-storage status / request (`navigator.storage`).
final Provider<StoragePersistenceSource> storagePersistenceProvider =
    Provider<StoragePersistenceSource>(
      (ref) => FixedStoragePersistence(StoragePersistence.unsupported),
    );

/// The captured Chromium install prompt (a `Listenable`: the Install screen
/// rebuilds with a `ListenableBuilder` when the browser offers it).
final Provider<InstallPrompt> installPromptProvider = Provider<InstallPrompt>(
  (ref) => NoInstallPrompt(),
);

/// Where the app runs (platform + installed or not).
final Provider<InstallContext> installContextProvider =
    Provider<InstallContext>(
      (ref) => const InstallContext(
        platform: InstallPlatform.desktop,
        standalone: false,
      ),
    );

/// The encrypted record of when the user last exported.
final Provider<ExportHistory> exportHistoryProvider = Provider<ExportHistory>(
  (ref) => ExportHistory(InMemoryKeyValueStore()),
);

/// The current storage-protection status, read when Your data opens.
final storagePersistenceStatusProvider =
    FutureProvider.autoDispose<StoragePersistence>(
      (ref) => ref.watch(storagePersistenceProvider).status(),
    );

/// What the quiet export suggestion needs to decide.
class ExportReminderState {
  const ExportReminderState({required this.lastExportAt, required this.due});

  final DateTime? lastExportAt;

  /// Show the one-line suggestion.
  final bool due;
}

/// Last export + whether to suggest one. Invalidate after an export or a
/// dismissal.
final exportReminderProvider = FutureProvider.autoDispose<ExportReminderState>((
  ref,
) async {
  final history = ref.watch(exportHistoryProvider);
  final last = await history.lastExportAt();
  final dismissed = await history.reminderDismissedAt();
  var hasData = false;
  try {
    final read = await ref.watch(encryptedStoreProvider).readRange();
    hasData = switch (read) {
      PlatesRead(:final plates) => plates.isNotEmpty,
      PlatesReadFailed() => false,
    };
  } on Object {
    // No readable store: nothing to protect, so nothing to suggest.
  }
  return ExportReminderState(
    lastExportAt: last,
    due: exportReminderDue(
      now: DateTime.now(),
      hasData: hasData,
      lastExportAt: last,
      dismissedAt: dismissed,
    ),
  );
});
