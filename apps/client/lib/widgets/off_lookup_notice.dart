// The one-time Open Food Facts notice (privacy audit PV7).
//
// Shown the first time a scanned barcode is about to be looked up online:
// "Barcodes you scan are looked up on Open Food Facts (public, no account).
// Only the barcode is sent." Two equal, quiet choices - OK, or "Don't look up
// online" (the offline catalog only) - and a link to the privacy page. The
// answer is stored (`PrivacyPrefs`) and can be changed in Settings → Privacy.
// Dismissing the dialog any other way means "don't look up online": nothing
// is sent without a yes.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart' show OffLookupChoice;

import '../l10n/l10n.dart';
import '../screens/privacy_screen.dart';
import '../theme/app_tokens.dart';

/// Ask once; resolves [OffLookupChoice.allowed] or
/// [OffLookupChoice.offlineOnly].
Future<OffLookupChoice> showOffLookupNotice(BuildContext context) async {
  final allowed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const OffLookupNoticeDialog(),
  );
  return allowed == true
      ? OffLookupChoice.allowed
      : OffLookupChoice.offlineOnly;
}

class OffLookupNoticeDialog extends StatelessWidget {
  const OffLookupNoticeDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    ButtonStyle style() => TextButton.styleFrom(
      minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
    );
    return AlertDialog(
      backgroundColor: palette.background,
      title: Semantics(
        header: true,
        child: Text(
          l10n.offNoticeTitle,
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.offNoticeBody,
              style: AppTypography.coach.copyWith(color: palette.ink),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              kIsWeb ? l10n.offNoticeAlsoWeb : l10n.offNoticeAlso,
              style: AppTypography.coach.copyWith(color: palette.ink),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              style: style().copyWith(alignment: Alignment.centerLeft),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const PrivacyScreen()),
              ),
              child: Text(l10n.privacyLinkLabel),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          style: style(),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.offNoticeOffline),
        ),
        TextButton(
          style: style(),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(l10n.offNoticeOk),
        ),
      ],
    );
  }
}
