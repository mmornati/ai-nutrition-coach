// Passphrase rules: NFC + UTF-8 input, the strength floor for a NEW passphrase, and the unlock
// delay. The delay is UX friction only: it lives in this tab's memory, a reload resets it, and an
// offline attacker with a copy of the origin storage bypasses it completely. The real defence is
// the KDF cost and passphrase strength (ADR-0002). It is not a security control and must never be
// described as one.

import { PASSPHRASE_MIN_DISTINCT, PASSPHRASE_MIN_LENGTH } from './constants';

export type PassphraseIssue = 'tooShort' | 'tooRepetitive';

/**
 * The strength floor for a new passphrase: at least 10 characters and at least 4 distinct
 * characters. Counted in Unicode code points, not UTF-16 units. `null` means acceptable.
 */
export function validateNewPassphrase(passphrase: string): PassphraseIssue | null {
  const characters = [...passphrase];
  if (characters.length < PASSPHRASE_MIN_LENGTH) return 'tooShort';
  if (new Set(characters).size < PASSPHRASE_MIN_DISTINCT) return 'tooRepetitive';
  return null;
}

/** NFC first (the same visible passphrase must derive the same key whatever the keyboard composes). */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize('NFC');
}

/** NFC, then UTF-8. The caller owns the buffer and wipes it. */
export function passphraseBytes(passphrase: string): Uint8Array {
  return new TextEncoder().encode(normalizePassphrase(passphrase));
}

/**
 * Delay imposed after `failures` consecutive wrong passphrases: none for the first two, then
 * 1 s, 2 s, 4 s ... capped at 30 s. UX friction only.
 */
export function unlockDelayMs(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(30, 1 << Math.min(failures - 3, 5)) * 1000;
}
