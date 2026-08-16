// Web export destination (Story 4.2 / AD-9 / FR-9).
//
// On web the export destination is a `Blob` download. The bytes
// are wrapped in a `Blob` with the requested mime type, an anchor
// is constructed with the filename, and a click triggers the
// browser's download affordance. No platform plugin; no
// telemetry; the user-chosen filename is the only state the
// destination holds.

import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import 'export_destination.dart';

class WebExportDestination implements ExportDestination {
  WebExportDestination();

  @override
  Future<void> write({
    required String filename,
    required String mimeType,
    required Uint8List bytes,
  }) async {
    final blob = web.Blob(
      <JSAny>[bytes.toJS].toJS,
      web.BlobPropertyBag(type: mimeType),
    );
    final url = web.URL.createObjectURL(blob);
    final anchor = web.HTMLAnchorElement()
      ..href = url
      ..download = filename
      ..style.display = 'none';
    web.document.body?.append(anchor);
    anchor.click();
    anchor.remove();
    web.URL.revokeObjectURL(url);
  }
}

ExportDestination createExportDestination() => WebExportDestination();
