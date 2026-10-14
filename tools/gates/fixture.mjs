// Test helper: a throwaway checkout on disk, so a gate can be run against violating and clean trees.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const roots = [];

/** Creates a checkout holding `files` (path -> text) and returns its root. */
export function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'anc-gate-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

export function cleanup() {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
}

/** Runs a tools/*.mjs gate as the CLI would, from `cwd`. */
export function runCli(script, cwd, env = {}, args = []) {
  const r = spawnSync(process.execPath, [join(REPO, 'tools', script), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
