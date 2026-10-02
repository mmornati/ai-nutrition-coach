import 'dart:io';

/// The workspace root: the nearest ancestor whose pubspec declares
/// `workspace:`, so tests work whatever directory they are run from.
Directory repoRoot() {
  var dir = Directory.current.absolute;
  while (true) {
    final pubspec = File('${dir.path}/pubspec.yaml');
    if (pubspec.existsSync() &&
        pubspec.readAsStringSync().contains(
          RegExp(r'^workspace:', multiLine: true),
        )) {
      return dir;
    }
    final parent = dir.parent;
    if (parent.path == dir.path) {
      throw StateError('workspace root not found from ${Directory.current}');
    }
    dir = parent;
  }
}
