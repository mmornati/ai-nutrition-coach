import { describe, expect, it } from 'vitest';
import { probeStorageAvailability } from './storage-probe';

const root = (over: { create?: () => Promise<unknown>; remove?: () => Promise<void> } = {}) => {
  const calls: string[] = [];
  return {
    calls,
    root: () =>
      Promise.resolve({
        getFileHandle: (name: string) => {
          calls.push(`create ${name}`);
          return over.create ? over.create() : Promise.resolve({});
        },
        removeEntry: (name: string) => {
          calls.push(`remove ${name}`);
          return over.remove ? over.remove() : Promise.resolve();
        },
      }),
  };
};

describe('probeStorageAvailability', () => {
  it('is ok when a temporary file can be created, and it removes it again', async () => {
    const r = root();
    expect(await probeStorageAvailability({ secure: () => true, root: r.root })).toBe('ok');
    expect(r.calls).toEqual([
      'create .ai_nutrition_coach_probe',
      'remove .ai_nutrition_coach_probe',
    ]);
  });

  it('plain HTTP (no WebCrypto) is reported as such, touching nothing', async () => {
    const r = root();
    expect(await probeStorageAvailability({ secure: () => false, root: r.root })).toBe(
      'insecureContext',
    );
    expect(r.calls).toEqual([]);
  });

  it('a browser that refuses OPFS file handles (private mode) is "noOpfs"', async () => {
    const refusing = root({ create: () => Promise.reject(new DOMException('x', 'UnknownError')) });
    expect(await probeStorageAvailability({ secure: () => true, root: refusing.root })).toBe(
      'noOpfs',
    );
    const noRoot = () => Promise.reject(new Error('SecurityError'));
    expect(await probeStorageAvailability({ secure: () => true, root: noRoot })).toBe('noOpfs');
  });

  it('a browser without the OPFS API at all is "noOpfs"', async () => {
    expect(await probeStorageAvailability({ secure: () => true })).toBe('noOpfs'); // Node has no OPFS
  });
});
