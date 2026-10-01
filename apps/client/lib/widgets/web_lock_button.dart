// Manual "Lock" action for the web store (Phase 2B / W4). Renders nothing
// when there is no web store controller (mobile, dev in-memory store) or the
// store is not unlocked. Locking zeroes the key and closes the database; the
// `UnlockGate` then restarts into the unlock screen.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/web_store_controller_provider.dart';

class WebLockButton extends ConsumerWidget {
  const WebLockButton({super.key, this.copy = enWebSessionStrings});

  final WebSessionStrings copy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(webStoreControllerProvider);
    if (controller == null || !controller.isUnlocked) {
      return const SizedBox.shrink();
    }
    return Semantics(
      button: true,
      label: copy.lockAction,
      child: TextButton(
        onPressed: () => controller.lock(),
        style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
        child: Text(copy.lockAction),
      ),
    );
  }
}
