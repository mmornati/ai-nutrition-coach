// The camera permission is requested before image_picker opens the camera
// (Android throws a SecurityException otherwise); a refusal is the calm
// `null` path and never reaches the picker.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:integrations/integrations.dart' show deletePickerFile;
import 'package:openplate_client/state/photo_provider.dart';
import 'package:openplate_client/state/scanner_provider.dart';

class _RecordingPicker extends ImagePicker {
  int calls = 0;

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    calls++;
    return XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'p.jpg');
  }
}

void main() {
  for (final status in [
    CameraPermissionStatus.denied,
    CameraPermissionStatus.unavailable,
  ]) {
    test('$status: no picker, calm null', () async {
      final picker = _RecordingPicker();
      final permission = FakeCameraPermission(status);
      final capture = ImagePickerPhotoCapture(
        picker: picker,
        permission: permission,
      );
      expect(await capture.capture(), isNull);
      expect(permission.requestCount, 1);
      expect(picker.calls, 0);
    });
  }

  test('granted: picker opens and bytes come back', () async {
    final picker = _RecordingPicker();
    final permission = FakeCameraPermission();
    final capture = ImagePickerPhotoCapture(
      picker: picker,
      permission: permission,
    );
    expect(await capture.capture(), [1, 2, 3]);
    expect(permission.requestCount, 1);
    expect(picker.calls, 1);
  });

  group('PV3: the picker\'s temp file does not outlive the capture', () {
    late Directory tmp;
    setUp(() => tmp = Directory.systemTemp.createTempSync('openplate_cap_'));
    tearDown(() => tmp.deleteSync(recursive: true));

    ImagePickerPhotoCapture capture(ImagePicker picker, {List<String>? seen}) =>
        ImagePickerPhotoCapture(
          picker: picker,
          permission: FakeCameraPermission(),
          deleteFile: (path) async {
            seen?.add(path);
            await deletePickerFile(path);
          },
        );

    test('the file is deleted once the bytes are read', () async {
      final file = File('${tmp.path}/image_picker_1.jpg')
        ..writeAsBytesSync([9, 8, 7]);
      final seen = <String>[];
      final bytes = await capture(_FilePicker(file.path), seen: seen).capture();
      expect(bytes, [9, 8, 7]);
      expect(seen, [file.path]);
      expect(file.existsSync(), isFalse);
    });

    test('and also when reading it fails', () async {
      final seen = <String>[];
      await expectLater(
        capture(_FilePicker('${tmp.path}/vanished.jpg'), seen: seen).capture(),
        throwsA(anything),
      );
      expect(seen, ['${tmp.path}/vanished.jpg'], reason: 'still cleaned up');
    });

    test('a cancelled capture has nothing to delete', () async {
      final seen = <String>[];
      expect(await capture(_CancelPicker(), seen: seen).capture(), isNull);
      expect(seen, isEmpty);
    });
  });
}

class _FilePicker extends ImagePicker {
  _FilePicker(this.path);
  final String path;

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => XFile(path);
}

class _CancelPicker extends ImagePicker {
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => null;
}
