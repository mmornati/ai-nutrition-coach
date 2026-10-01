// Whether the app is running as a web build.
//
// Wraps `kIsWeb` so widget tests (which always run on the Dart VM, where
// `kIsWeb` is false) can exercise the web-only branches by overriding it.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// `true` on the web target. Override in tests:
/// `isWebProvider.overrideWithValue(true)`.
final Provider<bool> isWebProvider = Provider<bool>((ref) => kIsWeb);
