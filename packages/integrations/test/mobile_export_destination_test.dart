// `MobileExportDestination` (Phase 2A / D9): temp dir, share hand-off,
// delete-after-handoff.

import 'dart:io';
import 'dart:typed_data';

import 'package:integrations/integrations.dart';
import 'package:integrations/src/export/mobile_export_destination.dart';
import 'package:share_plus/share_plus.dart';
import 'package:test/test.dart';

void main() {
  late Directory tmp;
  setUp(
    () => tmp = Directory.systemTemp.createTempSync('ai_nutrition_coach_exp_'),
  );
  tearDown(() => tmp.deleteSync(recursive: true));

  Directory exportDir() => Directory('${tmp.path}/$kExportSubdirectory');

  MobileExportDestination build(ShareFile share) => MobileExportDestination(
    temporaryDirectory: () async => tmp,
    shareFile: share,
  );

  test('writes to the temp export dir, shares it, then deletes it', () async {
    String? seenPath;
    Uint8List? seenBytes;
    final dest = build(({
      required path,
      required mimeType,
      required filename,
    }) async {
      seenPath = path;
      seenBytes = File(path).readAsBytesSync();
      expect(mimeType, 'text/csv');
      expect(filename, '2026-01-01-ai-nutrition-coach.csv');
      return ShareResultStatus.success;
    });
    await dest.write(
      filename: '2026-01-01-ai-nutrition-coach.csv',
      mimeType: 'text/csv',
      bytes: Uint8List.fromList([1, 2, 3]),
    );
    expect(seenPath, startsWith(exportDir().path));
    expect(seenBytes, [1, 2, 3]);
    expect(File(seenPath!).existsSync(), isFalse);
  });

  test('deletes the file even when the share sheet throws', () async {
    String? path;
    final dest = build(({
      required path,
      required mimeType,
      required filename,
    }) async {
      // ignore: parameter_assignments
      throw StateError('no share target');
    });
    await expectLater(
      dest.write(
        filename: 'x.json',
        mimeType: 'application/json',
        bytes: Uint8List(1),
      ),
      throwsStateError,
    );
    expect(path, isNull);
    expect(exportDir().listSync(), isEmpty);
  });

  test('deletes the original even when the outcome is unavailable', () async {
    final dest = build(
      ({required path, required mimeType, required filename}) async =>
          ShareResultStatus.unavailable,
    );
    await dest.write(
      filename: 'a.csv',
      mimeType: 'text/csv',
      bytes: Uint8List(1),
    );
    expect(exportDir().listSync(), isEmpty);
  });

  test('purges only STALE files (and stale share_plus copies)', () async {
    exportDir().createSync(recursive: true);
    final old = File('${exportDir().path}/old.csv')..writeAsStringSync('x');
    old.setLastModifiedSync(DateTime.now().subtract(const Duration(hours: 2)));
    final fresh = File('${exportDir().path}/fresh.csv')..writeAsStringSync('x');
    final sp = Directory('${tmp.path}/$kSharePlusCacheSubdirectory')
      ..createSync();
    final oldCopy = File('${sp.path}/old-copy.csv')..writeAsStringSync('x');
    oldCopy.setLastModifiedSync(
      DateTime.now().subtract(const Duration(hours: 2)),
    );
    final dest = build(
      ({required path, required mimeType, required filename}) async =>
          ShareResultStatus.success,
    );
    await dest.write(
      filename: 'n.csv',
      mimeType: 'text/csv',
      bytes: Uint8List(1),
    );
    expect(old.existsSync(), isFalse);
    expect(oldCopy.existsSync(), isFalse);
    expect(fresh.existsSync(), isTrue);
  });

  test('only the leaf of the filename is used (no path traversal)', () async {
    String? seen;
    final dest = build(({
      required path,
      required mimeType,
      required filename,
    }) async {
      seen = path;
      return ShareResultStatus.success;
    });
    await dest.write(
      filename: '../../evil.csv',
      mimeType: 'text/csv',
      bytes: Uint8List(1),
    );
    expect(seen, '${exportDir().path}/evil.csv');
    await expectLater(
      dest.write(filename: '..', mimeType: 'x', bytes: Uint8List(1)),
      throwsArgumentError,
    );
  });
}
