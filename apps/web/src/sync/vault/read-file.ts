// Reads a file the person picked, refusing one over the cap BEFORE its bytes are loaded: the size
// the browser reports is checked first, so a multi-gigabyte pick costs nothing.

import { ENVELOPE_LIMITS } from '@anc/core';

export type ReadBackupFileResult =
  | { readonly kind: 'read'; readonly bytes: Uint8Array }
  | { readonly kind: 'tooLarge' }
  | { readonly kind: 'unreadable' };

export async function readBackupFile(file: Blob): Promise<ReadBackupFileResult> {
  if (file.size > ENVELOPE_LIMITS.maxFileBytes) return { kind: 'tooLarge' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A file that grew between the size check and the read is still bounded.
    return bytes.length > ENVELOPE_LIMITS.maxFileBytes
      ? { kind: 'tooLarge' }
      : { kind: 'read', bytes };
  } catch {
    return { kind: 'unreadable' };
  }
}
