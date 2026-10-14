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
    expect(r.calls).toEqual(['create .anc_pwa_probe', 'remove .anc_pwa_probe']);
  });

  it('a probe file that cannot be removed does not make the store unavailable', async () => {
    const r = root({ remove: () => Promise.reject(new DOMException('busy', 'InvalidStateError')) });
    expect(await probeStorageAvailability({ secure: () => true, root: r.root })).toBe('ok');
    expect(r.calls).toHaveLength(2);
  });

  it('a failed creation leaves nothing to remove and never tries', async () => {
    const r = root({ create: () => Promise.reject(new DOMException('x', 'UnknownError')) });
    await probeStorageAvailability({ secure: () => true, root: r.root });
    expect(r.calls).toEqual(['create .anc_pwa_probe']);
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
