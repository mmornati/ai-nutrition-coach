/**
 * A SHA-256 fingerprint of the photo bytes, used only to bind a one-shot upload permit to the
 * exact photo the person said yes to (never sent, never stored). Port of `photo_digest.dart` and
 * of the Dart `PhotoUploadPermit` (`apps/client/lib/state/ai_rung_provider.dart`).
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

interface Grant {
  readonly host: string;
  readonly digest: string;
}

/**
 * The one-shot permit: the capture flow grants it after the person said yes to the dialog for the
 * photo in hand; the consent-gated rung spends it. It is bound to the host the dialog named and to
 * the SHA-256 of the photo bytes, so it can authorise exactly that upload: a second photo (a retake
 * while the first is still being recognised), another host or any other code path finds it
 * unusable. Holds a digest and a host, never the photo.
 */
export class PhotoUploadPermit {
  private grantRecord: Grant | null = null;

  /** The person agreed to send `bytes` to `host`. */
  async grant(input: { readonly host: string; readonly bytes: Uint8Array }): Promise<void> {
    const record: Grant = {
      host: input.host.toLowerCase(),
      digest: await photoDigest(input.bytes),
    };
    this.grantRecord = record;
  }

  /**
   * Spend the permit: `true` once after a matching `grant`, `false` for any other photo or host (a
   * mismatch leaves the permit unspent for the right photo; `revoke` drops it).
   */
  async consume(input: { readonly host: string; readonly bytes: Uint8Array }): Promise<boolean> {
    const g = this.grantRecord;
    if (g === null) return false;
    const digest = await photoDigest(input.bytes);
    // Re-check after the await: a revoke, a new grant or a concurrent spend changed the record.
    if (this.grantRecord !== g) return false;
    if (g.host !== input.host.toLowerCase() || g.digest !== digest) return false;
    this.grantRecord = null;
    return true;
  }

  /** Drop an unspent permit (the photo was not sent after all). */
  revoke(): void {
    this.grantRecord = null;
  }

  toString(): string {
    return 'PhotoUploadPermit()';
  }
}
