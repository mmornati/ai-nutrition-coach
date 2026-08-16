// Placeholder for the barcode scan entry surface (Story 1.7 / UX-DR7).
//
// The CaptureSheet routes here today; `build()` throws
// `UnimplementedCaptureTarget(barcode)` so the failure is typed and
// discoverable rather than a silent null-deref. Story 1.7 replaces
// this with the real mobile_scanner-backed flow.

import 'package:flutter/material.dart';

import 'capture_targets.dart';

class CaptureBarcodeScreen extends StatelessWidget {
  const CaptureBarcodeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    throw const UnimplementedCaptureTarget(CaptureTarget.barcode);
  }
}
