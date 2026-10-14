// Names and limits of the encrypted web store (docs/adr/0005-web-encrypted-store.md). Everything
// persisted in the browser uses the `anc.pwa.` / `anc_pwa` / `anc-pwa` prefixes, which can never
// collide with the earlier web build (`ai_nutrition_coach*`) on a shared origin: the eraser
// and the sweeps only ever touch the new names.

/** localStorage: the non-secret store header (salt + KDF parameters). */
export const STORE_META_KEY = 'anc.pwa.store.meta';

/** localStorage: the idle auto-lock choice, in minutes. */
export const LOCK_IDLE_MINUTES_KEY = 'anc.pwa.lock.idleMinutes';

/** Every localStorage key this app owns starts with this; the eraser sweeps by it. */
export const STORAGE_KEY_PREFIX = 'anc.pwa.';

/** IndexedDB database holding a COPY of the header, so losing localStorage alone is recoverable. */
export const HEADER_DB_NAME = 'anc_pwa_header_v1';

/** Web Locks name: one tab at a time holds the store open. */
export const STORE_LOCK_NAME = 'anc-pwa-store';

/** OPFS directory of the `opfs-sahpool` VFS. Erasing the store removes exactly this directory. */
export const OPFS_POOL_DIRECTORY = '.anc_pwa_store';

/** Name the pooled VFS is registered under inside the worker. */
export const OPFS_VFS_NAME = 'anc-pwa-sahpool';

/** The one database file inside the pool. */
export const DATABASE_FILENAME = '/anc_pwa.db';

/** Header/format version; bump together with any change to cipher or key derivation. */
export const STORE_FORMAT_VERSION = 1;

/** Schema version stored in `PRAGMA user_version`. A newer value is refused, never opened. */
export const SCHEMA_VERSION = 1;

/** The only cipher this app writes. Pinned explicitly so a future sqlite3mc default cannot change it. */
export const PINNED_CIPHER = 'chacha20';

/** The idle auto-lock choices the UI offers (minutes). Stored values are clamped to these. */
export const IDLE_MINUTE_CHOICES = [5, 15, 30, 60] as const;
export const DEFAULT_IDLE_MINUTES = 15;

/** Lock after the page has been hidden this long. */
export const DEFAULT_HIDDEN_LOCK_MS = 5 * 60_000;

/** New-passphrase floor. */
export const PASSPHRASE_MIN_LENGTH = 10;
export const PASSPHRASE_MIN_DISTINCT = 4;

/** Name of the store worker (devtools only). */
export const STORE_WORKER_NAME = 'anc-pwa-store';
