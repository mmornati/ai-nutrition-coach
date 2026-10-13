// Is a local barcode decoder available on this platform? (N5 / review 7;
// revised for the PWA, ADR-0003)
//
// Android and iOS decode with the platform ML kits, so this is always true
// there. On the web `configureWebBarcodeReader` lets `mobile_scanner` use the
// browser's native `BarcodeDetector` where it exists (Chrome, Edge) and the
// self-hosted zxing-wasm reader everywhere else (Safari/iOS, Firefox), so a
// decoder exists whenever the browser can run WebAssembly. Only a browser
// without it goes straight to manual entry, without a pointless permission
// prompt; a decoder that later fails to start lands on the same calm
// "scanning isn't available in this browser" copy (see
// `CaptureBarcodeScreen`).
export 'barcode_detector_support_stub.dart'
    if (dart.library.js_interop) 'barcode_detector_support_web.dart';
