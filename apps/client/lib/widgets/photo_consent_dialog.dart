// The "send photos to this host?" consent (N1, PV1, PV2).
//
// Shown before the FIRST photo goes to a given third-party host (the BYOK
// endpoint's host) and, while "Ask before every photo upload" is on (the
// default), before EVERY photo. It names the host verbatim and says plainly
// what is sent (the photo, a fixed instruction, the model name), what the
// host also sees on any request (internet address, device or browser type,
// and on the web the page's address), that the host may keep requests under
// its own policy, and what is NOT sent. The answer is remembered per host by
// the caller only in the "ask once" mode (`grantPhotoConsent`); the dialog
// itself stores nothing.
//
// There is no pre-ticked box and no dark-pattern emphasis: "Not now" is as
// large and as quiet as "Allow", and declining costs nothing - the photo is
// dropped and the no-AI core (closest matches / manual entry) is there
// (FR-15 / NDP). Copy is keyed in `PhotoConsentStrings` (AD-7). "What this
// app stores and sends" opens the in-app privacy page (never an external
// link, which would itself be an unrequested network trip).

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart';

import '../screens/privacy_screen.dart';
import '../theme/app_tokens.dart';

/// Resolves `true` when the user allows the photo to go to [host], `false`
/// for "Not now" (or dismissing the dialog). With [perPhoto] the question is
/// about THIS photo only.
Future<bool> confirmPhotoUpload(
  BuildContext context, {
  required String host,
  bool perPhoto = false,
  PhotoConsentStrings copy = enPhotoConsentStrings,
}) async {
  final allowed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) =>
        PhotoConsentDialog(host: host, perPhoto: perPhoto, copy: copy),
  );
  return allowed ?? false;
}

class PhotoConsentDialog extends StatelessWidget {
  const PhotoConsentDialog({
    super.key,
    required this.host,
    this.perPhoto = false,
    this.onWeb,
    this.copy = enPhotoConsentStrings,
  });

  final String host;

  /// The question is about this one photo ("Ask before every photo upload").
  final bool perPhoto;

  /// Whether the web wording applies (the page's address is also visible to
  /// the host). Defaults to the build target.
  final bool? onWeb;
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
            Text(
              _fill((onWeb ?? kIsWeb) ? copy.alsoVisibleWeb : copy.alsoVisible),
              style: body,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(_fill(copy.retention), style: body),
            const SizedBox(height: AppSpacing.md),
            Text(copy.notSent, style: body),
            const SizedBox(height: AppSpacing.md),
            Text(perPhoto ? copy.askEveryHint : copy.revokeHint, style: muted),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(
                  AppTouchTargets.min,
                  AppTouchTargets.min,
                ),
                alignment: Alignment.centerLeft,
              ),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const PrivacyScreen()),
              ),
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
          child: Text(perPhoto ? copy.allowOnce : _fill(copy.allow)),
        ),
      ],
    );
  }
}
