// tools/generate_precache_manifest.dart — the build step that turns a Flutter
// web release bundle into an offline-capable one (ADR-0003).
//
//   dart run tools/generate_precache_manifest.dart [<web-dir>] [--build-id <id>]
//
// Run on `apps/client/build/web` (the default) AFTER `flutter build web
// --pwa-strategy=none`; `melos run build:web` and `infra/Dockerfile` do it.
// It writes two files next to `index.html`:
//
//   precache-manifest.json   { buildId, files: [ { url, sha256, size } ] }
//   sw.js                    tools/pwa/sw.template.js with the build id baked
//                            in, so the worker's BYTES change whenever any
//                            shipped file changes -- that is what makes the
//                            browser notice a new version.
//
// Both are generated, never committed. The service worker precaches exactly
// the manifest's files (verifying each SHA-256), under a cache named after the
// build id.
//
// What is precached: every file the app needs to BOOT and run offline
// (index.html, flutter.js, flutter_bootstrap.js, main.dart.js, manifest, icons,
// assets/, fallback fonts, the versioned sqlite3mc wasm, the self-hosted zxing
// decoder, and the CanvasKit builds a browser can pick). Not precached:
// skwasm* / wimp* / experimental_webparagraph (never used without
// cross-origin isolation, which the CSP does not grant), debug symbol maps,
// source maps, `version.json`, Flutter's own (deprecated) service worker, and
// the two generated files themselves.
//
// The build id is a hash of the file list + hashes (deterministic: the same
// bundle always gets the same id) unless `--build-id` / OPENPLATE_BUILD_ID is
// given -- the way to force "a new version" in a test.

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

/// One precached file.
class PrecacheEntry {
  const PrecacheEntry({
    required this.url,
    required this.sha256,
    required this.size,
  });

  /// Path relative to the web root, `/`-separated, no leading slash.
  final String url;
  final String sha256;
  final int size;

  Map<String, Object> toJson() => {'url': url, 'sha256': sha256, 'size': size};
}

/// Files the generator writes itself (never listed in the manifest).
const Set<String> kGeneratedFiles = {'sw.js', 'precache-manifest.json'};

final RegExp _validBuildId = RegExp(r'^[A-Za-z0-9._-]{1,64}$');

/// True when [path] (relative, `/`-separated) must NOT be precached.
bool isExcludedFromPrecache(String path) {
  if (kGeneratedFiles.contains(path)) return true;
  if (path == 'flutter_service_worker.js' || path == 'version.json') {
    return true;
  }
  if (path.startsWith('.') || path.contains('/.')) return true;
  if (path.endsWith('.symbols') || path.endsWith('.map')) return true;
  if (path.startsWith('canvaskit/')) {
    final rest = path.substring('canvaskit/'.length);
    if (rest.startsWith('skwasm') ||
        rest.startsWith('wimp') ||
        rest.startsWith('experimental_webparagraph')) {
      return true;
    }
  }
  return false;
}

/// Every precacheable file under [webDir], sorted by url.
List<PrecacheEntry> collectPrecacheEntries(Directory webDir) {
  final root = webDir.absolute.path;
  final entries = <PrecacheEntry>[];
  for (final entity in webDir.listSync(recursive: true, followLinks: false)) {
    if (entity is! File) continue;
    var rel = entity.absolute.path.substring(root.length);
    rel = rel.replaceAll(Platform.pathSeparator, '/');
    if (rel.startsWith('/')) rel = rel.substring(1);
    if (isExcludedFromPrecache(rel)) continue;
    final bytes = entity.readAsBytesSync();
    entries.add(
      PrecacheEntry(
        url: rel,
        sha256: sha256.convert(bytes).toString(),
        size: bytes.length,
      ),
    );
  }
  entries.sort((a, b) => a.url.compareTo(b.url));
  return entries;
}

