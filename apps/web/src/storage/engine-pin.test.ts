// Port of web_wasm_pin_test.dart: the engine the app loads is the engine the fetch script pins.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { engineBasePath, SQLITE3MC_VERSION } from './engine-pin';
import { ENGINE_DIR } from './testing/node-sqlite';

const repo = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const script = readFileSync(repo('scripts/fetch_web_sqlite3mc.sh'), 'utf8');
const pin = (name: string): string => {
  const match = new RegExp(`^${name}="([^"]*)"`, 'm').exec(script);
  if (!match?.[1]) throw new Error(`${name} is not pinned in scripts/fetch_web_sqlite3mc.sh`);
  return match[1];
};
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('the pinned sqlite3mc wasm build', () => {
  it('carries the fetch script version in its served URL', () => {
    expect(SQLITE3MC_VERSION).toBe(pin('SQLITE3MC_VERSION'));
    expect(engineBasePath('/')).toBe(`/sqlite3mc/${SQLITE3MC_VERSION}/`);
    expect(engineBasePath('/app/')).toBe(`/app/sqlite3mc/${SQLITE3MC_VERSION}/`);
  });

  it('is the 2.5.1 line (2.6.x was deliberately not taken)', () => {
    expect(pin('SQLITE3MC_VERSION')).toBe('2.5.1');
    expect(pin('SQLITE3MC_SQLITE_VERSION')).toBe('3.53.4');
  });

  it('pins the archive and both extracted files with full SHA-256 values', () => {
    for (const name of ['SQLITE3MC_ZIP_SHA256', 'SQLITE3MC_MJS_SHA256', 'SQLITE3MC_WASM_SHA256']) {
      expect(pin(name)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('fails closed: the script verifies the archive before extracting and the files after', () => {
    expect(script).toContain('set -euo pipefail');
    expect(script).toMatch(/SQLITE3MC_ZIP_SHA256.*\n[\s\S]*exit 1/);
    expect(script).toContain('checksum mismatch');
  });

  it('is on disk exactly as pinned (the fetch script ran before the tests)', () => {
    expect(sha256(`${ENGINE_DIR}sqlite3.mjs`)).toBe(pin('SQLITE3MC_MJS_SHA256'));
    expect(sha256(`${ENGINE_DIR}sqlite3.wasm`)).toBe(pin('SQLITE3MC_WASM_SHA256'));
  });

  it('is never committed', () => {
    expect(readFileSync(repo('.gitignore'), 'utf8')).toContain('apps/web/public/sqlite3mc/');
  });
});
