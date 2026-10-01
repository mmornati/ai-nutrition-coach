// The camera permission is requested before image_picker opens the camera
// (Android throws a SecurityException otherwise); a refusal is the calm
// `null` path and never reaches the picker.

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
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
}
