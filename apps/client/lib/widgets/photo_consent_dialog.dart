// The one-time "send photos to this host?" consent (N1).
//
// Shown before the FIRST photo goes to a given third-party host (the BYOK
// endpoint's host). It names the host verbatim, says what is sent and what
// is not, and says where to change its mind (Settings → Your AI). The
// answer is remembered per host by the caller (`grantPhotoConsent`); the
// dialog itself stores nothing.
//
// There is no pre-ticked box and no dark-pattern emphasis: "Not now" is as
// large and as quiet as "Allow", and declining costs nothing — the photo is
// dropped and the no-AI core (closest matches / manual entry) is there
// (FR-15 / NDP). Copy is keyed in `PhotoConsentStrings` (AD-7).
//
// "Copy a link to how this works" puts the docs URL on the clipboard (the
// app has no browser dependency by design, and opening a link would itself
// be an unrequested network trip).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:integrations/integrations.dart';

import '../theme/app_tokens.dart';

/// The docs URL the dialog's link points to.
String photoConsentDocsUrl(PhotoConsentStrings copy) =>
    '$kOpenPlateProjectUrl/blob/main/${copy.docsPath}';

/// Resolves `true` when the user allows photos to go to [host], `false` for
/// "Not now" (or dismissing the dialog).
Future<bool> confirmPhotoUpload(
  BuildContext context, {
  required String host,
  PhotoConsentStrings copy = enPhotoConsentStrings,
}) async {
  final allowed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => PhotoConsentDialog(host: host, copy: copy),
  );
  return allowed ?? false;
}

class PhotoConsentDialog extends StatelessWidget {
  const PhotoConsentDialog({
    super.key,
    required this.host,
    this.copy = enPhotoConsentStrings,
  });

  final String host;
  final PhotoConsentStrings copy;

  String _fill(String template) => template.replaceAll('{host}', host);

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final body = AppTypography.coach.copyWith(color: palette.ink);
    final muted = AppTypography.coach.copyWith(color: palette.inkMuted);
    return AlertDialog(
      backgroundColor: palette.background,
      title: Semantics(
        header: true,
        child: Text(
          _fill(copy.title),
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(copy.whatIsSent, style: body),
            const SizedBox(height: AppSpacing.md),
            Text(_fill(copy.whereItGoes), style: body),
            const SizedBox(height: AppSpacing.md),
            Text(copy.notSent, style: body),
            const SizedBox(height: AppSpacing.md),
            Text(copy.revokeHint, style: muted),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(
                  AppTouchTargets.min,
                  AppTouchTargets.min,
                ),
                alignment: Alignment.centerLeft,
              ),
              onPressed: () async {
                final messenger = ScaffoldMessenger.maybeOf(context);
                await Clipboard.setData(
                  ClipboardData(text: photoConsentDocsUrl(copy)),
                );
                messenger?.showSnackBar(
                  SnackBar(content: Text(copy.linkCopied)),
                );
              },
              child: Text(copy.learnMore),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          style: TextButton.styleFrom(
            minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
          ),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(copy.decline),
        ),
        TextButton(
          style: TextButton.styleFrom(
            minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
          ),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(_fill(copy.allow)),
        ),
      ],
    );
  }
}
