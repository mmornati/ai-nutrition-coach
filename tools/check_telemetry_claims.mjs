#!/usr/bin/env node
// Telemetry gate, ported from tools/check_telemetry_claims.dart + telemetry_scan.dart (FR-12).
//
//   node tools/check_telemetry_claims.mjs
//
// The no-telemetry invariant, enforced from the PARSED program (TypeScript compiler API), not
// from call-site strings:
//
//   1. No shipped file (apps/web/src, packages/core/src, the service workers) uses a network
//      transport unless it is in the explicit adapter allow-list below: `fetch` (bare or via
//      globalThis/window/self), XMLHttpRequest, WebSocket, EventSource, WebTransport,
//      RTCPeerConnection, importScripts, navigator.sendBeacon, a network package import, a value
//      import of the capped-fetch helper, `<script>` injection (createElement('script'), JSX
//      <script>), import() of anything but a literal module path, and a Worker/SharedWorker
//      whose URL is not `new URL('<relative literal>', import.meta.url)`.
//   2. No analytics / crash-reporting SDK (matched by PREFIX, never allow-listable) is imported or
//      declared in any package.json, nor resolved in pnpm-lock.yaml.
//   3. Network packages are declared nowhere: the adapters use the platform `fetch` through the
//      capped-fetch helper, so there is no adapter package that may carry one.
//   4. Every allow-listed file still exists AND still needs each allowance it holds (a stale list
//      silently widens the gate).
//   5. Every doc that claims "no telemetry" is anchored to this gate.
//
// Complemented by the built-bundle host scan (tools/check_no_external_hosts.sh) and the
// container egress test (scripts/smoke_self_host.sh).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLOBAL_OBJECTS,
  declaredDependencies,
  inTypePosition,
  isReference,
  lineOf,
  packageJsonFiles,
  parse,
  rel,
  shippedFiles,
  stringValue,
  ts,
  walkNodes,
} from './gates/shared.mjs';

/**
 * Files allowed a capability. Each is a user-initiated or same-origin path, documented in
 * docs/telemetry-posture.md. `kinds`: network | script | dynamic-import.
 */
export const ALLOW_LIST = {
  // The size-capped response helper: the ONE place the app calls `fetch` for the two adapters.
  'apps/web/src/net/capped-fetch.ts': { kinds: ['network'], reason: 'capped-response helper' },
  // Barcode lookup against world.openfoodfacts.org (user taps "scan"), through the helper.
  'apps/web/src/catalog/off-barcode-source.ts': { kinds: ['network'], reason: 'Open Food Facts lookup' },
  // The BYOK OpenAI-compatible endpoint the user configures, through the helper.
  'apps/web/src/ai/openai-compatible-provider.ts': { kinds: ['network'], reason: 'BYOK AI endpoint' },
  // The service worker precaches OUR files (same-origin GET) and never intercepts anything else.
  'tools/pwa/sw.template.js': { kinds: ['network'], reason: 'same-origin precache (sw.behaviour.test.mjs)' },
  // The self-hosted zxing reader: a <script> from our own origin (script-src 'self' enforces it).
  'apps/web/src/barcode/decoder.ts': { kinds: ['script'], reason: 'self-hosted zxing reader' },
  // The pinned sqlite3mc engine file the fetch script wrote, loaded in the store worker.
  'apps/web/src/storage/worker/store.worker.ts': {
    kinds: ['dynamic-import'],
    reason: 'same-origin pinned sqlite3mc module',
  },
};

