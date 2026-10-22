// Seal and open a vault envelope: AES-256-GCM over a plaintext, with every header field bound as
// associated data (`envelopeAadText` in @anc/core), so a changed vault id, version, KDF cost, salt
// or nonce fails authentication instead of decrypting to something. The key comes from outside
// (kdf.ts for a backup file; in S2 the relay's vault key), so this module knows nothing about
// passphrases.

import {
  encodeBase64Url,
  envelopeAadText,
  ENVELOPE_ALG,
  ENVELOPE_LIMITS,
  ENVELOPE_VERSION,
  type EnvelopeKdf,
  type ParsedVaultEnvelope,
  type VaultEnvelope,
  type VaultEnvelopeHeader,
} from '@anc/core';

const aadBytes = (header: VaultEnvelopeHeader): Uint8Array =>
  new TextEncoder().encode(envelopeAadText(header));

export interface SealInput {
  readonly key: CryptoKey;
  /** 16 bytes. */
  readonly vaultId: Uint8Array;
  readonly version: number;
  readonly kdf: EnvelopeKdf;
  /** 16 bytes. */
  readonly salt: Uint8Array;
  /** 12 bytes, never reused with the same key. */
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
}

export async function sealEnvelope(input: SealInput): Promise<VaultEnvelope> {
  const header: VaultEnvelopeHeader = {
    v: ENVELOPE_VERSION,
    vaultId: encodeBase64Url(input.vaultId),
    version: input.version,
    alg: ENVELOPE_ALG,
    kdf: input.kdf,
    salt: encodeBase64Url(input.salt),
    nonce: encodeBase64Url(input.nonce),
  };
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: input.nonce as BufferSource,
      additionalData: aadBytes(header) as BufferSource,
      tagLength: ENVELOPE_LIMITS.tagBytes * 8,
    },
    input.key,
    input.plaintext as BufferSource,
  );
  return { ...header, ct: encodeBase64Url(new Uint8Array(ciphertext)) };
}

export type OpenEnvelopeResult =
  | { readonly kind: 'decrypted'; readonly plaintext: Uint8Array }
  /**
   * The tag did not verify. A wrong key and a changed byte (of the ciphertext or of any header
   * field) look exactly the same to GCM, and this module does not pretend to tell them apart.
   */
  | { readonly kind: 'authenticationFailed' };

export async function openEnvelope(
  key: CryptoKey,
  parsed: ParsedVaultEnvelope,
): Promise<OpenEnvelopeResult> {
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: parsed.nonce as BufferSource,
        additionalData: aadBytes(parsed.envelope) as BufferSource,
        tagLength: ENVELOPE_LIMITS.tagBytes * 8,
      },
      key,
      parsed.ciphertext as BufferSource,
    );
    return { kind: 'decrypted', plaintext: new Uint8Array(plaintext) };
  } catch {
    return { kind: 'authenticationFailed' };
  }
}
