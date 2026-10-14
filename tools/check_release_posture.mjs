#!/usr/bin/env node
// Release-posture gate, ported from the earlier gate script (Story 4.6, Phase 7).
//
//   node tools/check_release_posture.mjs                    everything below
//   node tools/check_release_posture.mjs --project-url-only just the project-URL rule (see
//                                                            tools/check_project_url.mjs; the image
//                                                            build has no README or tests to check)
//
// Asserts, at HEAD:
//   1. LICENSE, CONTRIBUTING.md, docs/no-dark-patterns-standard.md and docs/release-checklist.md exist;
//   2. LICENSE is MIT;
//   3. the No-Dark-Patterns banned-everywhere list is unchanged (every baseline term still named);
//   4. CONTRIBUTING.md documents the pnpm build / test / smoke commands;
//   5. EVERY row of the README "Trust posture" table has a Proof cell naming test files that
//      exist, are `*.test.*` / `*.spec.*` files, and contain at least one real, un-skipped test
//      (read from the AST: a comment, a string or a skipped test does not count);
//   6. `pnpm verify` still chains every gate (so a gate cannot be dropped silently), and the
//      workspace `lint` scripts treat warnings as errors;
//   7. the project-URL rule for release builds.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProjectUrl } from './check_project_url.mjs';
import { parse, ts, walkNodes } from './gates/shared.mjs';

export const REQUIRED_ARTIFACTS = [
  'LICENSE',
  'CONTRIBUTING.md',
  'docs/no-dark-patterns-standard.md',
  'docs/release-checklist.md',
];

export const BANNED_EVERYWHERE_BASELINE = [
  'streaks',
  'countdowns',
  'badges',
  'celebratory pop-ups',
  'push-notification re-engagement',
  'card sprawl',
  'red-guilt',
  'resolve spinners',
];

export const CONTRIBUTING_COMMANDS = [
  'pnpm install',
  'pnpm verify',
  'pnpm test',
  'scripts/smoke_self_host.sh',
  'scripts/webkit_smoke.sh',
];

/** Fragments `pnpm verify` must still contain once its sub-scripts are expanded. */
export const VERIFY_MUST_RUN = [
  ['format check', 'prettier --check'],
  ['lint', 'pnpm -r lint'],
  ['typecheck', 'pnpm -r typecheck'],
  ['unit tests', 'pnpm -r test'],
  ['DST re-run under TZ=Europe/Paris', 'TZ=Europe/Paris'],
  ['telemetry gate', 'tools/check_telemetry_claims.mjs'],
  ['log hygiene gate', 'tools/check_log_hygiene.mjs'],
  ['adults-only gate', 'tools/check_adults_only.mjs'],
  ['release-posture gate', 'tools/check_release_posture.mjs'],
  ['accessibility floor gate', 'tools/check_accessibility_floor.mjs'],
  ['release build', 'pnpm -r build'],
  ['secrets scan', 'tools/check_no_secrets_in_build.sh'],
  ['third-party host scan', 'tools/check_no_external_hosts.sh'],
  ['no-gallery build guard', 'tools/check_no_gallery_in_build.sh'],
  ['no-dev-store build guard', 'tools/check_no_dev_store_in_build.sh'],
];

const PROOF_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_ROOTS = new Set(['test', 'it']);
const SKIPPING = new Set(['skip', 'todo', 'fixme', 'skipIf']);
const SUITE_ROOTS = new Set(['describe', 'suite']);

/** `{root, props}` of a callee such as `it.each(table)`, `test.describe.skip` or `test`. */
function calleeShape(callee) {
  const props = [];
  let n = callee;
  for (;;) {
    if (ts.isCallExpression(n)) n = n.expression;
    else if (ts.isPropertyAccessExpression(n)) {
      props.unshift(n.name.text);
      n = n.expression;
    } else break;
  }
  return { root: ts.isIdentifier(n) ? n.text : undefined, props };
}

function optionsSkip(call) {
  return call.arguments.some(
    (a) =>
      ts.isObjectLiteralExpression(a) &&
      a.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ['skip', 'todo'].includes(p.name.getText()) &&
          p.initializer.kind !== ts.SyntaxKind.FalseKeyword,
      ),
  );
}

/** `true` if `source` makes at least one real, un-skipped call to `test` / `it`. */
export function hasRealTest(source, path = 'x.test.ts') {
  const sf = parse(path, source);
  let found = false;
  const underSkippedSuite = (node) => {
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isCallExpression(n)) {
        const { root, props } = calleeShape(n.expression);
        if (root && (SUITE_ROOTS.has(root) || (root === 'test' && props.includes('describe'))) && props.some((p) => SKIPPING.has(p))) {
          return true;
        }
        if (optionsSkip(n)) return true;
      }
    }
    return false;
  };
  walkNodes(sf, (node) => {
    if (found || !ts.isCallExpression(node)) return;
    const { root, props } = calleeShape(node.expression);
    if (!root || !TEST_ROOTS.has(root)) return;
    if (props.includes('describe') || props.some((p) => SKIPPING.has(p))) return;
    if (node.arguments.length < 2 && !(ts.isCallExpression(node.expression) && node.arguments.length >= 1)) return;
    if (optionsSkip(node) || underSkippedSuite(node)) return;
    found = true;
  });
  return found;
}

