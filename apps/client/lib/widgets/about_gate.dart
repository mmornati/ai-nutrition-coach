// Shows the one-time "About this app" notice before its child (PV1).
//
// Mobile (and the dev store): wraps the first Day Board. Web: the notice is
// shown BEFORE the passphrase screen, when there is no encrypted store yet to
// remember the answer in ([AboutGate.beforeStore]); the answer is then
// remembered for the session, and once the store exists the post-unlock gate
// writes the acknowledgement to it silently, so the notice never appears
// twice.
//
// Fail-safe: if the stored answer cannot be read the notice is shown (never
// silently skipped); if it cannot be written, dismissing still works for this
// session and the notice comes back next time.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/about_notice_screen.dart';
import '../state/privacy_provider.dart';

/// Set when the web build showed (and the person dismissed) the notice before
/// the encrypted store existed. Survives the scope restart that follows the
/// passphrase creation, so the post-unlock gate does not ask again.
bool _acknowledgedBeforeStore = false;

@visibleForTesting
void resetAboutNoticeSessionFlag() => _acknowledgedBeforeStore = false;

class AboutGate extends ConsumerStatefulWidget {
  /// The gate in front of the Day Board: the answer lives in the encrypted
  /// key/value store.
  const AboutGate({super.key, required this.child}) : beforeStore = false;

  /// The gate in front of the web passphrase screen: no store yet, the
  /// answer is kept for the session only.
  const AboutGate.beforeStore({super.key, required this.child})
    : beforeStore = true;

  final Widget child;
  final bool beforeStore;

  @override
  ConsumerState<AboutGate> createState() => _AboutGateState();
}

class _AboutGateState extends ConsumerState<AboutGate> {
  /// `null` while the stored answer is being read.
  bool? _acknowledged;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.beforeStore) {
      setState(() => _acknowledged = _acknowledgedBeforeStore);
      return;
    }
    var done = false;
    try {
      final prefs = ref.read(privacyPrefsProvider);
      done = await prefs.aboutAcknowledged();
      if (!done && _acknowledgedBeforeStore) {
        // Shown before the passphrase screen: remember it now that there is
        // somewhere to remember it.
        done = true;
        try {
          await prefs.acknowledgeAbout();
        } on Object {
          // Kept for the session; asked again next time at worst.
        }
      }
    } on Object {
      done = _acknowledgedBeforeStore;
    }
    if (mounted) setState(() => _acknowledged = done);
  }

  Future<void> _dismiss() async {
    if (widget.beforeStore) {
      _acknowledgedBeforeStore = true;
      setState(() => _acknowledged = true);
      return;
    }
    setState(() => _acknowledged = true);
    try {
      await ref.read(privacyPrefsProvider).acknowledgeAbout();
    } on Object {
      // Dismissed for this session; the notice returns next time.
    }
  }

  @override
  Widget build(BuildContext context) {
    final acknowledged = _acknowledged;
    if (acknowledged == null) return const SizedBox.shrink();
    if (acknowledged) return widget.child;
    return AboutNoticeScreen(onDismiss: _dismiss);
  }
}
