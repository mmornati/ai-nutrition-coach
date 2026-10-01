// Riverpod provider exposing the web store controller (Phase 2B / W4).
//
// `null` everywhere except the production web bundle: `main.dart` overrides
// it with `StoreBundle.webStoreController`, which is only populated by the
// web factory. The `UnlockGate` keys its whole behaviour off this (non-null
// -> create / unlock / lock flow; null -> mobile or the dev in-memory
// store, straight to the Day Board), so the web path is exercisable in
// plain widget tests by overriding this provider.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

final Provider<WebStoreController?> webStoreControllerProvider =
    Provider<WebStoreController?>((ref) => null);
