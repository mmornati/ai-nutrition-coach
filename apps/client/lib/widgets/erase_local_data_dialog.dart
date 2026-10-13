// Confirmation dialog + runner for "Erase all local data"
// (Phase 2A / D8). Shared by the Your data screen and the lost-key
// surface so the destructive action is confirmed the same way
// everywhere.
//
// AD-7: copy is keyed in `YourDataStrings`; never interpolated.
// FR-15: calm, non-judgmental; the safe choice ("Keep my data") is the
// dialog's dismiss action, and there is no countdown or pressure.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart';

/// Ask for confirmation; on yes run [erase] and return its result.
/// Returns `null` when the user kept their data.
Future<EraseLocalDataResult?> confirmAndEraseLocalData({
  required BuildContext context,
  required Future<EraseLocalDataResult> Function() erase,
  YourDataStrings copy = enYourDataStrings,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(copy.eraseConfirmTitle),
      content: Text(copy.eraseConfirmBody),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(copy.eraseCancel),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(copy.eraseConfirmAction),
        ),
      ],
    ),
  );
  if (confirmed != true) return null;
  return erase();
}
