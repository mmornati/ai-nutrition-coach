import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// A local decoder is available when the browser has the native
/// `BarcodeDetector` OR can run the self-hosted zxing-wasm reader
/// (`WebAssembly`).
bool barcodeDetectorAvailable() =>
    globalContext.has('BarcodeDetector') || globalContext.has('WebAssembly');
