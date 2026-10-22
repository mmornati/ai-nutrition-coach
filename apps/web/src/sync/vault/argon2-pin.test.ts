// The self-hosted Argon2id build: the path the worker asks for, the version the fetch script pins,
// and the pins themselves must agree and be real SHA-256 values. It reads the fetch script from disk.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARGON2_FILE, ARGON2_VERSION, argon2ScriptPath } from './argon2-pin';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const script = read('../../../../../scripts/fetch_web_argon2.sh');
const pin = (name: string): string => new RegExp(`${name}="([^"]+)"`).exec(script)![1]!;

describe('argon2 pin', () => {
  it('the script version matches the path the worker loads the build from', () => {
    expect(pin('HASH_WASM_VERSION')).toBe(ARGON2_VERSION);
    expect(ARGON2_VERSION).toBe('4.12.0');
    expect(argon2ScriptPath('/')).toBe(`/argon2/${ARGON2_VERSION}/${ARGON2_FILE}`);
    expect(argon2ScriptPath('/app/')).toBe('/app/argon2/4.12.0/argon2.umd.min.js');
    expect(script).toContain(`package/dist/${ARGON2_FILE}`);
    expect(script).toContain('$OUT/argon2.umd.min.js');
  });

  it('every pin is a SHA-256 and the download is https from npm', () => {
    for (const name of [
      'ARGON2_TARBALL_SHA256',
      'ARGON2_PATCHED_SHA256',
      'ARGON2_LICENSE_SHA256',
    ]) {
      expect(pin(name), name).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(script).toContain('https://registry.npmjs.org/hash-wasm/-/');
    expect(script).not.toContain('http://');
    expect(script).toContain('set -euo pipefail');
  });

  it('the pins are the reviewed ones: tarball, patched build', () => {
    expect(pin('ARGON2_TARBALL_SHA256')).toMatch(/^1db32a12/);
    expect(pin('ARGON2_PATCHED_SHA256')).toMatch(/^c1588d51/);
  });

  it('it fails closed: a checksum mismatch aborts before anything is shipped, with a repin mode that never passes', () => {
    expect(script).toContain('checksum mismatch');
    expect(script.match(/exit 1/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(script).toContain('ARGON2_ALLOW_REPIN');
    expect(script).toContain('--self-test');
    // Verification happens BEFORE the output directory is created.
    expect(script.indexOf('check_pins "$PATCHED"')).toBeLessThan(
      script.indexOf('mkdir -p "$OUT"\ncp'),
    );
  });

  it('output is git-ignored, never committed; dev/build/test/e2e all fetch it; verify runs the self-test', () => {
    expect(read('../../../../../.gitignore')).toContain('apps/web/public/argon2/');
    const pkg = JSON.parse(read('../../../package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['fetch:argon2']).toContain('fetch_web_argon2.sh');
    for (const name of ['dev', 'build', 'test', 'e2e']) {
      expect(pkg.scripts[name], name).toContain('fetch:assets');
    }
    expect(pkg.scripts['fetch:assets']).toContain('fetch:argon2');
    const root = JSON.parse(read('../../../../../package.json')) as {
      scripts: Record<string, string>;
    };
    expect(root.scripts['verify']).toContain('pnpm selftest:scanners');
    expect(root.scripts['selftest:scanners']).toContain('fetch_web_argon2.sh --self-test');
  });

  it('the image fetches it, nginx serves it immutable, and the precache requires it', () => {
    expect(read('../../../../../infra/Dockerfile')).toContain('bash scripts/fetch_web_argon2.sh');
    expect(read('../../../../../infra/nginx/templates/ai-nutrition-coach.conf.template')).toContain(
      'location ~ ^/argon2/[0-9][0-9.]*/ {',
    );
    expect(read('../../../../../tools/generate_precache_manifest.mjs')).toContain(
      'argon2/<ver>/argon2.umd.min.js',
    );
  });
});
