// The hash-wasm Argon2id build the encrypted backup derives its key with (docs/pwa.md, "Argon2id
// for the encrypted backup"). The version, the pins and the served path must agree with
// `scripts/fetch_web_argon2.sh` (argon2-pin.test.ts keeps the two in step).
//
// The script fetches and SHA-256-verifies the file into the git-ignored
// `apps/web/public/argon2/<version>/`; it is served from OUR origin at a versioned path (so it can
// be cached `immutable`), precached by the PWA so a backup can be made and opened offline, and
// loaded only inside the Argon2 worker. Nothing comes from a CDN. A version bump is a new
// directory, never an in-place change.
export const ARGON2_VERSION = '4.12.0';

/** The UMD build (it defines `globalThis.hashwasm`; the wasm is embedded in the file). */
export const ARGON2_FILE = 'argon2.umd.min.js';

/** Where the build is served from, relative to the app base (`import.meta.env.BASE_URL`). */
export const argon2ScriptPath = (baseUrl: string): string =>
  `${baseUrl}argon2/${ARGON2_VERSION}/${ARGON2_FILE}`;
