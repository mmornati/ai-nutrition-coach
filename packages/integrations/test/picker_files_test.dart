// Clean-up of the files image_picker leaves behind (privacy audit PV3).
// Runs against a real temporary directory with an injected clock.

import 'dart:io';

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

const _uuid = '123e4567-e89b-12d3-a456-426614174000';

void main() {
  late Directory tmp;
  final now = DateTime.utc(2026, 10, 12, 12);

  File put(String rel, {Duration age = Duration.zero}) {
    final f = File('${tmp.path}/$rel')..createSync(recursive: true);
    f.writeAsStringSync('photo');
    f.setLastModifiedSync(now.subtract(age));
    return f;
  }

  setUp(
    () =>
        tmp = Directory.systemTemp.createTempSync('ai_nutrition_coach_picker_'),
  );
  tearDown(() => tmp.deleteSync(recursive: true));

  group('deletePickerFile', () {
    test('removes the file the picker handed out', () async {
      final f = put('${_uuid}1234.jpg');
      await deletePickerFile(f.path);
      expect(f.existsSync(), isFalse);
    });

    test(
      'removes an Android gallery copy and its now-empty uuid folder',
      () async {
        final f = put('$_uuid/IMG_0001.jpg');
        await deletePickerFile(f.path);
        expect(f.existsSync(), isFalse);
        expect(Directory('${tmp.path}/$_uuid').existsSync(), isFalse);
      },
    );

    test('a missing file or path is a quiet no-op', () async {
      await deletePickerFile('${tmp.path}/nope.jpg');
      await deletePickerFile('');
    });
  });

  group('purgeStalePickerFiles', () {
    test('removes picker files older than an hour, keeps fresh ones', () async {
      final oldCamera = put('${_uuid}99.jpg', age: const Duration(hours: 2));
      final oldScaled = put(
        'scaled_image_picker1.jpg',
        age: const Duration(hours: 3),
      );
      final oldIos = put('image_picker_ABC.png', age: const Duration(days: 1));
      final oldGallery = put('$_uuid/IMG.jpg', age: const Duration(hours: 5));
      final fresh = put(
        'image_picker_NEW.jpg',
        age: const Duration(minutes: 5),
      );

      final removed = await purgeStalePickerFiles(
        roots: [tmp.path],
        now: () => now,
      );

      expect(removed, 4);
      expect(oldCamera.existsSync(), isFalse);
      expect(oldScaled.existsSync(), isFalse);
      expect(oldIos.existsSync(), isFalse);
      expect(oldGallery.existsSync(), isFalse);
      expect(Directory('${tmp.path}/$_uuid').existsSync(), isFalse);
      expect(fresh.existsSync(), isTrue, reason: 'may be in use right now');
    });

    test('never touches files that are not the picker\'s', () async {
      final other = [
        put(
          'ai_nutrition_coach_exports/2026-10-12-ai-nutrition-coach.csv',
          age: const Duration(days: 9),
        ),
        put('share_plus/x.csv', age: const Duration(days: 9)),
        put('some_other_cache.bin', age: const Duration(days: 9)),
        put('notes.jpg', age: const Duration(days: 9)),
      ];
      await purgeStalePickerFiles(roots: [tmp.path], now: () => now);
      for (final f in other) {
        expect(f.existsSync(), isTrue, reason: f.path);
      }
    });

    test('a missing temp directory is fine', () async {
      expect(await purgeStalePickerFiles(roots: ['${tmp.path}/absent']), 0);
    });
  });

  group('purgeAllPickerFiles (erase all local data)', () {
    test('removes every picker file regardless of age', () async {
      final fresh = put('image_picker_NEW.jpg');
      final gallery = put('$_uuid/IMG.jpg');
      final keep = put('keep.txt');
      expect(await purgeAllPickerFiles(roots: [tmp.path]), 2);
      expect(fresh.existsSync(), isFalse);
      expect(gallery.existsSync(), isFalse);
      expect(keep.existsSync(), isTrue);
    });
  });

  group('two roots: Android cache and iOS NSTemporaryDirectory (M1)', () {
    test('both are purged; the same root twice is fine', () async {
      final ios = Directory('${tmp.path}/ios')..createSync();
      final a = put('image_picker_A.jpg');
      final b = File('${ios.path}/image_picker_GUID.heic')
        ..writeAsStringSync('photo');
      expect(
        await purgeAllPickerFiles(roots: [tmp.path, ios.path, ios.path]),
        2,
      );
      expect(a.existsSync(), isFalse);
      expect(b.existsSync(), isFalse);
    });

    test('the default roots include Directory.systemTemp', () async {
      expect(await pickerRoots(), contains(Directory.systemTemp.path));
    });
  });

  group('only what the plugin writes (L4)', () {
    test('names without an image extension are left alone', () async {
      final keep = [
        put('scaled_notes.txt'),
        put('scaled_data'),
        put('image_picker_cache.db'),
        put('${_uuid}1234.bin'),
        put('image_picker_x.jpg.bak'),
      ];
      expect(await purgeAllPickerFiles(roots: [tmp.path]), 0);
      for (final f in keep) {
        expect(f.existsSync(), isTrue, reason: f.path);
      }
    });

    test(
      'a uuid directory with anything but image files is left intact',
      () async {
        final doc = put('$_uuid/notes.txt');
        final img = put('$_uuid/IMG.jpg');
        final nested = put('${_uuid.replaceFirst('1', '2')}/sub/IMG.jpg');
        expect(await purgeAllPickerFiles(roots: [tmp.path]), 0);
        expect(doc.existsSync(), isTrue);
        expect(img.existsSync(), isTrue);
        expect(nested.existsSync(), isTrue, reason: 'the plugin never nests');
      },
    );
  });
}
