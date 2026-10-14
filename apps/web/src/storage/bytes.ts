// Small byte helpers shared by the header, the key attach and the tests.

export function hexEncode(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function wipe(bytes: Uint8Array | null | undefined): void {
  bytes?.fill(0);
}

/** base64url without padding (RFC 4648 section 5). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strict base64url (padding optional). Returns null for anything that is not valid. */
export function base64UrlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) return null;
  const body = text.replace(/=+$/, '');
  if (body.length % 4 === 1) return null;
  const standard = body.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
