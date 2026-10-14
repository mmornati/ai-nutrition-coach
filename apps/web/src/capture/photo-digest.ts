/**
 * A SHA-256 fingerprint of the photo bytes, used only to bind a one-shot upload permit to the
 * exact photo the person said yes to (never sent, never stored). Port of the earlier client.
 * It is injected into the ONE permit, `PhotoUploadPermit` in `src/ai` (`new PhotoUploadPermit(photoDigest)`).
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lower-case hex SHA-256 of `bytes` (WebCrypto; available on every supported browser). */
export async function photoDigest(bytes: Uint8Array): Promise<string> {
  // Copy into a plain ArrayBuffer so a view onto a larger / shared buffer hashes exactly `bytes`.
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', view));
  let out = '';
  for (const b of digest) out += HEX[b];
  return out;
}