/** Exact names of network-transport packages. */
export const NETWORK_PACKAGES = [
  'axios', 'got', 'ky', 'ky-universal', 'superagent', 'request', 'needle', 'node-fetch', 'cross-fetch',
  'isomorphic-fetch', 'whatwg-fetch', 'undici', 'ws', 'isomorphic-ws', 'websocket', 'reconnecting-websocket',
  'socket.io', 'socket.io-client', 'engine.io-client', 'sockjs-client', 'eventsource', 'event-source-polyfill',
  '@microsoft/fetch-event-source', 'axios-retry', 'wretch', 'redaxios', 'xhr', 'xmlhttprequest', 'peerjs',
  'simple-peer', 'trpc', '@trpc/client', 'graphql-request', '@apollo/client', 'urql', 'swr', '@tanstack/react-query',
  'grpc-web', '@grpc/grpc-js', 'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram',
  'http', 'https', 'http2', 'net', 'tls', 'dgram',
];

/** Package-name PREFIXES of analytics / telemetry / crash-reporting SDKs. Never allow-listable. */
export const TELEMETRY_PREFIXES = [
  '@sentry/', 'sentry', '@datadog/', 'dd-trace', 'datadog', '@opentelemetry/', 'opentelemetry', 'posthog',
  'mixpanel', '@amplitude/', 'amplitude', '@segment/', 'analytics-node', 'analytics-next', 'firebase',
  '@firebase/', 'react-ga', 'ga-4', 'universal-analytics', 'google-analytics', '@google-analytics/', 'gtag',
  '@vercel/analytics', '@vercel/speed-insights', '@bugsnag/', 'bugsnag', 'logrocket', '@logrocket/', 'hotjar',
  '@hotjar/', '@fullstory/', 'fullstory', 'newrelic', '@newrelic/', 'rollbar', 'raygun', 'countly', 'matomo',
  '@matomo/', 'plausible', 'umami', 'appcenter', 'instabug', 'smartlook', '@heap/', 'heap-api', 'heap-js',
  'honeybadger', '@honeybadger-io/', 'airbrake', '@airbrake/', 'trackjs', '@trackjs/', 'applicationinsights',
  '@microsoft/applicationinsights', '@microsoft/clarity', 'clarity-js', '@rudderstack/', 'rudder-sdk',
  '@grafana/faro', 'elastic-apm', '@elastic/apm', 'logdna', '@logtail/', 'appsflyer', 'branch-sdk', 'braze',
  '@braze/', 'onesignal', 'react-onesignal', 'uxcam', 'bugfender', 'crashlytics', 'sentry-',
];

const NET_GLOBALS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'importScripts',
]);
const CAPPED_FETCH = /(?:^|\/)capped-fetch(?:\.[cm]?[jt]s)?$/;

export const isTelemetryPackage = (name) => TELEMETRY_PREFIXES.some((p) => name.startsWith(p));
export const isNetworkPackage = (name) => NETWORK_PACKAGES.includes(name) || NETWORK_PACKAGES.includes(`node:${name}`);

/** The package name of a bare module specifier (`@a/b/c` -> `@a/b`, `a/b` -> `a`); null if relative. */
export function packageNameOf(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(spec) && !spec.startsWith('node:')) {
    return null;
  }
  if (spec.startsWith('node:')) return spec;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Findings in one file. `kind` of each: telemetry | network | script | dynamic-import | worker.
 * With `allow` (a list of kinds) matching findings are dropped; `telemetry` and `worker` can
 * never be allowed.
 */
