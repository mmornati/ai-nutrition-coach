// Self-test of tools/check_release_posture.mjs: the README trust table rule, the verify wiring,
// LICENSE / CONTRIBUTING / NDP artifacts and the project-URL mode.
import { afterEach, describe, expect, it } from 'vitest';
import {
  BANNED_EVERYWHERE_BASELINE,
  CONTRIBUTING_COMMANDS,
  VERIFY_MUST_RUN,
  checkCiRunsVerify,
  checkReleasePosture,
  checkTrustTable,
  checkVerifyWiring,
  expandScript,
  hasRealTest,
} from '../check_release_posture.mjs';
import { REPO, cleanup, makeTree, runCli } from './fixture.mjs';

afterEach(cleanup);

describe('hasRealTest', () => {
  it.each([
    ["test('a', () => {});"],
    ["it('a', () => {});"],
    ["describe('s', () => { it('a', () => {}); });"],
    ["it.each([1, 2])('a %s', () => {});"],
    ["test.only('a', () => {});"],
    ["test.describe('s', () => { test('a', async () => {}); });"],
    ["test('a', () => { test.skip(browserName === 'webkit', 'needs a camera'); });"],
  ])('counts %s', (code) => expect(hasRealTest(code)).toBe(true));

  it.each([
    ['nothing at all', ''],
    ['a comment', "// test('a', () => {});"],
    ['a string', "const s = \"test('a', () => {})\";"],
    ['it.skip', "it.skip('a', () => {});"],
    ['test.skip', "test.skip('a', () => {});"],
    ['it.todo', "it.todo('a');"],
    ['test.fixme', "test.fixme('a', () => {});"],
    ['it.skipIf', "it.skipIf(true)('a', () => {});"],
    ['an options skip', "test('a', { skip: true }, () => {});"],
    ['a skipped suite', "describe.skip('s', () => { it('a', () => {}); });"],
    ['a skipped playwright suite', "test.describe.skip('s', () => { test('a', () => {}); });"],
    ['a describe with no test', "describe('s', () => {});"],
    ['a helper called testing', "testing('a', () => {});"],
  ])('does not count %s', (_n, code) => expect(hasRealTest(code)).toBe(false));
});

const README = (rows) => `# x\n\n## Trust posture\n\n| Promise | Where it lives | Proof |\n| --- | --- | --- |\n${rows}\n\n## Next\n`;
const GOOD_TEST = "import { it } from 'vitest';\nit('works', () => {});\n";

