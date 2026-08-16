// Typed exceptions for the capture fan-out routing.
//
// Each Story 1.6/1.7/1.8 capture entry surface declares a placeholder
// that throws `UnimplementedCaptureTarget(target)` on `build()`. The
// routing from `CaptureSheet` to the right placeholder is fully wired;
// the placeholder itself is a typed, named failure until the
// corresponding story ships the real implementation. Story 1.5
// (`ManualEntryScreen`) is the exception — it's already implemented
// and the Type or talk tile routes there directly, no throw needed.

import 'package:flutter/foundation.dart';

/// The set of entry surfaces the `CaptureSheet` fans out into.
///
/// Order matches the tile order in the sheet:
///   1. `photo`     → Snapshot  (Story 1.8, currently a placeholder)
///   2. `barcode`   → Scan a barcode (Story 1.7, currently a placeholder)
///   3. `typeOrTalk`→ Type or talk (Story 1.5, implemented)
enum CaptureTarget {
  photo,
  barcode,
  typeOrTalk,
}

/// Thrown by the placeholder capture screens so a user tapping an
/// unimplemented tile gets a typed, named failure rather than an
/// opaque exception or a silent null-deref crash. The framework's
/// default error widget still surfaces in dev; production callers may
/// catch and translate to calm copy when they ship (UX-DR10).
@immutable
class UnimplementedCaptureTarget implements Exception {
  const UnimplementedCaptureTarget(this.target);

  /// Which entry surface was tapped. Drives routing on the consumer
  /// side and gives the failure a readable name in logs.
  final CaptureTarget target;

  @override
  String toString() => 'UnimplementedCaptureTarget(${target.name})';
}
