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
    ['process.stdout by bracket', "process['stdout'].write(name);"],
    ['process.stderr by bracket with a bracket write', "process['stderr']['write'](name);"],
    ['process.stdout.write', 'process.stdout.write(food);'],
    ['globalThis by bracket', "globalThis['console'].log(food);"],
    ['window by double bracket', "window['console']['log'](food);"],
    ['an aliased global', 'const g = globalThis; g.console.log(food);'],
    ['an aliased global by bracket', "const g = window; g['console'].warn(food);"],
    ['reportError with content', 'reportError(new Error(name));'],
    ['globalThis.reportError with content', 'globalThis.reportError(food);'],
    ['a marker that names an unlisted member via element access', "// log-hygiene: content-free\nconsole.log(`${id['foodName']}`);"],
    ['a marker with a computed element access', '// log-hygiene: content-free\nconsole.log(`${row[key]}`);'],
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
    ['a bracket stream tear-off', "const w = process['stdout'].write;"],
    ['Reflect.get on the global', "Reflect.get(globalThis, 'console').log(food);"],
    ['Reflect.get on an alias with a computed key', 'const g = window; Reflect.get(g, key).log(1);'],
    ['Reflect.apply of console.log', 'Reflect.apply(console.log, console, [food]);'],
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
    ['a marked element access whose key is allow-listed', "// log-hygiene: content-free\nconsole.debug(`row ${warning['step']} ${warning['reason']}`);"],
    ['a constant reportError', "reportError('boot failed');"],
    ['a constant stream write', "process.stdout.write('ready\\n');"],
    ['a bracket console with a constant', "globalThis['console'].log('ready');"],
  ])('%s', (_n, code) => {
    expect(scan(code)).toEqual([]);
  });

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
  it('the shipped public scripts (boot-guard.js) are scanned', () => {
    const root = makeTree({ 'apps/web/public/boot-guard.js': 'console.log(document.title);' });
    const r = runCli('check_log_hygiene.mjs', root);
    expect(r.code).toBe(1);
    expect(r.out).toContain('apps/web/public/boot-guard.js:1');
  });
});
