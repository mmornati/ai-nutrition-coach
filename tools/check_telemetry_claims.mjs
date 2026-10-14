#!/usr/bin/env node
// Telemetry gate, ported from the earlier gate script (FR-12).
//
//   node tools/check_telemetry_claims.mjs
//
// The no-telemetry invariant, enforced from the PARSED program (TypeScript compiler API), not
// from call-site strings:
//
//   1. No shipped file (apps/web/src, packages/core/src, apps/web/public/*.js, the service
//      workers) uses a network transport unless it is in the explicit allow-list below (by file AND
//      kind). The words fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport,
//      RTCPeerConnection, importScripts and sendBeacon are findings as ANY non-type identifier
//      (property names, `{ fetch: f } = g` binding names) or string (also `'fe' + 'tch'`);
//      Reflect.get/apply/construct (and Object.getOwnPropertyDescriptor/entries/...) on the global
//      object, navigator or an alias; computed access on them; aliasing the global object; a
//      network package import; a value import of the capped-fetch helper; `<script>` injection;
//      import() of anything but a literal module path; eval / Function / setTimeout(string);
//      window.open and location changes to non-relative URLs; a service worker registered from a
//      non-literal; image / element beacons (`new Image().src`, createElement('img'|'iframe'|
//      'link'|'form'|...) + src/href/action/data set to anything but a '/x', './x', data: or blob:
//      literal or an object URL, the same for JSX <img|iframe|link|form|audio|video|source|object|
//      embed>, setAttribute, CSS url(), HTML sinks); and any Worker / SharedWorker that is not
//      `new Worker(new URL('<relative literal>', import.meta.url))`, reached by alias or not.
//      Kinds: network | script | dynamic-import | navigation | element-url | global-alias are
//      allow-listable; telemetry, worker and eval never are. A shipped file may not import a
//      path under test/, testing/, __tests__/, e2e/, harness/ or dist/ (they are not scanned).
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
  declaredDependencies,
  globalRefs,
  inTypePosition,
  isSafeUrlExpr,
  lineOf,
  nonShippedImports,
  packageJsonFiles,
  parse,
  rel,
  shippedFiles,
  staticText,
  stringValue,
  ts,
  unwrap,
  walkNodes,
} from './gates/shared.mjs';

/**
 * Files allowed a capability. Each is a user-initiated or same-origin path, documented in
 * docs/telemetry-posture.md. `kinds`: network | script | dynamic-import | navigation | element-url |
 * global-alias (telemetry, worker and eval can never be allowed).
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
  // The self-hosted zxing reader: a <script> from our own origin (script-src 'self' enforces it),
  // src = the fixed ZXING_READER_PATH default; `env = globalThis` is the injectable test seam.
  'apps/web/src/barcode/decoder.ts': {
    kinds: ['script', 'element-url', 'global-alias'],
    reason: 'self-hosted zxing reader (same-origin script src, globalThis as the injected env)',
  },
  // The pinned sqlite3mc engine file the fetch script wrote, loaded in the store worker.
  'apps/web/src/storage/worker/store.worker.ts': {
    kinds: ['dynamic-import', 'global-alias'],
    reason: 'same-origin pinned sqlite3mc module; `self` retyped as the worker scope',
  },
  // Router: the history fallback `location.replace(<route hash>)` - a '#/...' fragment, never a URL.
  'apps/web/src/app/router.ts': { kinds: ['navigation'], reason: 'fragment-only route replace' },
  // The injectable `fetch` seam (a FetchLike handed down to the two adapters): the word is a
  // property name here and nothing is called; the adapters above are the only callers.
  'apps/web/src/app/session.tsx': { kinds: ['network'], reason: 'passes the injected FetchLike option by name' },
  'apps/web/src/ai/create-ai-services.ts': { kinds: ['network'], reason: 'passes the injected FetchLike option by name' },
  // Test-support fakes (never call the platform fetch; only expose a scriptable `fetch` property).
  'apps/web/src/net/testing.ts': { kinds: ['network'], reason: 'scriptable fake fetch for tests' },
  'apps/web/src/ai/testing.ts': { kinds: ['network'], reason: 'scriptable fake fetch for tests' },
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

/** URL-bearing attributes / properties: assigning one a non-same-origin value can issue a request. */
const URL_PROPS = new Set(['src', 'srcset', 'href', 'poster', 'formaction']);
/** Only URL-bearing on an element created from one of ELEMENT_TAGS (`data`, `action`, `ping` are common names elsewhere). */
const TAGGED_URL_PROPS = new Set(['action', 'data', 'ping']);
const URL_ATTRS_JSX = new Set(['src', 'srcset', 'href', 'poster', 'formaction', 'action', 'data', 'ping']);
/** Elements that load or submit to a URL by themselves. */
const ELEMENT_TAGS = new Set([
  'img', 'iframe', 'link', 'form', 'audio', 'video', 'source', 'script', 'object', 'embed', 'image', 'use', 'track', 'input',
]);
const JSX_TAGS = new Set(['img', 'iframe', 'link', 'form', 'audio', 'video', 'source', 'object', 'embed', 'image', 'use', 'track']);
const NET_NAMES = new Set([...NET_GLOBALS, 'sendBeacon']);
const EVAL_NAMES = new Set(['eval', 'Function']);
const WORKER_NAMES = new Set(['Worker', 'SharedWorker']);
const HTML_SINKS = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const REFLECT_READS = new Set(['get', 'apply', 'construct', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'entries', 'values', 'keys', 'getOwnPropertyNames', 'fromEntries']);

