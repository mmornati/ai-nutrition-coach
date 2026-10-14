// A cheap, side-effect-free check the app can run BEFORE it shows the passphrase screens: can this
// browser run the store at all? Safari private browsing and some embedded browsers refuse OPFS
// file handles, and plain HTTP has no WebCrypto. Without the probe those cases would surface as a
// "store lost" screen (the header-less inspection fails) instead of the calm, honest "this browser
// cannot keep private data here" line. It never reports a wrong passphrase, and writes nothing
// that survives (a temporary file is created and removed in a `finally`, best effort).

import { isSecureCryptoAvailable } from './kdf';
import type { UnavailableReason } from './errors';

export type StorageAvailability = 'ok' | Extract<UnavailableReason, 'insecureContext' | 'noOpfs'>;

interface RootLike {
  getFileHandle(name: string, options: { create: true }): Promise<unknown>;
  removeEntry(name: string): Promise<void>;
}

export interface ProbeDeps {
  readonly secure?: () => boolean;
  readonly root?: () => Promise<RootLike>;
}

const PROBE_FILE = '.anc_pwa_probe';

export async function probeStorageAvailability(deps: ProbeDeps = {}): Promise<StorageAvailability> {
  if (!(deps.secure ?? isSecureCryptoAvailable)()) return 'insecureContext';
  const getRoot =
    deps.root ??
    (() => {
      const storage = globalThis.navigator?.storage;
      if (typeof storage?.getDirectory !== 'function') {
        return Promise.reject(new Error('no OPFS'));
      }
      return storage.getDirectory() as unknown as Promise<RootLike>;
    });
  let root: RootLike | null = null;
  let created = false;
  try {
    root = await getRoot();
    await root.getFileHandle(PROBE_FILE, { create: true });
    created = true;
    return 'ok';
  } catch {
    return 'noOpfs';
  } finally {
    // Best effort: a probe file that cannot be removed does not mean the store cannot run, and
    // the next probe reuses (and retries removing) the same name, so nothing accumulates.
    if (created && root) {
      try {
        await root.removeEntry(PROBE_FILE);
      } catch {
        // ignore
      }
    }
  }
}
