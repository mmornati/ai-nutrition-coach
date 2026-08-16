// Mobile export destination (Story 4.2 / AD-9 / FR-9).
//
// On io the export destination writes the bytes to a file under
// the app's documents directory (`path_provider`). The user-chosen
// filename is the leaf; the path is reported back so the UI can
// surface the calm "exported: <path>" line.

import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

import 'export_destination.dart';

class MobileExportDestination implements ExportDestination {
  MobileExportDestination();

  @override
  Future<void> write({
    required String filename,
    required String mimeType,
    required Uint8List bytes,
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
  }
}

ExportDestination createExportDestination() => MobileExportDestination();
