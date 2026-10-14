// The dev-only unencrypted store must not be reachable from a production bundle. This builds a real
// production bundle of an entry that imports createAppStore() (exactly what the app will do) and
// checks that the dev branch, its chunk, its banner and the dev flag are gone, even when the flag
// is set in the environment, while the encrypted store's worker and engine wiring are present.
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

async function productionBundle(): Promise<{ names: string[]; code: string }> {
  // `vite build` runs with NODE_ENV=production; Vitest sets it to "test", which would keep DEV true.
  process.env['NODE_ENV'] = 'production';
  const result = (await build({
    configFile: false,
    root,
    mode: 'production',
    logLevel: 'silent',
    worker: { format: 'es' },
    build: {
      write: false,
      minify: false,
      target: 'es2023',
      lib: { entry: 'src/storage/testing/prod-entry.ts', formats: ['es'], fileName: 'entry' },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const files = (Array.isArray(result) ? result : [result]).flatMap((o) => o.output);
  return {
    names: files.map((f) => f.fileName),
    code: files.map((f) => (f.type === 'chunk' ? f.code : '')).join('\n'),
  };
}

const originalNodeEnv = process.env['NODE_ENV'];
afterEach(() => {
  delete process.env['VITE_DEV_MEMORY_STORE'];
  process.env['NODE_ENV'] = originalNodeEnv;
});

describe('a production bundle of createAppStore()', () => {
  it('contains no dev store, no banner and no dev flag, even with VITE_DEV_MEMORY_STORE=1', async () => {
    process.env['VITE_DEV_MEMORY_STORE'] = '1';
    const { names, code } = await productionBundle();
    expect(code).not.toContain('DEV, not encrypted');
    expect(code).not.toContain('VITE_DEV_MEMORY_STORE');
    expect(code).not.toContain('data-dev-store-banner');
    expect(code).not.toContain('MemoryStoreDb');
    expect(code).not.toContain('MemoryBackend');
    expect(names.filter((n) => /dev-store|memory-store/i.test(n))).toEqual([]);
  }, 60_000);

  it('does contain the encrypted store wiring (a module worker and the versioned engine path)', async () => {
    const { names, code } = await productionBundle();
    expect(code).toContain('sqlite3mc/');
    expect(code).toContain('WorkerStoreBackend');
    expect(code).toContain('ai-nutrition-coach-store');
    expect(names.some((n) => /store\.worker/.test(n))).toBe(true);
  }, 60_000);
});
