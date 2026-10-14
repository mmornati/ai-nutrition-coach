import { describe, expect, it } from 'vitest';
import {
  normalizePassphrase,
  passphraseBytes,
  unlockDelayMs,
  validateNewPassphrase,
} from './passphrase';

describe('the strength floor for a new passphrase', () => {
  it('needs at least 10 characters and 4 distinct ones', () => {
    expect(validateNewPassphrase('123456789')).toBe('tooShort');
    expect(validateNewPassphrase('abababababab')).toBe('tooRepetitive');
    expect(validateNewPassphrase('aaaaaaaaaaaaaaaa')).toBe('tooRepetitive');
    expect(validateNewPassphrase('abcdefghij')).toBeNull();
    expect(validateNewPassphrase('abcdabcdab')).toBeNull();
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validateNewPassphrase('🍎🍐🍊🍋🍌🍉🍇🍓🫐🍒')).toBeNull();
    expect(validateNewPassphrase('🍎🍐🍊🍋🍌🍉🍇🍓🫐')).toBe('tooShort');
  });
});

describe('passphrase input is NFC then UTF-8', () => {
  it('composed and decomposed forms are the same bytes', () => {
    const composed = passphraseBytes('café au lait 123');
    const decomposed = passphraseBytes('café au lait 123');
    expect([...decomposed]).toEqual([...composed]);
    expect(normalizePassphrase('é')).toBe('é');
  });

  it('is UTF-8', () => {
    expect([...passphraseBytes('é')]).toEqual([0xc3, 0xa9]);
  });
});

describe('unlock throttling (UX friction only)', () => {
  it('delay schedule: none for two failures, then 1 s, 2 s, 4 s ... capped at 30 s', () => {
    expect(unlockDelayMs(0)).toBe(0);
    expect(unlockDelayMs(1)).toBe(0);
    expect(unlockDelayMs(2)).toBe(0);
    expect(unlockDelayMs(3)).toBe(1000);
    expect(unlockDelayMs(4)).toBe(2000);
    expect(unlockDelayMs(5)).toBe(4000);
    expect(unlockDelayMs(6)).toBe(8000);
    expect(unlockDelayMs(7)).toBe(16_000);
    expect(unlockDelayMs(8)).toBe(30_000);
    expect(unlockDelayMs(50)).toBe(30_000);
  });
});
