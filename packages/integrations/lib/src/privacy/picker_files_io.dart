// Clean-up of the files `image_picker` leaves behind (privacy audit PV3).
//
// The picker writes the photo it returns to the app's temp / cache directory
// and never deletes it. WHICH directory depends on the platform:
//   * Android: `getCacheDir()` = path_provider's `getTemporaryDirectory()`:
//     `{cache}/{uuid}<n>.jpg` (camera), `{cache}/scaled_<name>` (downscaled
//     copy), `{cache}/{uuid}/<name>` (gallery copy);
//   * iOS: `NSTemporaryDirectory()` = dart:io's `Directory.systemTemp`
//     (`tmp/image_picker_<guid>.<ext>`), NOT the Caches directory that
//     `getTemporaryDirectory()` returns there.
// So every function here works over a LIST of roots ([pickerRoots]: both
// directories, de-duplicated; tests inject fake ones).
//
// Those files are unencrypted plate photos (the Android camera original may
// carry EXIF/GPS). So the app deletes the file it was handed as soon as the
// bytes are read ([deletePickerFile]), purges leftovers older than an hour at
// start ([purgeStalePickerFiles]) and "Erase all local data" removes all of
// them ([purgeAllPickerFiles]).
//
// Only names the plugin is known to produce are touched, and only when they
// look like an image: `image_picker*`, `scaled_*` and `<uuid><n>` with an
// image extension, and uuid directories that hold nothing but image files
// (checked against image_picker_android / image_picker_ios 0.8.13). Anything
// else in the cache is left alone. Every function is best-effort and never
// throws; clocks and roots are parameters so tests use temp directories.

import 'dart:io';

import 'package:path_provider/path_provider.dart';

const String _imageExt = r'\.(jpe?g|png|webp|heic|heif|gif)';

final RegExp _uuid = RegExp(
  r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  caseSensitive: false,
);

/// File names the plugin produces directly in a root.
final RegExp pickerFileName = RegExp(
  '^(image_picker.*|scaled_.*|${_uuid.pattern}[0-9]*)$_imageExt\$',
  caseSensitive: false,
);

final RegExp _imageFile = RegExp('$_imageExt\$', caseSensitive: false);

/// The per-pick sub-directory the Android gallery copy lives in.
final RegExp _pickerDirName = RegExp(
  '^${_uuid.pattern}\$',
  caseSensitive: false,
);

String _base(FileSystemEntity e) =>
    e.uri.pathSegments.where((s) => s.isNotEmpty).last;

/// Where the plugin may have written: the platform cache directory
/// (Android) and `Directory.systemTemp` (iOS `NSTemporaryDirectory()`).
Future<List<String>> pickerRoots() async {
  final roots = <String>{Directory.systemTemp.path};
  try {
    roots.add((await getTemporaryDirectory()).path);
  } on Object {
    // No path_provider (tests): systemTemp alone.
  }
  return roots.toList();
}

/// Delete the file at [path] (the file `pickImage` returned). Best effort.
Future<void> deletePickerFile(String path) async {
  try {
    final file = File(path);
    if (file.existsSync()) await file.delete();
    // Android gallery copies live in `{cache}/{uuid}/`: drop the then-empty
    // directory too.
    final parent = file.parent;
    if (_pickerDirName.hasMatch(_base(parent)) &&
        parent.existsSync() &&
        parent.listSync().isEmpty) {
      await parent.delete();
    }
  } on Object {
    // Best effort; the start-up purge and the eraser are the backstops.
  }
}

/// Delete picker files in [roots] (default [pickerRoots]) last modified more
/// than [olderThan] before [now] (all of them when [olderThan] is `null`).
/// Returns how many entries were removed.
Future<int> purgePickerFiles({
  List<String>? roots,
  Duration? olderThan,
  DateTime Function()? now,
}) async {
  var removed = 0;
  final cutoff = olderThan == null
      ? null
      : (now ?? DateTime.now)().subtract(olderThan);
  bool staleFile(FileSystemEntity e) {
    if (cutoff == null) return true;
    try {
      return e.statSync().modified.isBefore(cutoff);
    } on Object {
      return false;
    }
  }

  // A uuid directory counts only if it holds NOTHING but image files, and is
  // stale when all of them are (a directory's own mtime says little). An
  // empty one is judged by its own time.
  bool pickerDirectory(Directory d) {
    final entries = d.listSync(recursive: true, followLinks: false);
    return entries.every((e) => e is File && _imageFile.hasMatch(_base(e)));
  }

  bool staleDir(Directory d) {
    if (cutoff == null) return true;
    final files = d
        .listSync(recursive: true, followLinks: false)
        .whereType<File>();
    return files.isEmpty ? staleFile(d) : files.every(staleFile);
  }

  for (final root in roots ?? await pickerRoots()) {
    try {
      final dir = Directory(root);
      if (!dir.existsSync()) continue;
      await for (final entity in dir.list(followLinks: false)) {
        final name = _base(entity);
        try {
          if (entity is File &&
              pickerFileName.hasMatch(name) &&
              staleFile(entity)) {
            await entity.delete();
            removed++;
          } else if (entity is Directory &&
              _pickerDirName.hasMatch(name) &&
              pickerDirectory(entity) &&
              staleDir(entity)) {
            await entity.delete(recursive: true);
            removed++;
          }
        } on Object {
          // Skip this one; carry on with the rest.
        }
      }
    } on Object {
      // Unreadable root: nothing to purge there.
    }
  }
  return removed;
}

/// Start-up clean-up: picker files older than [age] (one hour by default, so
/// a photo that is being taken right now is never touched).
Future<int> purgeStalePickerFiles({
  List<String>? roots,
  Duration age = const Duration(hours: 1),
  DateTime Function()? now,
}) => purgePickerFiles(roots: roots, olderThan: age, now: now);

/// Erase-all clean-up: every picker file, whatever its age.
Future<int> purgeAllPickerFiles({List<String>? roots}) =>
    purgePickerFiles(roots: roots);
