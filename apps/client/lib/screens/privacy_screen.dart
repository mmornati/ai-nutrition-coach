// Settings → Privacy: "What this app stores and sends" (privacy audit §4.5).
//
// The in-app privacy notice. A short, calm, honest list - what is stored and
// where, what leaves the device and when, what the server you got the app
// from sees, what is never collected, how to delete and export - plus the one
// switch it owns: whether scanned barcodes may be looked up on Open Food
// Facts (PV7). Linked from the first-run notice, the barcode notice, the
// photo consent dialog and Your AI.
//
// All copy is in the ARB file (AD-7). No scrolling-only tricks: the page is a
// plain list so screen readers and large text work as everywhere else.

import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../l10n/l10n.dart';
import '../state/privacy_provider.dart';
import '../theme/app_tokens.dart';

class PrivacyScreen extends ConsumerStatefulWidget {
  const PrivacyScreen({super.key});

  @override
  ConsumerState<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends ConsumerState<PrivacyScreen> {
  /// `null` until the stored answer has been read.
  OffLookupChoice? _off;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    OffLookupChoice choice;
    try {
      choice = await ref.read(privacyPrefsProvider).offLookupChoice();
    } on Object {
      choice = OffLookupChoice.unasked;
    }
    if (mounted) setState(() => _off = choice);
  }

  Future<void> _setOff(bool allowed) async {
    final next = allowed
        ? OffLookupChoice.allowed
        : OffLookupChoice.offlineOnly;
    try {
      await ref.read(privacyPrefsProvider).setOffLookupChoice(next);
      if (mounted) {
        setState(() {
          _off = next;
          _failed = false;
        });
      }
    } on Object {
      // Could not keep it (store locked): the switch stays where it was.
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final body = AppTypography.coach.copyWith(color: palette.ink);
    final muted = AppTypography.coach.copyWith(color: palette.inkMuted);
    final android = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

    Widget section(String heading, List<String> paragraphs) => Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              heading,
              style: AppTypography.ui.copyWith(color: palette.ink),
            ),
          ),
          for (final p in paragraphs) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(p, style: body),
          ],
        ],
      ),
    );

    final offOn = _off == OffLookupChoice.allowed;
    final offSubtitle = switch (_off) {
      OffLookupChoice.allowed => l10n.privacyOffToggleOn,
      OffLookupChoice.offlineOnly => l10n.privacyOffToggleOff,
      _ => l10n.privacyOffToggleUnasked,
    };

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(
          l10n.privacyTitle,
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text(l10n.privacyIntro, style: muted),
            const SizedBox(height: AppSpacing.lg),
            section(l10n.privacyStoredHeading, [l10n.privacyStoredBody]),
            section(l10n.privacyLeavesHeading, [
              l10n.privacyLeavesBarcode,
              l10n.privacyLeavesPhoto,
              if (android) l10n.privacyLeavesAndroid,
            ]),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                l10n.privacyOffToggle,
                style: AppTypography.ui.copyWith(color: palette.ink),
              ),
              subtitle: Text(offSubtitle, style: muted),
              value: offOn,
              onChanged: _off == null ? null : _setOff,
            ),
            const SizedBox(height: AppSpacing.lg),
            section(l10n.privacyServerHeading, [l10n.privacyServerBody]),
            section(l10n.privacyNeverHeading, [l10n.privacyNeverBody]),
            section(l10n.privacyDeleteHeading, [l10n.privacyDeleteBody]),
            section(l10n.privacyExportHeading, [l10n.privacyExportBody]),
            section(l10n.privacySharedHeading, [l10n.privacySharedBody]),
            if (_failed) Text(l10n.privacySaveFailed, style: muted),
          ],
        ),
      ),
    );
  }
}