describe('README trust table', () => {
  it('this repository passes', () => {
    expect(checkTrustTable(REPO)).toEqual([]);
  });
  it('a row with a real proof passes', () => {
    const root = makeTree({ 'README.md': README('| p | a | `a/x.test.ts`, `e2e/y.spec.ts` |'), 'a/x.test.ts': GOOD_TEST, 'e2e/y.spec.ts': "test('y', async () => {});" });
    expect(checkTrustTable(root)).toEqual([]);
  });
  it.each([
    ['no proof cell', '| a promise | here | |', 'has no proof test'],
    ['a prose-only proof', '| a promise | here | covered by tests |', 'has no proof test'],
    ['a missing file', '| a promise | here | `a/gone.test.ts` |', 'does not exist'],
    ['a file with no test', '| a promise | here | `a/empty.test.ts` |', 'contains no un-skipped test'],
    ['a file with only a skipped test', '| a promise | here | `a/skipped.test.ts` |', 'contains no un-skipped test'],
    ['a non-test proof', '| a promise | here | `a/x_helper.js` |', 'is not a *.test.*'],
    ['a non-test file', '| a promise | here | `a/helper.ts` |', 'is not a *.test.*'],
    ['one good and one missing proof', '| a promise | here | `a/x.test.ts`, `a/missing.test.ts` |', 'does not exist'],
  ])('fails on %s', (_n, row, expected) => {
    const root = makeTree({
      'README.md': README(row),
      'a/x.test.ts': GOOD_TEST,
      'a/empty.test.ts': '// nothing\n',
      'a/skipped.test.ts': "it.skip('x', () => {});\n",
      'a/helper.ts': 'export {};\n',
    });
    expect(checkTrustTable(root).join('\n')).toContain(expected);
  });
  it('fails when the section, the table or the Proof column is missing', () => {
    expect(checkTrustTable(makeTree({ 'README.md': '# x\n' }))).toEqual(['README.md has no "## Trust posture" section']);
    expect(checkTrustTable(makeTree({ 'README.md': '# x\n\n## Trust posture\n\nnone\n' }))).toEqual(['README trust table not found or empty']);
    expect(checkTrustTable(makeTree({ 'README.md': '## Trust posture\n\n| A | B |\n| - | - |\n| x | y |\n' }))).toEqual(['README trust table has no "Proof" column']);
    expect(checkTrustTable(makeTree({}))).toEqual(['README.md is missing']);
  });
  describe('a shell script as proof', () => {
    const base = (extra = {}) => ({
      'README.md': README('| p | a | `a/x.test.ts`, `scripts/egress.sh` |'),
      'a/x.test.ts': GOOD_TEST,
      'scripts/egress.sh': '#!/bin/sh\n',
      '.github/workflows/smoke.yml': 'jobs:\n  s:\n    steps:\n      - run: bash scripts/egress.sh\n',
      ...extra,
    });
    it('passes beside a real test when it exists and a workflow invokes it', () => {
      expect(checkTrustTable(makeTree(base()))).toEqual([]);
    });
    it('fails when no workflow invokes it', () => {
      const root = makeTree(base({ '.github/workflows/smoke.yml': 'jobs: {}\n' }));
      expect(checkTrustTable(root).join('\n')).toContain('not invoked by any workflow');
    });
    it('fails when it does not exist', () => {
      const files = base();
      delete files['scripts/egress.sh'];
      expect(checkTrustTable(makeTree(files)).join('\n')).toContain('proof script does not exist');
    });
    it('fails when the only proof is a script (a script alone is not a test)', () => {
      const root = makeTree(base({ 'README.md': README('| p | a | `scripts/egress.sh` |') }));
      expect(checkTrustTable(root).join('\n')).toContain('a script alone is not a test');
    });
    it('a script outside scripts/ and tools/ is not accepted', () => {
      const root = makeTree(base({ 'README.md': README('| p | a | `a/x.test.ts`, `other/egress.sh` |'), 'other/egress.sh': 'x' }));
      expect(checkTrustTable(root).join('\n')).toContain('is not a *.test.*');
    });
  });
  it('checks EVERY row, not just the first', () => {
    const root = makeTree({ 'README.md': README('| one | a | `a/x.test.ts` |\n| two | a | |'), 'a/x.test.ts': GOOD_TEST });
    expect(checkTrustTable(root)).toHaveLength(1);
  });
});

