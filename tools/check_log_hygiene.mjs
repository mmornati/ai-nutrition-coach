#!/usr/bin/env node
// Log hygiene gate, ported from the earlier gate script (privacy audit, proposed check 3).
//
// AI Nutrition Coach must never write what the user logged (food names, barcodes, photos,
// endpoints, keys) to a console. This reads every shipped file from the TypeScript AST and fails on:
//
//   * `console` used as a VALUE: a tear-off such as `.forEach(console.log)`, `const f = console.log`,
//     `console.log.bind(console)`, `const { log } = console`, `console[name](...)` - a tear-off
//     bypasses the call checks, so it is never allowed;
//   * a `console.*` call (also `window/globalThis/self.console.*`, `process.stdout/stderr.write`)
//     whose arguments interpolate or forward anything (a template substitution, an identifier, a
//     concatenation, a spread) UNLESS the call carries the marker comment
//     `// log-hygiene: content-free` on one of its lines (or the line just above it) AND every
//     identifier it mentions is on ALLOWED_LOG_IDENTIFIERS (ids, enums, counts, fixed reasons:
//     values the code makes up, never user content).
//
// A call whose arguments are all plain string literals carries no content and passes.
//
//   node tools/check_log_hygiene.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalRefs, inTypePosition, isReference, lineOf, parse, shippedFiles, stringValue, ts, unwrap, walkNodes } from './gates/shared.mjs';

/** The comment that marks a log call as reviewed. */
export const CONTENT_FREE_MARKER = 'log-hygiene: content-free';

/**
 * Identifiers that may be interpolated into a reviewed log line: row / plate / note ids, step and
 * status enums, counts and fixed reasons. Never a name, barcode, endpoint, key, query or
 * exception message.
 */
export const ALLOWED_LOG_IDENTIFIERS = new Set([
  'id', 'rowId', 'plateId', 'plateLogId', 'noteId', 'count', 'length', 'step', 'warning', 'reason', 'kind', 'status',
  'statusCode',
]);

const memberKey = (m) => (ts.isPropertyAccessExpression(m) ? m.name.text : stringValue(m.argumentExpression));
const isMember = (n) => ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n);

/** `console`, or `<global object / alias>.console` / `['console']`. */
function isConsole(node, refs) {
  if (ts.isIdentifier(node) && node.text === 'console') return isReference(node);
  return isMember(node) && memberKey(node) === 'console' && refs.kindOf(node.expression) === 'g';
}

/** `process.stdout` / `process.stderr` / `process['stdout']` (also through the global object). */
function isStdStream(node, refs) {
  if (!isMember(node)) return false;
  const key = memberKey(node);
  if (key !== 'stdout' && key !== 'stderr') return false;
  const recv = unwrap(node.expression);
  if (ts.isIdentifier(recv)) return recv.text === 'process';
  return isMember(recv) && memberKey(recv) === 'process' && refs.kindOf(recv.expression) === 'g';
}

/**
 * Every Identifier (and private name) text in an expression: `warning.step` yields warning, step.
 * An element access names its member by a string (`id['foodName']` yields foodName) or hides it
 * (`id[key]` yields "[computed]"), so neither slips past the allow-list.
 */
function identifiersIn(node, out) {
  walkNodes(node, (n) => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.add(n.text);
    else if (ts.isElementAccessExpression(n)) {
      const key = stringValue(n.argumentExpression);
      out.add(key === undefined ? '[computed]' : key);
    }
  });
}

