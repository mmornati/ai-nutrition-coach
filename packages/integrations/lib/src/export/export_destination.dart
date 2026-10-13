// Export destination abstraction (Story 4.2 / AD-9 / FR-9).
//
// The destination is the platform-specific write-to-disk shape:
// the web adapter triggers a `Blob` download; the mobile adapter
// writes a file under `path_provider`. The port is conditional on
// `dart.library.io` so the web bundle never references the
// `path_provider` package.

import 'dart:typed_data';

import 'export_destination_stub.dart'
    if (dart.library.html) 'web_export_destination.dart'
    if (dart.library.io) 'mobile_export_destination.dart'
    as impl;

/// The abstract destination the exporters serialize to. The
/// adapter writes the bytes to the user-chosen destination (web
/// download / mobile file path).
abstract interface class ExportDestination {
  /// Write the bytes to the destination. The filename is a
  /// hint — the destination may honour it (web download) or
  /// prepend a path (mobile).
  Future<void> write({
    required String filename,
    required String mimeType,
    required Uint8List bytes,
  });
}

/// The factory the providers wire up. On web it returns the
/// `Blob`-download destination; on mobile it returns the
/// `path_provider` file destination. The fallback stub is for
/// tests that don't need a real destination.
ExportDestination createExportDestination() => impl.createExportDestination();