describe('verify wiring', () => {
  const pkgs = (verify, scripts = {}, lint = 'eslint . --max-warnings 0') => ({
    'package.json': JSON.stringify({ scripts: { verify, ...scripts } }),
    'apps/web/package.json': JSON.stringify({ scripts: { lint } }),
    'packages/core/package.json': JSON.stringify({ scripts: { lint, test: 'TZ=Europe/Paris vitest' } }),
  });
  const FULL = VERIFY_MUST_RUN.map(([, f]) => f).join(' && ');
  it('this repository passes', () => {
    expect(checkVerifyWiring(REPO)).toEqual([]);
  });
  it('a verify that chains every gate passes (also through sub-scripts)', () => {
    expect(checkVerifyWiring(makeTree(pkgs(FULL)))).toEqual([]);
    const half = VERIFY_MUST_RUN.slice(0, 6).map(([, f]) => f).join(' && ');
    const rest = VERIFY_MUST_RUN.slice(6).map(([, f]) => f).join(' && ');
    expect(checkVerifyWiring(makeTree(pkgs(`${half} && pnpm gates`, { gates: rest })))).toEqual([]);
  });
  it.each(VERIFY_MUST_RUN)('fails when verify drops the %s', (what, fragment) => {
    const reduced = VERIFY_MUST_RUN.filter(([, f]) => f !== fragment).map(([, f]) => f).join(' && ');
    const failures = checkVerifyWiring(makeTree(pkgs(reduced)));
    expect(failures.join('\n')).toContain(what);
  });
  it.each([
    ['|| true', 'pnpm check:telemetry || true'],
    ['; true', 'pnpm check:telemetry; true'],
    ['|| exit 0', 'pnpm check:telemetry || exit 0'],
    ['|| :', 'pnpm check:telemetry || :'],
    ['|| echo', 'pnpm check:telemetry || echo skipped'],
    [';exit 0', 'pnpm check:telemetry ;exit 0'],
  ])('fails when a gate is followed by %s (directly or inside a sub-script)', (_n, tail) => {
    const direct = checkVerifyWiring(makeTree(pkgs(`${FULL} && ${tail}`)));
    expect(direct.join('\n')).toContain('swallows a failure');
    const viaScript = checkVerifyWiring(makeTree(pkgs(`${FULL} && pnpm gates`, { gates: tail })));
    expect(viaScript.join('\n')).toContain('swallows a failure');
  });
  it('fails when lint tolerates warnings, or there is no verify script', () => {
    expect(checkVerifyWiring(makeTree(pkgs(FULL, {}, 'eslint .'))).join()).toContain('--max-warnings 0');
    expect(checkVerifyWiring(makeTree({ 'package.json': '{"scripts":{}}' }))).toEqual(['package.json has no "verify" script']);
  });
  it('expandScript follows pnpm references once and survives cycles', () => {
    expect(expandScript({ a: 'pnpm b && x', b: 'y' }, 'a')).toContain('y');
    expect(() => expandScript({ a: 'pnpm run b', b: 'pnpm a' }, 'a')).not.toThrow();
  });
});

describe('artifacts, NDP list, CONTRIBUTING, project URL', () => {
  const GOOD = () => ({
    LICENSE: 'MIT License\n',
    'CONTRIBUTING.md': CONTRIBUTING_COMMANDS.join('\n'),
    'docs/release-checklist.md': 'x',
    'docs/no-dark-patterns-standard.md': BANNED_EVERYWHERE_BASELINE.join('\n'),
    'README.md': README('| p | a | `a/x.test.ts` |'),
    'a/x.test.ts': GOOD_TEST,
    'package.json': JSON.stringify({ scripts: { verify: VERIFY_MUST_RUN.map(([, f]) => f).join(' && ') } }),
    'apps/web/package.json': '{"scripts":{"lint":"eslint . --max-warnings 0"}}',
    'packages/core/package.json': '{"scripts":{"lint":"eslint . --max-warnings 0","test":"TZ=Europe/Paris vitest"}}',
    '.github/workflows/ci.yml': `jobs:\n  a:\n    steps:\n${VERIFY_MUST_RUN.map(([, f]) => `      - run: ${f}\n`).join('')}`,
  });
  it('this repository passes', () => {
    expect(checkReleasePosture(REPO, {})).toEqual([]);
  });
  it('a complete fixture passes', () => {
    expect(checkReleasePosture(makeTree(GOOD()), {})).toEqual([]);
  });
  it('fails on a missing LICENSE / CONTRIBUTING / NDP standard / checklist', () => {
    for (const file of ['LICENSE', 'CONTRIBUTING.md', 'docs/no-dark-patterns-standard.md', 'docs/release-checklist.md']) {
      const files = GOOD();
      delete files[file];
      expect(checkReleasePosture(makeTree(files), {}).join('\n')).toContain(`missing required artifact: ${file}`);
    }
  });
  it('fails when LICENSE is not MIT', () => {
    expect(checkReleasePosture(makeTree({ ...GOOD(), LICENSE: 'Apache License' }), {}).join()).toContain('MIT');
  });
  it.each(BANNED_EVERYWHERE_BASELINE)('fails when the NDP standard drops "%s"', (term) => {
    const doc = BANNED_EVERYWHERE_BASELINE.filter((t) => t !== term).join('\n');
    expect(checkReleasePosture(makeTree({ ...GOOD(), 'docs/no-dark-patterns-standard.md': doc }), {}).join()).toContain(term);
  });
  it.each(CONTRIBUTING_COMMANDS)('fails when CONTRIBUTING.md drops "%s"', (cmd) => {
    const doc = CONTRIBUTING_COMMANDS.filter((c) => c !== cmd).join('\n');
    expect(checkReleasePosture(makeTree({ ...GOOD(), 'CONTRIBUTING.md': doc }), {}).join()).toContain(cmd);
  });
  it('applies the project-URL rule to release builds', () => {
    const root = makeTree(GOOD());
    expect(checkReleasePosture(root, { AI_NUTRITION_COACH_BUILD: 'release' })).toEqual([]);
    expect(checkReleasePosture(root, { AI_NUTRITION_COACH_BUILD: 'release', AI_NUTRITION_COACH_PROJECT_URL: 'https://x.invalid/p' })).not.toEqual([]);
  });
});

