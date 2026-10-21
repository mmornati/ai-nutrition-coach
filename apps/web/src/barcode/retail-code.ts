/**
 * Typed barcodes: the digits a person reads off the pack when the camera does not get them.
 * Accepts the four retail formats the scanner reads (EAN-13, EAN-8, UPC-A, UPC-E) and checks
 * length and check digit, so a typo is caught here and never becomes a lookup.
 */

/** GS1 check: weights 3,1,3,... from the digit left of the check digit. Works for 8/12/13 digits. */
export function gtinCheckDigitOk(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  let sum = 0;
  for (let i = code.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(code[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

/** The UPC-A (12 digits) a UPC-E (8 digits, number system 0 or 1) stands for. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0] as string;
  const d = code.slice(1, 7);
  const check = code[7] as string;
  const last = d[5] as string;
  let body: string;
  if ('012'.includes(last)) body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  return `${ns}${body}${check}`;
}

export type RetailCodeResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: 'empty' | 'length' | 'checksum' };

/** Strip spaces and dashes, then validate. `code` is the digits as typed (UPC-E stays 8 digits). */
export function parseRetailCode(input: string): RetailCodeResult {
  const code = input.replace(/[\s-]/g, '');
  if (code === '') return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) {
    return { ok: false, reason: 'length' };
  }
  if (gtinCheckDigitOk(code)) return { ok: true, code };
  if (code.length === 8) {
    const upcA = expandUpcE(code);
    if (upcA !== null && gtinCheckDigitOk(upcA)) return { ok: true, code };
  }
  return { ok: false, reason: 'checksum' };
}
