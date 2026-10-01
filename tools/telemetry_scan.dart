// AST-based network-use scanner behind `tools/check_telemetry_claims.dart`
// and `packages/integrations/test/no_telemetry_test.dart` (N6).
//
// The first version of the gate grepped for call-site strings (`dio.get`,
// `http.post`, ...), which is trivially bypassed. This scanner parses every
// shipped Dart file with `package:analyzer` and works from what a file
// *declares it uses*, because a file cannot reach the network without a
// transport:
//
//   * EVERY directive URI is read, including the extra URIs of conditional
//     imports/exports (`import 'a.dart' if (dart.library.io) 'package:dio/..')`;
//   * a networking package, `dart:io` + a socket class, `package:web` /
//     `dart:js_interop` + a browser network API (`fetch`, XHR, WebSocket,
//     EventSource, sendBeacon, script injection), or legacy `dart:html`;
//   * any `export` of a transport (a barrel that re-exports `dart:io`, `dio`,
//     ...) is a finding even if the barrel itself calls nothing;
//   * `part` files are merged with their library, so a part cannot hide a
//     socket call from the library's imports;
//   * `Image.network` / `NetworkImage` / `NetworkAssetBundle` are flagged
//     regardless of imports (Flutter ships them in `package:flutter`);
//   * telemetry / analytics / crash-reporting SDKs are matched by package-name
//     PREFIX (`firebase_*`, `sentry*`, ...), everywhere, never allow-listed.
//
// A transport is only permitted in the explicit adapter files in
// [networkAdapterAllowList]: the user-enabled paths documented in
// docs/telemetry-posture.md.

/// Pure functions over (path, source) so the scanner is unit-testable, plus
/// [scanRepo] which walks a checkout.
library;

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

/// Files allowed to use a network transport. Each is a user-initiated path.
const Set<String> networkAdapterAllowList = {
  // Barcode lookup against world.openfoodfacts.org (user taps "scan").
  'packages/integrations/lib/src/catalog/off_barcode_source.dart',
  // BYOK OpenAI-compatible endpoint the user configures.
  'packages/integrations/lib/src/ai/openai_compatible_byok_provider.dart',
  // Shared size-capped response reader used by the two adapters above.
  'packages/integrations/lib/src/net/capped_response.dart',
};

/// Package names that are network transports (exact).
const List<String> networkPackages = [
  'dio',
  'http',
  'http2',
  'web_socket_channel',
  'web_socket',
  'grpc',
  'universal_html',
  'universal_io',
  'cronet_http',
  'cupertino_http',
  'fetch_client',
  'socket_io_client',
  'retrofit',
  'chopper',
  'flutter_inappwebview',
  'webview_flutter',
];

/// Package-name PREFIXES of telemetry / analytics / crash-reporting SDKs.
const List<String> telemetryPackagePrefixes = [
  'firebase',
  'sentry',
  'crashlytics',
  'amplitude',
  'mixpanel',
  'posthog',
  'segment',
  'datadog',
  'bugsnag',
  'appsflyer',
  'matomo',
  'appcenter',
  'countly',
  'bugfender',
  'logrocket',
  'instabug',
  'onesignal',
  'rollbar',
  'raygun',
  'newrelic',
  'smartlook',
  'google_analytics',
  'facebook_app_events',
  'adjust_sdk',
  'branch_sdk',
  'braze',
  'uxcam',
  'flutter_segment',
  'plausible',
  'umami',
];

const Set<String> _ioSocketApi = {
  'HttpClient',
  'HttpServer',
  'HttpOverrides',
  'WebSocket',
  'RawSocket',
  'SecureSocket',
  'ServerSocket',
  'RawServerSocket',
  'Socket',
  'RawDatagramSocket',
};

const Set<String> _browserNetworkApi = {
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'RTCPeerConnection',
  'WebTransport',
  'HTMLScriptElement',
  'importScripts',
  'fetch',
  'sendBeacon',
};

/// Flutter's own network-loading widgets/bundles: no import betrays them.
const Set<String> _flutterNetworkApi = {'NetworkImage', 'NetworkAssetBundle'};

/// One violation: [path]:[line] — [message].
class Finding {
  const Finding(this.path, this.line, this.message);
  final String path;
  final int line;
  final String message;

  @override
  String toString() => '$path:$line: $message';
}

/// The package name of a `package:` URI, or null.
String? _packageName(String uri) {
  if (!uri.startsWith('package:')) return null;
  return uri.substring('package:'.length).split('/').first;
}

bool isTelemetryPackage(String name) =>
    telemetryPackagePrefixes.any(name.startsWith);

bool isNetworkPackage(String name) => networkPackages.contains(name);

