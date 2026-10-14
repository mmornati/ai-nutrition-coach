// Self-test of tools/check_log_hygiene.mjs.
import { afterEach, describe, expect, it } from 'vitest';
import { scanRepo, scanSource } from '../check_log_hygiene.mjs';
import { REPO, cleanup, makeTree, runCli } from './fixture.mjs';

afterEach(cleanup);
const scan = (code) => scanSource('apps/web/src/x.ts', code);

describe('log hygiene gate: this repository', () => {
  it('passes', () => {
    expect(scanRepo(REPO)).toEqual([]);
  });
});

describe('log hygiene gate: fails on', () => {
  it.each([
    ['an interpolated template', 'console.log(`added ${food}`);'],
    ['a forwarded identifier', 'console.warn(error);'],
    ['a concatenation', "console.info('plate ' + name);"],
    ['a spread', 'console.debug(...args);'],
    ['an object argument', 'console.error({ barcode });'],
    ['an error message', 'console.error(e.message);'],
    ['the global console', 'globalThis.console.log(`x ${food}`);'],
    ['window.console', 'window.console.log(food);'],
    ['a bracket call', "console['log'](food);"],
    ['process.stderr', 'process.stderr.write(`x ${food}`);'],
  ])('%s', (_n, code) => {
    expect(scan(code)).toHaveLength(1);
  });

  it.each([
    ['forEach(console.log)', 'items.forEach(console.log);'],
    ['an alias', 'const log = console.log;'],
    ['a bind', 'const log = console.log.bind(console);'],
    ['destructuring', 'const { log } = console;'],
    ['a callback', 'promise.catch(console.error);'],
    ['a computed method', 'console[method]("x");'],
    ['a global alias', 'const c = globalThis.console;'],
    ['a stream tear-off', 'const w = process.stdout.write;'],
  ])('a tear-off: %s', (_n, code) => {
    expect(scan(code).length).toBeGreaterThan(0);
  });

  it('a marked call that mentions an identifier outside the allow-list', () => {
    const code = '// log-hygiene: content-free\nconsole.debug(`row ${foodName}`);';
    const f = scan(code);
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('"foodName"');
  });
  it('a marked call with a dynamic argument and no allow-listed identifier', () => {
    expect(scan("console.log(getText()); // log-hygiene: content-free").map((f) => f.message).join()).toContain('allowed identifiers');
  });
  it('a marker that is too far away', () => {
    const code = '// log-hygiene: content-free\n\n\nconsole.debug(`row ${rowId}`);';
    expect(scan(code)).toHaveLength(1);
  });
});

describe('log hygiene gate: passes on', () => {
  it.each([
    ['a constant message', "console.log('ready');"],
    ['a constant template', 'console.warn(`unreadable row`);'],
    ['no arguments', 'console.log();'],
    ['a reviewed, allow-listed template (marker above)', '// log-hygiene: content-free\nconsole.debug(`skipped row #${rowId} (${reason})`);'],
    ['a reviewed template (marker on the same line)', 'console.debug(`n=${count}`); // log-hygiene: content-free'],
    ['a reviewed template (marker inside a multi-line call)', 'console.debug(\n  // log-hygiene: content-free\n  `row ${rowId} ${warning.step}`,\n);'],
    ['a property called console on another object', 'const o = { console: 1 }; o.console;'],
    ['a log mentioned in a comment or string', "// console.log(food)\nconst s = 'console.log(food)';"],
  ])('%s', (_n, code) => {
    expect(scan(code)).toEqual([]);
  });
});

describe('log hygiene gate: a checkout', () => {
  it('a violating shipped file fails the CLI (exit 1); a clean tree passes (exit 0); tests are ignored', () => {
    const clean = makeTree({ 'apps/web/src/a.ts': "console.log('hi');", 'apps/web/src/a.test.ts': 'console.log(food);' });
    expect(runCli('check_log_hygiene.mjs', clean).code).toBe(0);
    const dirty = makeTree({ 'apps/web/src/a.ts': 'console.log(food);' });
    const r = runCli('check_log_hygiene.mjs', dirty);
    expect(r.code).toBe(1);
    expect(r.out).toContain('apps/web/src/a.ts:1');
  });
});
