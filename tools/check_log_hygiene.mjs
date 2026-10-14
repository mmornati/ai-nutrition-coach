#!/usr/bin/env node
// Log hygiene gate, ported from tools/check_log_hygiene.dart (privacy audit, proposed check 3).
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
import { GLOBAL_OBJECTS, inTypePosition, isReference, lineOf, parse, shippedFiles, stringValue, ts, walkNodes } from './gates/shared.mjs';

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

function isConsole(node) {
  if (ts.isIdentifier(node) && node.text === 'console') return isReference(node);
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'console' &&
    ts.isIdentifier(node.expression) &&
    GLOBAL_OBJECTS.has(node.expression.text)
  );
}

function isStdStream(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    (node.name.text === 'stdout' || node.name.text === 'stderr') &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

/** Every Identifier (and private name) text in an expression: `warning.step` yields warning, step. */
function identifiersIn(node, out) {
  walkNodes(node, (n) => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.add(n.text);
  });
}

/** Findings `{path, line, message}` in `text` (a file named `path`). */
export function scanSource(path, text) {
  const sf = parse(path, text);
  const lines = text.split('\n');
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
    // process.stdout.write(...) and friends.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && isStdStream(node.expression.expression)) {
      checkCall(node, `process.${node.expression.expression.name.text}.${node.expression.name.text}`);
      return;
    }
    if (isStdStream(node)) {
      const p = node.parent;
      const isCallTarget =
        ts.isPropertyAccessExpression(p) && p.expression === node && ts.isCallExpression(p.parent) && p.parent.expression === p;
      if (!isCallTarget) add(node, `${node.name.text} is used as a value (tear-off); call write directly so the argument can be checked`);
      return;
    }
    if (!isConsole(node)) return;
    const p = node.parent;
    if (
      (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) &&
      p.expression === node &&
      ts.isCallExpression(p.parent) &&
      p.parent.expression === p
    ) {
      if (ts.isElementAccessExpression(p) && stringValue(p.argumentExpression) === undefined) {
        add(node, 'console[<computed>](...) hides which method is called');
        return;
      }
      const method = ts.isPropertyAccessExpression(p) ? p.name.text : stringValue(p.argumentExpression);
      checkCall(p.parent, `console.${method}`);
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
