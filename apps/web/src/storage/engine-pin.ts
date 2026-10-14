// The SQLite3 Multiple Ciphers wasm build the store runs on. The version is the directory name
// scripts/fetch_web_sqlite3mc.sh writes to (`public/sqlite3mc/<version>/`), so the served URL is
// versioned and can be cached `immutable`; src/storage/engine-pin.test.ts keeps the two in step.
export const SQLITE3MC_VERSION = '2.5.1';

/** Directory (with a trailing slash) the engine is served from, relative to the app base. */
export function engineBasePath(baseUrl: string): string {
  return `${baseUrl}sqlite3mc/${SQLITE3MC_VERSION}/`;
}