bool _isWebLibrary(String uri) =>
    uri.startsWith('package:web/') ||
    uri == 'dart:js_interop' ||
    uri == 'dart:js_interop_unsafe';

bool _isLegacyBrowserLibrary(String uri) =>
    uri == 'dart:html' ||
    uri == 'dart:js' ||
    uri == 'dart:js_util' ||
    uri == 'dart:indexed_db' ||
    uri == 'dart:web_sql';

/// Whether re-exporting [uri] re-exports a transport.
bool _isTransportUri(String uri) {
  final pkg = _packageName(uri);
  return uri == 'dart:io' ||
      _isLegacyBrowserLibrary(uri) ||
      uri.startsWith('package:web/') ||
      (pkg != null && (isNetworkPackage(pkg) || isTelemetryPackage(pkg)));
}

/// Every URI a directive names: the primary one plus each branch of a
/// conditional import/export.
List<String> _directiveUris(NamespaceDirective d) => [
  ?d.uri.stringValue,
  for (final c in d.configurations) ?c.uri.stringValue,
];

class _UsageVisitor extends RecursiveAstVisitor<void> {
  _UsageVisitor(this.unit);
  final CompilationUnit unit;

  /// name -> first line seen.
  final Map<String, int> identifiers = {};

  /// string literal values -> first line.
  final Map<String, int> strings = {};

  /// `X.network(...)` invocations.
  final List<int> networkCalls = [];

  int _line(AstNode n) => unit.lineInfo.getLocation(n.offset).lineNumber;

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    identifiers.putIfAbsent(node.name, () => _line(node));
    super.visitSimpleIdentifier(node);
  }

  @override
  void visitNamedType(NamedType node) {
    identifiers.putIfAbsent(node.name.lexeme, () => _line(node));
    super.visitNamedType(node);
  }

  @override
  void visitSimpleStringLiteral(SimpleStringLiteral node) {
    strings.putIfAbsent(node.value, () => _line(node));
    super.visitSimpleStringLiteral(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (node.methodName.name == 'network' && node.target != null) {
      networkCalls.add(_line(node));
    }
    super.visitMethodInvocation(node);
  }

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    // Resolved-form `Image.network(...)`.
    if (node.constructorName.name?.name == 'network') {
      networkCalls.add(_line(node));
    }
    super.visitInstanceCreationExpression(node);
  }
}

/// Scans one Dart library: [source] at repo-relative [path], plus the sources
/// of its `part` files ([partSources], keyed by part path) which are merged
/// with the library (they share its imports).
///
/// [allowListed] says whether [path] is a sanctioned network adapter.
List<Finding> scanSource(
  String path,
  String source, {
  required bool allowListed,
  Map<String, String> partSources = const {},
}) {
  final findings = <Finding>[];
  final unit = parseString(content: source, throwIfDiagnostics: false).unit;

  var usesIo = false;
  var usesWebLib = false;
  var ioLine = 0;
  var webLine = 0;

  for (final directive in unit.directives) {
    if (directive is! NamespaceDirective) continue;
    final isExport = directive is ExportDirective;
    final line = unit.lineInfo.getLocation(directive.offset).lineNumber;
    for (final uri in _directiveUris(directive)) {
      final pkg = _packageName(uri);
      if (pkg != null && isTelemetryPackage(pkg)) {
        findings.add(
          Finding(
            path,
            line,
            'telemetry SDK ${isExport ? 'export' : 'import'}: $uri',
          ),
        );
        continue;
      }
      if (isExport && _isTransportUri(uri) && !allowListed) {
        findings.add(
          Finding(
            path,
            line,
            'export of a transport ($uri) re-exports network capability',
          ),
        );
        continue;
      }
      if (pkg != null && isNetworkPackage(pkg)) {
        if (!allowListed) {
          findings.add(Finding(path, line, 'network package import: $uri'));
        }
      } else if (_isLegacyBrowserLibrary(uri)) {
        findings.add(
          Finding(path, line, 'legacy browser library $uri (use package:web)'),
        );
      } else if (uri == 'dart:io') {
        usesIo = true;
        ioLine = line;
      } else if (_isWebLibrary(uri)) {
        usesWebLib = true;
        webLine = webLine == 0 ? line : webLine;
      }
    }
  }

  // Usage analysis over the library AND its part files (merged).
  final units = <(String, CompilationUnit)>[
    (path, unit),
    for (final e in partSources.entries)
      (e.key, parseString(content: e.value, throwIfDiagnostics: false).unit),
  ];
  for (final (unitPath, u) in units) {
    final v = _UsageVisitor(u);
    u.accept(v);
    if (usesIo && !allowListed) {
      for (final name in _ioSocketApi) {
        final line = v.identifiers[name];
        if (line != null) {
          findings.add(
            Finding(
              unitPath,
              line,
              'dart:io (imported at $path:$ioLine) used with socket API $name',
            ),
          );
        }
      }
    }
    if (usesWebLib && !allowListed) {
      for (final name in _browserNetworkApi) {
        final line = v.identifiers[name] ?? v.strings[name];
        if (line != null) {
          findings.add(
            Finding(
              unitPath,
              line,
              'browser interop (imported at $path:$webLine) used with network API "$name"',
            ),
          );
        }
      }
    }
    // Flutter's built-in network loaders need no import of their own.
    for (final name in _flutterNetworkApi) {
      final line = v.identifiers[name];
      if (line != null && !allowListed) {
        findings.add(Finding(unitPath, line, 'Flutter network loader $name'));
      }
    }
    if (!allowListed) {
      for (final line in v.networkCalls) {
        findings.add(
          Finding(unitPath, line, 'Image.network-style `.network(...)` call'),
        );
      }
    }
  }
  return findings;
}

