// The answers to the two one-time privacy notices (privacy audit PV1, PV7).
//
// `PrivacyPrefs` keeps them in the encrypted key/value table; this is the
// Riverpod seam. Overridden in `boot.dart` with the bundle's key/value store
// (in-memory for the unencrypted dev web store); tests inject a prefs over an
// `InMemoryKeyValueStore`.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

final privacyPrefsProvider = Provider<PrivacyPrefs>(
  (ref) => throw UnimplementedError(
    'privacyPrefsProvider must be overridden at the ProviderScope root with '
    'PrivacyPrefs(<the encrypted key/value store>) — see '
    'apps/client/lib/boot.dart.',
  ),
);