export function scanSource(path, text, { allow = [] } = {}) {
  const sf = parse(path, text);
  const found = [];
  const add = (node, kind, message) => found.push({ path, line: lineOf(sf, node), kind, message });

  const checkModule = (node, spec, { typeOnly = false } = {}) => {
    const pkg = packageNameOf(spec);
    if (pkg && isTelemetryPackage(pkg)) {
      add(node, 'telemetry', `telemetry SDK import: ${spec}`);
      return;
    }
    if (typeOnly) return;
    if (pkg && isNetworkPackage(pkg)) add(node, 'network', `network package import: ${spec}`);
    else if (CAPPED_FETCH.test(spec)) add(node, 'network', `import of the capped-fetch network helper: ${spec}`);
  };

  walkNodes(sf, (node) => {
    // --- imports / exports / require -------------------------------------------------------
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 &&
            named.elements.every((e) => e.isTypeOnly)));
      checkModule(node, node.moduleSpecifier.text, { typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkModule(node, node.moduleSpecifier.text, { typeOnly: node.isTypeOnly });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const e = node.moduleReference.expression;
      if (ts.isStringLiteral(e)) checkModule(node, e.text, { typeOnly: node.isTypeOnly });
    }

    // --- calls: require(), import(), createElement('script'), sendBeacon -------------------
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg0 = node.arguments[0];
      if (ts.isIdentifier(callee) && callee.text === 'require') {
        const v = stringValue(arg0);
        if (v !== undefined) checkModule(node, v);
        else add(node, 'dynamic-import', 'require() of a non-literal module');
      } else if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const v = stringValue(arg0);
        if (v === undefined) add(node, 'dynamic-import', 'import() of a computed URL');
        else if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v) && !v.startsWith('node:')) {
          add(node, 'dynamic-import', `import() of an absolute URL: ${v}`);
        } else checkModule(node, v);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === 'createElement' || callee.name.text === 'createElementNS')
      ) {
        const tag = stringValue(node.arguments[callee.name.text === 'createElementNS' ? 1 : 0]);
        if (tag === undefined) add(node, 'script', `${callee.name.text}() with a computed tag could create a <script>`);
        else if (tag.toLowerCase() === 'script') add(node, 'script', 'dynamic <script> injection');
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && node.tagName.text === 'script') add(node, 'script', '<script> element in JSX');
    }

    // --- sendBeacon, and network globals reached through the global object -----------------
    if (ts.isPropertyAccessExpression(node) && !inTypePosition(node)) {
      const name = node.name.text;
      if (name === 'sendBeacon') add(node, 'network', 'navigator.sendBeacon');
      else if (
        NET_GLOBALS.has(name) &&
        ts.isIdentifier(node.expression) &&
        GLOBAL_OBJECTS.has(node.expression.text)
      ) {
        add(node, 'network', `${node.expression.text}.${name}`);
      }
    }
    if (ts.isElementAccessExpression(node) && !inTypePosition(node)) {
      const key = stringValue(node.argumentExpression);
      if (key === 'sendBeacon' || (key !== undefined && NET_GLOBALS.has(key) && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text))) {
        add(node, 'network', `["${key}"] access`);
      } else if (key === undefined && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text)) {
        add(node, 'network', `computed access on ${node.expression.text} can reach any network global`);
      }
    }

    // --- bare references to network globals ------------------------------------------------
    if (ts.isIdentifier(node) && NET_GLOBALS.has(node.text) && isReference(node)) {
      const p = node.parent;
      const viaGlobalObject = ts.isPropertyAccessExpression(p) && p.name === node;
      if (!viaGlobalObject) add(node, 'network', `use of the ${node.text} global`);
    }

    // --- Worker / SharedWorker -------------------------------------------------------------
    if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'Worker' || node.expression.text === 'SharedWorker')
    ) {
      const a = node.arguments?.[0];
      const sameOrigin =
        a &&
        ts.isNewExpression(a) &&
        ts.isIdentifier(a.expression) &&
        a.expression.text === 'URL' &&
        a.arguments?.length === 2 &&
        stringValue(a.arguments[0]) !== undefined &&
        !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(stringValue(a.arguments[0])) &&
        ts.isPropertyAccessExpression(a.arguments[1]) &&
        a.arguments[1].name.text === 'url' &&
        ts.isMetaProperty(a.arguments[1].expression);
      if (!sameOrigin) {
        add(node, 'worker', `${node.expression.text} of a URL that is not new URL('<relative literal>', import.meta.url)`);
      }
    }
  });

  return found.filter((f) => f.kind === 'telemetry' || f.kind === 'worker' || !allow.includes(f.kind));
}

