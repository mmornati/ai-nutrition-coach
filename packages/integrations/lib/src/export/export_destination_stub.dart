// Stub destination used only when neither `dart.library.html` nor
// `dart.library.io` is on the classpath. Tests pin the export
// behaviour without binding to a platform destination.

import 'dart:typed_data';

import 'export_destination.dart';

/// No-op destination for tests. Records the writes so the test
/// surface can assert on the byte content + filename + mime type
/// without touching the platform.
class RecordingExportDestination implements ExportDestination {
  RecordingExportDestination();

  final List<({String filename, String mimeType, Uint8List bytes})> _writes =
      [];

  List<({String filename, String mimeType, Uint8List bytes})> get writes =>
      List.unmodifiable(_writes);

  @override
  Future<void> write({
    required String filename,
    required String mimeType,
    required Uint8List bytes,
  }) async {
    _writes.add((filename: filename, mimeType: mimeType, bytes: bytes));
  }
}

ExportDestination createExportDestination() => RecordingExportDestination();