/** Findings `{path, line, message}` in `text` (a file named `path`). */
export function scanSource(path, text) {
  const sf = parse(path, text);
  const lines = text.split('\n');
  const refs = globalRefs(sf);
  const findings = [];
  const add = (node, message) => findings.push({ path, line: lineOf(sf, node), message });

  const checkCall = (call, label) => {
    const identifiers = new Set();
    let dynamic = false;
    for (const arg of call.arguments) {
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) continue;
      if (ts.isTemplateExpression(arg)) {
        for (const span of arg.templateSpans) identifiersIn(span.expression, identifiers);
        continue;
      }
      dynamic = true;
      identifiersIn(arg, identifiers);
    }
    if (identifiers.size === 0 && !dynamic) return; // a constant message
    const first = lineOf(sf, call);
    const last = sf.getLineAndCharacterOfPosition(call.getEnd()).line + 1;
    let marked = false;
    for (let l = Math.max(first - 1, 1); l <= Math.min(last, lines.length); l++) {
      if (lines[l - 1].includes(CONTENT_FREE_MARKER)) marked = true;
    }
    if (!marked) {
      add(
        call,
        `${label}(...) interpolates or forwards a value; if it is content-free mark the call with "// ${CONTENT_FREE_MARKER}" and mention only allow-listed identifiers`,
      );
      return;
    }
    const unlisted = [...identifiers].filter((i) => !ALLOWED_LOG_IDENTIFIERS.has(i));
    if (unlisted.length > 0 || (dynamic && identifiers.size === 0)) {
      add(
        call,
        `${label}(...) is marked content-free but uses ${
          unlisted.length ? unlisted.map((i) => `"${i}"`).join(', ') : 'a non-literal argument'
        } (allowed identifiers: ${[...ALLOWED_LOG_IDENTIFIERS].sort().join(', ')})`,
      );
    }
  };

  walkNodes(sf, (node) => {
    if (inTypePosition(node)) return;
    // reportError(x): the global error reporter prints what it is given to the console.
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if ((ts.isIdentifier(callee) && callee.text === 'reportError') || (isMember(callee) && memberKey(callee) === 'reportError' && refs.kindOf(callee.expression) === 'g')) {
        checkCall(node, 'reportError');
      }
      // Reflect.get(globalThis, 'console') / Reflect.get(g, k) hands the console to the caller unchecked.
      if (isMember(callee) && ts.isIdentifier(unwrap(callee.expression)) && unwrap(callee.expression).text === 'Reflect') {
        if (node.arguments.some((a) => refs.kindOf(a) !== undefined || stringValue(a) === 'console')) {
          add(node, `Reflect.${memberKey(callee)}() on the global object can reach console without the call being checked`);
        }
      }
    }
    // process.stdout.write(...) and friends.
    if (ts.isCallExpression(node) && isMember(unwrap(node.expression)) && isStdStream(unwrap(unwrap(node.expression).expression), refs)) {
      const target = unwrap(node.expression);
      checkCall(node, `process.${memberKey(unwrap(target.expression))}.${memberKey(target) ?? '[computed]'}`);
      return;
    }
    if (isStdStream(node, refs)) {
      const p = node.parent;
      const isCallTarget = isMember(p) && p.expression === node && ts.isCallExpression(p.parent) && p.parent.expression === p;
      if (!isCallTarget) add(node, `${memberKey(node)} is used as a value (tear-off); call write directly so the argument can be checked`);
      return;
    }
    if (!isConsole(node, refs)) return;
    const p = node.parent;
    if (isMember(p) && p.expression === node && ts.isCallExpression(p.parent) && p.parent.expression === p) {
      if (ts.isElementAccessExpression(p) && stringValue(p.argumentExpression) === undefined) {
        add(node, 'console[<computed>](...) hides which method is called');
        return;
      }
      checkCall(p.parent, `console.${memberKey(p)}`);
      return;
    }
    add(node, 'console is used as a value (tear-off, alias or destructuring); call console.<method>(...) directly so the argument can be checked');
  });
  return findings;
}

/** Findings across the checkout at `root`. */
export function scanRepo(root) {
  const out = [];
  for (const path of shippedFiles(root)) out.push(...scanSource(path, readFileSync(join(root, path), 'utf8')));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scanRepo(process.cwd());
  if (findings.length === 0) {
    console.log('check:log-hygiene: OK - no console tear-off, and every interpolating log call is reviewed and content-free.');
  } else {
    console.error('check:log-hygiene: FAIL');
    for (const f of findings) console.error(`  ${f.path}:${f.line}: ${f.message}`);
    process.exitCode = 1;
  }
}