describe('CI runs every step of pnpm verify', () => {
  const tree = (verify, ci) =>
    makeTree({
      'package.json': JSON.stringify({ scripts: { verify } }),
      ...(ci === undefined ? {} : { '.github/workflows/ci.yml': ci }),
    });
  const CI = [
    'jobs:',
    '  a:',
    '    steps:',
    '      - name: Format',
    '        run: pnpm format:check',
    '      - run: pnpm test',
    '      - name: DST',
    '        run: |',
    '          pnpm --filter x run fetch',
    '          pnpm test:dst',
    '',
  ].join('\n');
  it('passes when every step is a run line (single, list item or block line)', () => {
    expect(checkCiRunsVerify(tree('pnpm format:check && pnpm test && pnpm test:dst', CI))).toEqual([]);
  });
  it('fails on a verify step CI does not run', () => {
    expect(checkCiRunsVerify(tree('pnpm format:check && pnpm guards', CI))).toEqual([
      '.github/workflows/ci.yml does not run the pnpm verify step "pnpm guards"',
    ]);
  });
  it('does not take a longer command or a comment for the step', () => {
    const ci = 'steps:\n  - run: pnpm test:dst\n  # pnpm test\n  - run: echo pnpm test\n';
    expect(checkCiRunsVerify(tree('pnpm test', ci))).toEqual(['.github/workflows/ci.yml does not run the pnpm verify step "pnpm test"']);
  });
  it('fails when ci.yml is missing, and leaves a missing verify to the wiring rule', () => {
    expect(checkCiRunsVerify(tree('pnpm test', undefined))).toEqual([
      '.github/workflows/ci.yml is missing: CI must run every step of pnpm verify',
    ]);
    expect(checkCiRunsVerify(makeTree({ 'package.json': '{"scripts":{}}' }))).toEqual([]);
  });
});

describe('CLI exit codes', () => {
  it('the repository passes (exit 0)', () => {
    expect(runCli('check_release_posture.mjs', REPO, {}).code).toBe(0);
  });
  it('a broken tree fails (exit 1)', () => {
    const root = makeTree({ 'README.md': README('| p | a | |') });
    const r = runCli('check_release_posture.mjs', root, {});
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release-posture: FAIL');
  });
  it('--project-url-only checks only the URL rule (no README, no docs needed)', () => {
    const root = makeTree({});
    const run = (env) => runCli('check_release_posture.mjs', root, env, ['--project-url-only']);
    expect(run({ AI_NUTRITION_COACH_BUILD: '', AI_NUTRITION_COACH_PROJECT_URL: '' }).code).toBe(0);
    expect(run({ AI_NUTRITION_COACH_BUILD: 'release', AI_NUTRITION_COACH_PROJECT_URL: '' }).code).toBe(0);
    expect(run({ AI_NUTRITION_COACH_BUILD: 'selfhost', AI_NUTRITION_COACH_PROJECT_URL: 'https://x.invalid/p' }).code).toBe(1);
    expect(run({ AI_NUTRITION_COACH_BUILD: '', AI_NUTRITION_COACH_PROJECT_URL: 'http://x.test' }).code).toBe(1);
  });
});
