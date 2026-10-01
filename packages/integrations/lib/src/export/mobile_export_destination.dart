// Mobile export destination (Story 4.2 / AD-9 / FR-9; Phase 2A / D9).
//
// The export is a plaintext copy of the user's history, so it must not
// sit around. The old destination wrote it into the documents directory
// (included in iCloud / iTunes / Android backups) and never removed it.
//
// Now:
//   1. the bytes are written to `<temp>/openplate_exports/<filename>`
//      (the OS cache area: not backed up, evictable);
//   2. the file is handed to the platform share sheet (`share_plus`) so
//      the user chooses where it goes — Files, mail, a share target;
//   3. our ORIGINAL is deleted on every outcome (success, dismissed,
//      unavailable, or an exception). On Android `share_plus` first copies
//      the file to `<cache>/share_plus/` and shares THAT copy, so deleting
//      the original does not break the hand-off — but the share_plus copy
//      is outside our control: it is purged when older than
//      `kExportStaleAfter` at the start of the next export, and removed by
//      "Erase all local data" (D8) or by the OS clearing its cache. It is
//      not removed the moment the share completes.
//
// Only files older than `kExportStaleAfter` are purged — never the whole
// directory — so a recent hand-off is not disturbed.
//
// Only the leaf of the requested filename is used (no path traversal).
// No telemetry; the share sheet is the only egress and is user-driven.
//
// iPad note: `share_plus` needs a `sharePositionOrigin` for the popover
// on iPad; the destination has no widget context, so on iPad the share
// call can throw and the screen shows its calm "export failed" line.
// Tracked as a follow-up in the remediation plan (Phase 5).

import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'export_destination.dart';
import 'export_paths.dart';

/// Hands a written file to the platform share sheet and reports the
/// outcome. Injectable so tests never touch the platform channel.
typedef ShareFile =
    Future<ShareResultStatus> Function({
      required String path,
      required String mimeType,
      required String filename,
    });

Future<ShareResultStatus> _sharePlusShare({
  required String path,
  required String mimeType,
  required String filename,
}) async {
  final result = await SharePlus.instance.share(
    ShareParams(
      files: [XFile(path, mimeType: mimeType, name: filename)],
    ),
  );
  return result.status;
}

class MobileExportDestination implements ExportDestination {
  MobileExportDestination({
    Future<Directory> Function()? temporaryDirectory,
    ShareFile? shareFile,
  }) : _temporaryDirectory = temporaryDirectory ?? getTemporaryDirectory,
       _shareFile = shareFile ?? _sharePlusShare;

  final Future<Directory> Function() _temporaryDirectory;
  final ShareFile _shareFile;

  @override
  Future<void> write({
    required String filename,
    required String mimeType,
    required Uint8List bytes,
  }) async {
    final leaf = filename.split(RegExp(r'[\\/]')).last;
    if (leaf.isEmpty || leaf == '.' || leaf == '..') {
      throw ArgumentError.value(filename, 'filename', 'not a file name');
    }
    final base = await _temporaryDirectory();
    final dir = Directory('${base.path}/$kExportSubdirectory');
    _purgeStale(dir);
    _purgeStale(Directory('${base.path}/$kSharePlusCacheSubdirectory'));
    await dir.create(recursive: true);

    final file = File('${dir.path}/$leaf');
    await file.writeAsBytes(bytes, flush: true);
    try {
      await _shareFile(path: file.path, mimeType: mimeType, filename: leaf);
    } finally {
      if (file.existsSync()) await file.delete();
    }
  }

  void _purgeStale(Directory dir) {
    if (!dir.existsSync()) return;
    final cutoff = DateTime.now().subtract(kExportStaleAfter);
    for (final entity in dir.listSync(followLinks: false)) {
      if (entity is File && entity.lastModifiedSync().isBefore(cutoff)) {
        entity.deleteSync();
      }
    }
  }
}

ExportDestination createExportDestination() => MobileExportDestination();
