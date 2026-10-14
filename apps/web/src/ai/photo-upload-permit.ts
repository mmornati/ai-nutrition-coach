import type { PhotoDigest } from './types';

/**
 * A one-shot "yes, send THIS photo to THIS host". The capture screen grants it after the person
 * said yes in the dialog for the photo in hand; `ConsentGatedAiRung` consumes it. It is bound to
 * the host the dialog named and to the SHA-256 of the photo bytes, so it authorises exactly that
 * upload: a second photo (a retake while the first is still being recognised), another host or
 * any other code path finds it unusable. Nothing is remembered once it is spent.
 */
export class PhotoUploadPermit {
  readonly #digest: PhotoDigest;
  #grant: { host: string; digest: string } | null = null;
  #closed = false;

  constructor(digest: PhotoDigest) {
    this.#digest = digest;
  }

  /** The person agreed to send `bytes` to `host`. */
  async grant(args: { host: string; bytes: Uint8Array }): Promise<void> {
    const digest = await this.#digest(args.bytes);
    if (this.#closed) return;
    this.#grant = { host: args.host.toLowerCase(), digest };
  }

  /**
   * Spends the permit: `true` once after a matching grant, `false` for any other photo or host
   * (a mismatch leaves the permit unspent for the right photo; `revoke` drops it). The check and
   * the spend are one synchronous step, so two concurrent calls cannot both succeed.
   */
  async consume(args: { host: string; bytes: Uint8Array }): Promise<boolean> {
    let digest: string;
    try {
      digest = await this.#digest(args.bytes);
    } catch {
      return false;
    }
    const g = this.#grant;
    if (g === null) return false;
    if (g.host !== args.host.toLowerCase() || g.digest !== digest) return false;
    this.#grant = null;
    return true;
  }

  /** Drops an unspent permit (the photo was not sent after all). */
  revoke(): void {
    this.#grant = null;
  }

  /** The session ended: drops any permit and ignores a grant still being computed. */
  close(): void {
    this.#closed = true;
    this.#grant = null;
  }

  toString(): string {
    return 'PhotoUploadPermit()';
  }
}
