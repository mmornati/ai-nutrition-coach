// Placeholder for the photo capture entry surface (Story 1.8 / UX-DR7).
//
// The CaptureSheet routes here today; `build()` throws
// `UnimplementedCaptureTarget(photo)` so the failure is typed and
// discoverable rather than a silent null-deref. Story 1.8 replaces
// this with the real camera + on-device classifier flow.
//
// Note: the screen does not render any UI — the throw fires before
// the framework can lay it out. That is intentional; the placeholder's
// job is to surface the typed gap, not to imitate the eventual UI.

import 'package:flutter/material.dart';

import 'capture_targets.dart';

class CapturePhotoScreen extends StatelessWidget {
  const CapturePhotoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    throw const UnimplementedCaptureTarget(CaptureTarget.photo);
  }
}