/** Failures of the README trust-table proof rule for the checkout at `root`. */
export function checkTrustTable(root) {
  const readmePath = join(root, 'README.md');
  if (!existsSync(readmePath)) return ['README.md is missing'];
  const lines = readFileSync(readmePath, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Trust posture');
  if (start < 0) return ['README.md has no "## Trust posture" section'];
  const table = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break;
    if (line.startsWith('|')) table.push(line);
    else if (table.length > 0) break;
  }
  if (table.length < 3) return ['README trust table not found or empty'];
  const cells = (row) =>
    row
      .slice(1, row.endsWith('|') ? -1 : undefined)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
  const proofCol = cells(table[0]).findIndex((h) => h.toLowerCase() === 'proof');
  if (proofCol < 0) return ['README trust table has no "Proof" column'];
  const failures = [];
  for (const row of table.slice(2)) {
    const c = cells(row);
    const promise = c[0] ?? row;
    const label = promise.length > 60 ? `${promise.slice(0, 57)}...` : promise;
    const proofCell = c[proofCol] ?? '';
    const paths = [...proofCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (paths.length === 0) {
      failures.push(`trust row has no proof test: "${label}"`);
      continue;
    }
    for (const path of paths) {
      if (!PROOF_FILE.test(path)) {
        failures.push(`proof "${path}" is not a *.test.* / *.spec.* file ("${label}")`);
        continue;
      }
      const file = join(root, path);
      if (!existsSync(file)) failures.push(`proof file does not exist: ${path} ("${label}")`);
      else if (!hasRealTest(readFileSync(file, 'utf8'), path)) failures.push(`proof file contains no un-skipped test: ${path} ("${label}")`);
    }
  }
  return failures;
}

/** Expands `pnpm run X` / `pnpm X` references to workspace scripts into their bodies. */
export function expandScript(scripts, name, seen = new Set()) {
  const body = scripts[name];
  if (typeof body !== 'string' || seen.has(name)) return '';
  seen.add(name);
  return body.replace(/pnpm (?:run )?([A-Za-z0-9:_-]+)/g, (whole, ref) =>
    ref in scripts ? `${whole} ${expandScript(scripts, ref, seen)}` : whole,
  );
}

/** Failures of the "verify still chains every gate" rule. */
export function checkVerifyWiring(root) {
  const failures = [];
  const readJson = (p) => {
    try {
      return JSON.parse(readFileSync(join(root, p), 'utf8'));
    } catch {
      return undefined;
    }
  };
  const pkg = readJson('package.json');
  if (!pkg?.scripts?.verify) return ['package.json has no "verify" script'];
  const verify = expandScript(pkg.scripts, 'verify');
  for (const [what, fragment] of VERIFY_MUST_RUN) {
    if (!verify.includes(fragment)) failures.push(`pnpm verify no longer runs the ${what} (${fragment})`);
  }
  for (const dir of ['apps/web', 'packages/core']) {
    const lint = readJson(`${dir}/package.json`)?.scripts?.lint ?? '';
    if (!/--max-warnings[ =]0\b/.test(lint)) failures.push(`${dir}: lint must fail on warnings (--max-warnings 0)`);
  }
  const coreDst = expandScript(readJson('packages/core/package.json')?.scripts ?? {}, 'test');
  if (!coreDst.includes('TZ=Europe/Paris') && !verify.includes('TZ=Europe/Paris')) failures.push('no TZ=Europe/Paris re-run');
  return failures;
}

/** All failures for the checkout at `root` and environment `env`. */
export function checkReleasePosture(root, env = process.env) {
  const failures = [...checkTrustTable(root), ...checkProjectUrl(env), ...checkVerifyWiring(root)];
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');
  for (const path of REQUIRED_ARTIFACTS) if (!existsSync(join(root, path))) failures.push(`missing required artifact: ${path}`);
  if (!read('LICENSE').includes('MIT License')) failures.push('LICENSE does not contain the MIT marker');
  const ndp = read('docs/no-dark-patterns-standard.md').toLowerCase();
  for (const banned of BANNED_EVERYWHERE_BASELINE) {
    if (!ndp.includes(banned)) failures.push(`NDP standard missing banned-everywhere term: "${banned}"`);
  }
  const contributing = read('CONTRIBUTING.md');
  for (const command of CONTRIBUTING_COMMANDS) {
    if (!contributing.includes(command)) failures.push(`CONTRIBUTING.md missing command: ${command}`);
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const urlOnly = process.argv.includes('--project-url-only');
  const failures = urlOnly ? checkProjectUrl(process.env) : checkReleasePosture(process.cwd());
  const name = urlOnly ? 'check:project-url' : 'check:release-posture';
  if (failures.length === 0) {
    console.log(
      urlOnly
        ? `${name}: OK`
        : `${name}: OK - LICENSE, CONTRIBUTING, NDP standard at HEAD; every README trust row has a proof test; pnpm verify chains every gate.`,
    );
  } else {
    console.error(`${name}: FAIL`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}