/// Package names declared under `dependencies:` / `dev_dependencies:` /
/// `dependency_overrides:` in a pubspec.
List<String> pubspecDependencies(String pubspec) {
  final names = <String>[];
  var inDeps = false;
  for (final raw in pubspec.split('\n')) {
    final line = raw.replaceFirst(RegExp(r'\s+#.*$'), '');
    if (RegExp(r'^\S').hasMatch(line)) {
      inDeps = RegExp(
        r'^(dependencies|dev_dependencies|dependency_overrides):',
      ).hasMatch(line);
      continue;
    }
    if (!inDeps) continue;
    final m = RegExp(r'^  ([A-Za-z0-9_]+):').firstMatch(line);
    if (m != null) names.add(m[1]!);
  }
  return names;
}

/// pubspec findings: telemetry SDKs (by prefix) anywhere; network packages
/// only in `packages/integrations/pubspec.yaml`.
List<Finding> scanPubspec(String path, String pubspec) {
  final findings = <Finding>[];
  final isIntegrations = path == 'packages/integrations/pubspec.yaml';
  for (final dep in pubspecDependencies(pubspec)) {
    if (isTelemetryPackage(dep)) {
      findings.add(Finding(path, 1, 'telemetry SDK dependency: $dep'));
    } else if (isNetworkPackage(dep) && !isIntegrations) {
      findings.add(
        Finding(
          path,
          1,
          'network package dependency outside integrations: $dep',
        ),
      );
    }
  }
  return findings;
}

/// Whether [path] (repo-relative, `/`-separated) is shipped production code.
bool isProductionDart(String path) {
  if (!path.endsWith('.dart')) return false;
  if (path.endsWith('.g.dart')) return false;
  if (!(path.startsWith('apps/') || path.startsWith('packages/'))) return false;
  const skip = ['/test/', '/integration_test/', '/.dart_tool/', '/build/'];
  return !skip.any(path.contains);
}

/// Scans a checkout rooted at [root]: every shipped Dart library (with its
/// parts merged) and every pubspec under `apps/` + `packages/`.
List<Finding> scanRepo(Directory root) {
  final findings = <Finding>[];
  String rel(String abs) =>
      abs.substring(root.path.length + 1).replaceAll(r'\', '/');

  for (final top in ['apps', 'packages']) {
    final dir = Directory('${root.path}/$top');
    if (!dir.existsSync()) continue;
    for (final entity in dir.listSync(recursive: true, followLinks: false)) {
      if (entity is! File) continue;
      final path = rel(entity.path);
      if (path.endsWith('/pubspec.yaml') &&
          !path.contains('/.dart_tool/') &&
          !path.contains('/build/')) {
        findings.addAll(scanPubspec(path, entity.readAsStringSync()));
        continue;
      }
      if (!isProductionDart(path)) continue;
      final source = entity.readAsStringSync();
      final unit = parseString(content: source, throwIfDiagnostics: false).unit;
      // A part file is scanned together with its owning library.
      if (unit.directives.any((d) => d is PartOfDirective)) continue;
      final parts = <String, String>{};
      for (final d in unit.directives.whereType<PartDirective>()) {
        final uri = d.uri.stringValue;
        if (uri == null) continue;
        final partFile = File(Uri.file(entity.path).resolve(uri).toFilePath());
        if (partFile.existsSync()) {
          parts[rel(partFile.path)] = partFile.readAsStringSync();
        }
      }
      findings.addAll(
        scanSource(
          path,
          source,
          allowListed: networkAdapterAllowList.contains(path),
          partSources: parts,
        ),
      );
    }
  }
  return findings;
}
