// Web (no file system): `image_picker` hands out in-memory blobs, so there is
// nothing to delete. Same API as `picker_files_io.dart`.

Future<List<String>> pickerRoots() async => const <String>[];

Future<void> deletePickerFile(String path) async {}

Future<int> purgePickerFiles({
  List<String>? roots,
  Duration? olderThan,
  DateTime Function()? now,
}) async => 0;

Future<int> purgeStalePickerFiles({
  List<String>? roots,
  Duration age = const Duration(hours: 1),
  DateTime Function()? now,
}) async => 0;

Future<int> purgeAllPickerFiles({List<String>? roots}) async => 0;
