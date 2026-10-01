// The injectable "now" for date-sensitive UI (Day Board "today",
// week strip, day title).
//
// Production resolves to `DateTime.now`; tests override it with a fixed
// instant so assertions never depend on the wall-clock date.

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Returns the current local time. Override in tests:
/// `clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12))`.
final Provider<DateTime Function()> clockProvider =
    Provider<DateTime Function()>((ref) => DateTime.now);
