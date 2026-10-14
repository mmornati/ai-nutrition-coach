// The one factory the app calls to get its store. Production: the encrypted sqlite3mc store.
// Development: `VITE_DEV_MEMORY_STORE=1` swaps in the UNENCRYPTED in-memory store (with a visible
// banner). `import.meta.env.DEV` is replaced by `false` in a release build, so the dev branch, its
// dynamic import and its chunk are removed by the bundler; the check script proves it.

import { createBrowserStoreBundle, type StoreBundle } from './store-bundle';

export async function createAppStore(): Promise<StoreBundle> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_MEMORY_STORE === '1') {
    const { createDevMemoryStoreBundle } = await import('./dev/dev-store');
    return createDevMemoryStoreBundle();
  }
  return createBrowserStoreBundle();
}