/** pnpm-lock package names (`name@version:` keys under packages/snapshots). */
export function lockfilePackages(text) {
  const names = new Set();
  for (const m of text.matchAll(/^ {2}'?((?:@[^/@'"\s]+\/)?[^@'":\s/][^@'":\s]*)@/gm)) names.add(m[1]);
  return [...names];
}

/** Source + package.json + lockfile findings for the checkout at `root`. */
export function scanRepo(root, allowList = ALLOW_LIST) {
  const findings = [];
  const usedKinds = new Map();
  for (const path of shippedFiles(root)) {
    const text = readFileSync(join(root, path), 'utf8');
    const allowed = allowList[path]?.kinds ?? [];
    findings.push(...scanSource(path, text, { allow: allowed }));
    if (allowed.length) {
      const raw = scanSource(path, text, { allow: [] });
      usedKinds.set(path, new Set(raw.map((f) => f.kind)));
    }
  }
  // package.json: SDKs by prefix everywhere; network packages nowhere.
  for (const file of packageJsonFiles(root)) {
    for (const dep of declaredDependencies(readFileSync(join(root, file), 'utf8'))) {
      if (isTelemetryPackage(dep)) findings.push({ path: file, line: 1, kind: 'telemetry', message: `telemetry SDK dependency: ${dep}` });
      else if (isNetworkPackage(dep)) findings.push({ path: file, line: 1, kind: 'network', message: `network package dependency: ${dep} (the adapters use the platform fetch)` });
    }
  }
  const lock = join(root, 'pnpm-lock.yaml');
  if (existsSync(lock)) {
    for (const name of lockfilePackages(readFileSync(lock, 'utf8'))) {
      if (isTelemetryPackage(name)) findings.push({ path: 'pnpm-lock.yaml', line: 1, kind: 'telemetry', message: `telemetry SDK in the resolved dependency tree: ${name}` });
    }
  }
  // Allow-list hygiene.
  for (const [path, entry] of Object.entries(allowList)) {
    if (!existsSync(join(root, path))) {
      findings.push({ path, line: 0, kind: 'allow-list', message: `allow-list entry does not exist: ${path}` });
      continue;
    }
    const used = usedKinds.get(path) ?? new Set();
    for (const kind of entry.kinds) {
      if (!used.has(kind)) {
        findings.push({ path, line: 0, kind: 'allow-list', message: `allow-list entry grants "${kind}" but the file no longer needs it: narrow it` });
      }
    }
  }
  return findings;
}

const ANCHORS = ['check_telemetry_claims', 'check:telemetry'];

/** Docs claiming "no telemetry" without naming this gate. */
export function checkDocAnchors(root) {
  const failures = [];
  const files = [];
  const walkDocs = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walkDocs(full);
      else if (name.name.endsWith('.md')) files.push(full);
    }
  };
  walkDocs(join(root, 'docs'));
  for (const name of readdirSync(root)) if (name.endsWith('.md')) files.push(join(root, name));
  for (const file of files) {
    const path = rel(root, file);
    if (path === 'docs/telemetry-posture.md') continue;
    const body = readFileSync(file, 'utf8').toLowerCase();
    if (body.includes('no telemetry') && !ANCHORS.some((a) => body.includes(a))) {
      failures.push(`${path}: "no telemetry" claim is not anchored to the gate (name tools/check_telemetry_claims.mjs)`);
    }
  }
  return failures;
}

export function runGate(root = process.cwd()) {
  const failures = [
    ...scanRepo(root).map((f) => `${f.path}:${f.line}: ${f.message}`),
    ...checkDocAnchors(root),
  ];
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runGate();
  if (failures.length === 0) {
    console.log(
      `check:telemetry: OK - only the ${Object.keys(ALLOW_LIST).length} allow-listed files use a network transport, script injection or runtime import; no telemetry SDKs; docs anchored.`,
    );
  } else {
    console.error('check:telemetry: FAIL');
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}
