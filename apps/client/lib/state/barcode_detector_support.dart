// Is a local barcode decoder available on this platform? (N5 / review 7)
//
// Android and iOS decode with the platform ML kits, so this is always true
// there. On the web the build is pinned to the browser's native
// `BarcodeDetector` (see `configureWebBarcodeReader`) -- the CDN-hosted
// zxing fallback is deliberately off -- and that API only exists in Chrome on
// Android / macOS / ChromeOS and Edge on macOS; Firefox, Windows/Linux Chrome
// and Safari (behind a default-off preference) lack it. The scanner screen
// asks before starting the camera, so those browsers go straight to manual
// entry without a pointless permission prompt.
export 'barcode_detector_support_stub.dart'
    if (dart.library.js_interop) 'barcode_detector_support_web.dart';
