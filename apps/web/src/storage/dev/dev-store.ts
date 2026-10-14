// DEV ONLY. An UNENCRYPTED in-memory store for working on screens without a passphrase round trip.
//
// It is reachable only through create-app-store.ts, behind `import.meta.env.DEV` AND an explicit
// `VITE_DEV_MEMORY_STORE=1`, so a production bundle never contains it (the constant folds to
// `false` and the dynamic import is dropped). tools/check_no_dev_store_in_build.sh fails
// `pnpm verify` if any of it leaks into dist/. While it is active a visible "DEV, not encrypted"
// banner is mounted on the page.

import { assembleStoreBundle, type StoreBundle } from '../store-bundle';
import { InMemoryStoreLock } from '../locks';
import { InMemoryMetaStorage } from '../meta-storage';
import { MemoryBackend } from '../memory-backend';

export const DEV_STORE_BANNER_TEXT = 'DEV, not encrypted';

function mountBanner(): void {
  if (typeof document === 'undefined') return;
  const banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.dataset['devStoreBanner'] = '';
  banner.textContent = DEV_STORE_BANNER_TEXT;
  banner.style.cssText =
    'position:fixed;inset-inline:0;top:0;z-index:2147483647;padding:2px 8px;font:600 12px sans-serif;' +
    'text-align:center;background:#b00020;color:#fff;pointer-events:none;';
  document.body.append(banner);
}

export function createDevMemoryStoreBundle(): StoreBundle {
  mountBanner();
  return assembleStoreBundle({
    storage: new InMemoryMetaStorage(),
    backend: new MemoryBackend(),
    lock: new InMemoryStoreLock(),
    // The dev store has no WebCrypto requirement: it never derives a key.
    isSecureContext: () => true,
    // No OPFS involved: nothing to probe.
    probe: () => Promise.resolve('ok'),
    autoLock: false,
  });
}
