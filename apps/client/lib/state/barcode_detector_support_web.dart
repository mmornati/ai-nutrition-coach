import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// `'BarcodeDetector' in window`.
bool barcodeDetectorAvailable() => globalContext.has('BarcodeDetector');