/** Kinds no allow-list entry can grant. */
const NEVER_ALLOWED = new Set(['telemetry', 'worker', 'eval']);

const lower = (s) => s.toLowerCase();

/**
 * Findings in one file. `kind` of each: telemetry | network | script | dynamic-import | worker |
 * eval | navigation | element-url | global-alias. With `allow` (a list of kinds) matching findings
 * are dropped; `telemetry`, `worker` and `eval` can never be allowed.
 */
export function scanSource(path, text, { allow = [] } = {}) {
  const sf = parse(path, text);
  const found = [];
  const add = (node, kind, message) => found.push({ path, line: lineOf(sf, node), kind, message });
  const refs = globalRefs(sf);
  const safe = (expr) => isSafeUrlExpr(expr, sf);

  // Variables holding an element created from a URL-loading tag (`const i = document.createElement('img')`, `new Image()`).
  const elementVars = new Map();
  const elementTagOf = (expr) => {
    const e = unwrap(expr);
    if (!e) return undefined;
    if (ts.isNewExpression(e) && ts.isIdentifier(e.expression)) {
      if (e.expression.text === 'Image') return 'img';
      if (e.expression.text === 'Audio') return 'audio';
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const m = e.expression.name.text;
      if (m === 'createElement' || m === 'createElementNS') {
        const tag = stringValue(e.arguments[m === 'createElementNS' ? 1 : 0]);
        return tag !== undefined ? lower(tag) : undefined;
      }
    }
    if (ts.isIdentifier(e)) return elementVars.get(e.text);
    return undefined;
  };
  walkNodes(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const tag = elementTagOf(n.initializer);
      if (tag) elementVars.set(n.name.text, tag);
    }
  });

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

  /** The object a property-access / element-access names, and its key (undefined when computed). */
  const memberKey = (m) => (ts.isPropertyAccessExpression(m) ? m.name.text : stringValue(m.argumentExpression));
  const isMember = (n) => ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n);
  const isLocation = (e) => {
    const x = unwrap(e);
    if (!x) return false;
    if (ts.isIdentifier(x)) return x.text === 'location';
    return isMember(x) && memberKey(x) === 'location' && (refs.kindOf(x.expression) === 'g' || (ts.isIdentifier(unwrap(x.expression)) && unwrap(x.expression).text === 'document'));
  };
  const isStringish = (e) => {
    const x = unwrap(e);
    return !!x && (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x) || (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken));
  };
  const sameOriginWorkerUrl = (a) =>
    !!a &&
    ts.isNewExpression(a) &&
    ts.isIdentifier(a.expression) &&
    a.expression.text === 'URL' &&
    a.arguments?.length === 2 &&
    stringValue(a.arguments[0]) !== undefined &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(stringValue(a.arguments[0])) &&
    ts.isPropertyAccessExpression(a.arguments[1]) &&
    a.arguments[1].name.text === 'url' &&
    ts.isMetaProperty(a.arguments[1].expression);
  const checkUrlProp = (node, key, value, tag, what) => {
    const k = lower(key);
    if (!(URL_PROPS.has(k) || (tag && TAGGED_URL_PROPS.has(k)))) return;
    if (!safe(value)) add(node, 'element-url', `${what} "${key}" is set to a value that is not a same-origin literal (/x, ./x, data:, blob:) - this can issue a request`);
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

    // --- calls ------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
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
      }
      if (isMember(callee)) {
        const method = memberKey(callee);
        const recv = unwrap(callee.expression);
        if (method === 'createElement' || method === 'createElementNS') {
          const tag = stringValue(node.arguments[method === 'createElementNS' ? 1 : 0]);
          if (tag === undefined) add(node, 'script', `${method}() with a computed tag could create a <script>`);
          else if (lower(tag) === 'script') add(node, 'script', 'dynamic <script> injection');
          // React.createElement('img', { src }) and friends.
          if (tag !== undefined && ELEMENT_TAGS.has(lower(tag)) && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
            for (const p of node.arguments[1].properties) {
              if (ts.isSpreadAssignment(p)) add(p, 'element-url', `createElement('${tag}', {...spread}) can set a URL attribute`);
              else if (p.name) {
                const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
                if (key) checkUrlProp(p, key, ts.isPropertyAssignment(p) ? p.initializer : p.name, true, `createElement('${tag}')`);
              }
            }
          }
        } else if (method === 'setAttribute' || method === 'setAttributeNS') {
          const keyNode = node.arguments[method === 'setAttributeNS' ? 1 : 0];
          const valNode = node.arguments[method === 'setAttributeNS' ? 2 : 1];
          const key = stringValue(keyNode);
          if (key === undefined) add(node, 'element-url', `${method}() with a computed attribute name could set a URL`);
          else if (valNode) checkUrlProp(node, key, valNode, !!elementTagOf(recv) && ELEMENT_TAGS.has(elementTagOf(recv)), 'setAttribute');
        } else if (method === 'insertAdjacentHTML') {
          const v = stringValue(node.arguments[1]);
          if (v === undefined || v.includes('<')) add(node, 'element-url', 'insertAdjacentHTML with markup can load URLs');
        } else if (method === 'write' || method === 'writeln') {
          if (ts.isIdentifier(recv) && recv.text === 'document') add(node, 'element-url', 'document.write can load URLs');
        } else if (method === 'open' && refs.kindOf(recv) === 'g') {
          add(node, 'navigation', 'window.open');
        } else if ((method === 'assign' || method === 'replace') && isLocation(recv)) {
          if (!node.arguments[0] || !safe(node.arguments[0])) add(node, 'navigation', `location.${method}() of a URL that is not a same-origin literal`);
        } else if (method === 'register' && node.arguments[0]) {
          if (!safe(node.arguments[0])) add(node, 'worker', 'register() of a script URL that is not a same-origin literal (service worker)');
        } else if (method === 'constructor') {
          add(node, 'eval', '.constructor(...) call can build a Function from a string');
        } else if (method === 'setProperty' && node.arguments[1] && /url\(|image-set\(|@import/i.test(staticText(node.arguments[1]))) {
          add(node, 'element-url', 'a CSS url() value can load a resource');
        } else if (
          (recv && ts.isIdentifier(recv) && recv.text === 'Reflect' && REFLECT_READS.has(method)) ||
          (recv && ts.isIdentifier(recv) && recv.text === 'Object' && REFLECT_READS.has(method) && method !== 'get' && method !== 'apply' && method !== 'construct')
        ) {
          if (node.arguments.some((a) => refs.kindOf(a) !== undefined)) {
            add(node, 'network', `${recv.text}.${method}() on the global object or navigator can reach any network API`);
          }
        }
        // Object.assign(element, { src: ... }) sets properties like an assignment does.
        if (method === 'assign' && ts.isIdentifier(recv) && recv.text === 'Object' && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
          const tag = elementTagOf(node.arguments[0]);
          for (const p of node.arguments[1].properties) {
            if (ts.isSpreadAssignment(p)) {
              if (tag) add(p, 'element-url', 'Object.assign(<element>, {...spread}) can set a URL property');
            } else if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
              checkUrlProp(p, p.name.text, ts.isPropertyAssignment(p) ? p.initializer : p.name, !!tag && ELEMENT_TAGS.has(tag), 'Object.assign');
            }
          }
        }
      }
      // setTimeout("code") / setInterval("code") evaluate a string.
      const fn = ts.isIdentifier(callee) ? callee.text : isMember(callee) && refs.kindOf(callee.expression) === 'g' ? memberKey(callee) : undefined;
      if ((fn === 'setTimeout' || fn === 'setInterval') && node.arguments[0] && isStringish(node.arguments[0])) {
        add(node, 'eval', `${fn}() of a string evaluates code`);
      }
    }
    if (ts.isNewExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && (callee.text === 'Image' || callee.text === 'Audio') && node.arguments?.[0] && !safe(node.arguments[0])) {
        add(node, 'element-url', `new ${callee.text}(<url>) with a value that is not a same-origin literal`);
      }
      if (ts.isIdentifier(callee) && callee.text === 'Function') add(node, 'eval', 'new Function(...) builds code from a string');
    }

    // --- assignments to URL-bearing properties, location, HTML sinks, CSS -----------------
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const left = unwrap(node.left);
      if (isMember(left)) {
        const key = memberKey(left);
        const recv = unwrap(left.expression);
        if (key === undefined) {
          if (elementTagOf(recv) || isLocation(recv)) add(node, 'element-url', 'assignment to a computed property of an element / location could set a URL');
        } else {
          const tag = elementTagOf(recv);
          if (isLocation(recv)) {
            if (['href', 'host', 'hostname', 'protocol', 'origin', 'port'].includes(key) && !safe(node.right)) {
              add(node, 'navigation', `location.${key} assigned a URL that is not a same-origin literal`);
            }
          } else {
            checkUrlProp(node, key, node.right, !!tag && ELEMENT_TAGS.has(tag), 'property');
          }
          if (HTML_SINKS.has(key)) {
            const v = stringValue(node.right);
            if (v === undefined || v.includes('<')) add(node, 'element-url', `${key} assigned markup / a non-constant string can load URLs`);
          }
          if (key === 'cssText' || (ts.isPropertyAccessExpression(recv) && recv.name.text === 'style')) {
            if (/url\(|image-set\(|@import/i.test(staticText(node.right))) add(node, 'element-url', 'a CSS url() value can load a resource');
          }
        }
      } else if (ts.isIdentifier(left) && left.text === 'location' && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (!safe(node.right)) add(node, 'navigation', 'location assigned a URL that is not a same-origin literal');
      }
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken && refs.kindOf(node.right) === 'g') {
        add(node, 'global-alias', 'the global object is aliased by an assignment');
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer && refs.kindOf(node.initializer) === 'g' && !inTypePosition(node)) {
      add(node, 'global-alias', 'the global object is aliased by a declaration');
    }

    // --- JSX ---------------------------------------------------------------------------------
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && node.tagName.text === 'script') add(node, 'script', '<script> element in JSX');
      if (ts.isIdentifier(node.tagName) && JSX_TAGS.has(node.tagName.text)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(attr)) {
            add(attr, 'element-url', `<${node.tagName.text} {...spread}> can set a URL attribute`);
            continue;
          }
          const name = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText(sf);
          if (!URL_ATTRS_JSX.has(lower(name))) continue;
          const init = attr.initializer;
          const value = init && ts.isJsxExpression(init) ? init.expression : init;
          if (!value || !safe(value)) {
            add(attr, 'element-url', `<${node.tagName.text} ${name}> is not a same-origin string literal (/x, ./x, data:, blob:) - this can issue a request`);
          }
        }
      }
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'dangerouslySetInnerHTML') {
      add(node, 'element-url', 'dangerouslySetInnerHTML can inject markup that loads URLs');
    }

    // --- names: network APIs, eval, Worker --------------------------------------------------
    if (ts.isIdentifier(node) && !inTypePosition(node)) {
      const name = node.text;
      const p = node.parent;
      if (NET_NAMES.has(name)) add(node, 'network', `use of "${name}"`);
      if (name === 'Reflect' && !(ts.isPropertyAccessExpression(p) && p.expression === node)) {
        add(node, 'network', 'Reflect is used as a value (alias): call Reflect.<method> directly so its target can be checked');
      }
      if (EVAL_NAMES.has(name)) add(node, 'eval', `use of "${name}"`);
      if (WORKER_NAMES.has(name)) {
        const asCallee = ts.isNewExpression(p) && p.expression === node ? p : ts.isPropertyAccessExpression(p) && p.name === node && ts.isNewExpression(p.parent) && p.parent.expression === p ? p.parent : undefined;
        if (!asCallee) add(node, 'worker', `${name} referenced other than as new ${name}(new URL('<relative literal>', import.meta.url))`);
        else if (!sameOriginWorkerUrl(asCallee.arguments?.[0])) {
          add(node, 'worker', `${name} of a URL that is not new URL('<relative literal>', import.meta.url)`);
        }
      }
    }
    const str = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      ? stringValue(node)
      : undefined;
    if (str !== undefined && !inTypePosition(node) && !(ts.isStringLiteral(node) && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isExternalModuleReference(node.parent)))) {
      if (NET_NAMES.has(str)) add(node, 'network', `string "${str}" names a network API`);
      if (EVAL_NAMES.has(str)) add(node, 'eval', `string "${str}" names a code evaluator`);
      if (WORKER_NAMES.has(str)) add(node, 'worker', `string "${str}" reaches the Worker constructor by name`);
    }

    // --- computed access on the global object / navigator ----------------------------------
    if (ts.isElementAccessExpression(node) && !inTypePosition(node)) {
      if (refs.kindOf(node.expression) !== undefined && stringValue(node.argumentExpression) === undefined) {
        add(node, 'network', 'computed access on the global object / navigator can reach any network API');
      }
    }
  });

  return found.filter((f) => NEVER_ALLOWED.has(f.kind) || f.kind === 'telemetry' || !allow.includes(f.kind));
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
    ...nonShippedImports(root).map((f) => `${f.path}:${f.line}: ${f.message}`),
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
