/**
 * The self-hosted zxing-wasm decoder (docs/pwa.md, "Barcode decoder"). The version, the pins and
 * the served path must agree with `scripts/fetch_web_zxing_pwa.sh` (a unit test enforces it).
 *
 * The decoder is fetched and SHA-256-verified by that script into the git-ignored
 * `apps/web/public/zxing/<version>/`, served from OUR origin at a versioned path (so it can be
 * cached `immutable`), and precached by the PWA so scanning works offline. Nothing is loaded from a
 * CDN. A version bump is a new directory, never an in-place change.
 */
export const ZXING_VERSION = '3.1.1';

/** The reader (IIFE, defines `globalThis.ZXingWASM`), relative to the app origin. */
export const ZXING_READER_PATH = `/zxing/${ZXING_VERSION}/reader.js`;

/** The wasm sits beside the reader. */
export const ZXING_WASM_PATH = `/zxing/${ZXING_VERSION}/zxing_reader.wasm`;
