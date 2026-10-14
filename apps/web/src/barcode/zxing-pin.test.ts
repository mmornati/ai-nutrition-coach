// The self-hosted barcode decoder (ADR-0003): the path the app asks for, the version the fetch
// script pins, and the pins themselves must agree and be real SHA-256 values. Ported from
// apps/client/test/state/web_zxing_pin_test.dart. It reads the fetch script from disk.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ZXING_READER_PATH, ZXING_VERSION, ZXING_WASM_PATH } from './zxing-pin';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const script = read('../../../../scripts/fetch_web_zxing_pwa.sh');
const pin = (name: string): string => new RegExp(`${name}="([^"]+)"`).exec(script)![1]!;

describe('zxing pin', () => {
  it('the script version matches the path the app loads the reader from', () => {
    expect(pin('ZXING_WASM_VERSION')).toBe(ZXING_VERSION);
    expect(ZXING_VERSION).toBe('3.1.1');
    expect(ZXING_READER_PATH).toBe(`/zxing/${ZXING_VERSION}/reader.js`);
    expect(ZXING_WASM_PATH).toBe(`/zxing/${ZXING_VERSION}/zxing_reader.wasm`);
  });

  it('every pin is a SHA-256 and the download is https from npm', () => {
    for (const name of [
      'ZXING_TARBALL_SHA256',
      'ZXING_READER_PATCHED_SHA256',
      'ZXING_WASM_SHA256',
    ]) {
      expect(pin(name), name).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(script).toContain('https://registry.npmjs.org/zxing-wasm/-/');
    expect(script).not.toContain('http://');
    expect(script).toContain('set -euo pipefail');
  });

  it('the three pins are the SAME as the Flutter build (the SPEC): tarball, patched reader, wasm', () => {
    const flutter = read('../../../../scripts/fetch_web_zxing.sh');
    for (const name of [
      'ZXING_WASM_VERSION',
      'ZXING_TARBALL_SHA256',
      'ZXING_READER_PATCHED_SHA256',
      'ZXING_WASM_SHA256',
    ]) {
      expect(new RegExp(`${name}="([^"]+)"`).exec(flutter)![1], name).toBe(pin(name));
    }
    expect(pin('ZXING_TARBALL_SHA256')).toMatch(/^294f1c96/);
    expect(pin('ZXING_READER_PATCHED_SHA256')).toMatch(/^a82be6b3/);
    expect(pin('ZXING_WASM_SHA256')).toMatch(/^6a858c01/);
  });

  it('it fails closed: a checksum mismatch aborts before anything is shipped, with a repin mode that never passes', () => {
    expect(script).toContain('checksum mismatch');
    expect(script.match(/exit 1/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(script).toContain('ZXING_ALLOW_REPIN');
    expect(script).toContain('--self-test');
    // Verification happens BEFORE the output directory is created.
    expect(script.indexOf('check_pins "$PATCHED" "$WASM"')).toBeLessThan(
      script.indexOf('mkdir -p "$OUT"\ncp'),
    );
  });

  it('output is git-ignored, never committed; dev/build/test/e2e all fetch it; verify runs the self-test', () => {
    expect(read('../../../../.gitignore')).toContain('apps/web/public/zxing/');
    const pkg = JSON.parse(read('../../package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['fetch:zxing']).toContain('fetch_web_zxing_pwa.sh');
    for (const name of ['dev', 'build', 'test', 'e2e']) {
      expect(pkg.scripts[name], name).toContain('fetch:assets');
    }
    expect(pkg.scripts['fetch:assets']).toContain('fetch:zxing');
    const root = JSON.parse(read('../../../../package.json')) as {
      scripts: Record<string, string>;
    };
    expect(root.scripts['verify']).toContain('fetch_web_zxing_pwa.sh --self-test');
  });
});