/// The files the app cannot boot without; a bundle missing one is broken and
/// the generator refuses to produce a service worker for it.
const List<String> kRequiredPrecacheFiles = [
  'index.html',
  'flutter.js',
  'flutter_bootstrap.js',
  'main.dart.js',
  'manifest.json',
];

/// Missing required files (empty = fine).
List<String> missingRequiredFiles(List<PrecacheEntry> entries) {
  final have = {for (final e in entries) e.url};
  return [
    for (final required in kRequiredPrecacheFiles)
      if (!have.contains(required)) required,
  ];
}

/// A deterministic id of this exact set of files.
String computeBuildId(List<PrecacheEntry> entries) {
  final sorted = [...entries]..sort((a, b) => a.url.compareTo(b.url));
  final text = [for (final e in sorted) '${e.url}:${e.sha256}'].join('\n');
  return sha256.convert(utf8.encode(text)).toString().substring(0, 16);
}

/// The manifest document.
String renderManifest(String buildId, List<PrecacheEntry> entries) {
  const encoder = JsonEncoder.withIndent('  ');
  return '${encoder.convert({
    'buildId': buildId,
    'files': [for (final e in entries) e.toJson()],
  })}\n';
}

/// The service worker source for [buildId].
String renderServiceWorker(String template, String buildId) {
  if (!_validBuildId.hasMatch(buildId)) {
    throw ArgumentError.value(buildId, 'buildId', 'must match $_validBuildId');
  }
  if (!template.contains('__OPENPLATE_BUILD_ID__')) {
    throw StateError('the service worker template has no build-id marker');
  }
  return template.replaceAll('__OPENPLATE_BUILD_ID__', buildId);
}

/// Generates `precache-manifest.json` and `sw.js` into [webDir]. Returns the
/// build id. Throws [StateError] on a bundle that cannot boot.
String generate({
  required Directory webDir,
  required String template,
  String? buildIdOverride,
}) {
  if (!webDir.existsSync()) {
    throw StateError(
      '${webDir.path} does not exist - build the web bundle first.',
    );
  }
  final entries = collectPrecacheEntries(webDir);
  final missing = missingRequiredFiles(entries);
  if (missing.isNotEmpty) {
    throw StateError('the bundle lacks ${missing.join(', ')}');
  }
  final buildId = buildIdOverride ?? computeBuildId(entries);
  final sw = renderServiceWorker(template, buildId);
  File(
    '${webDir.path}/precache-manifest.json',
  ).writeAsStringSync(renderManifest(buildId, entries));
  File('${webDir.path}/sw.js').writeAsStringSync(sw);
  return buildId;
}

void main(List<String> args) {
  String? webPath;
  String? buildId = Platform.environment['OPENPLATE_BUILD_ID'];
  for (var i = 0; i < args.length; i++) {
    if (args[i] == '--build-id' && i + 1 < args.length) {
      buildId = args[++i];
    } else if (args[i].startsWith('-')) {
      stderr.writeln(
        'usage: generate_precache_manifest.dart [<web-dir>] [--build-id <id>]',
      );
      exit(2);
    } else {
      webPath = args[i];
    }
  }
  if (buildId != null && buildId.isEmpty) buildId = null;
  final webDir = Directory(webPath ?? 'apps/client/build/web');
  final templateFile = File('tools/pwa/sw.template.js');
  if (!templateFile.existsSync()) {
    stderr.writeln(
      'run from the repository root (tools/pwa/sw.template.js not found)',
    );
    exit(2);
  }
  try {
    final id = generate(
      webDir: webDir,
      template: templateFile.readAsStringSync(),
      buildIdOverride: buildId,
    );
    final count = collectPrecacheEntries(webDir).length;
    stdout.writeln(
      'precache: $count files, build id $id -> ${webDir.path}/sw.js',
    );
  } on Object catch (e) {
    stderr.writeln('precache: FAIL - $e');
    exit(1);
  }
}
