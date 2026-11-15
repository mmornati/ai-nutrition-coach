import { describe, expect, it } from 'vitest';
import { checkServerPassphrase as check } from './passphrase-strength';

describe('the server passphrase check', () => {
  it('asks for 12 characters, 16 with spaces, or 4 real words', () => {
    expect(check('Tr1cky#pw')).toBe('tooShort');
    expect(check('blue fox runs far')).toBeNull();
    expect(check('pale harbour mist 7')).toBeNull();
    expect(check('xk3!vq9#Lm2z')).toBeNull();
  });

  it('does not let short words, or a short spaced phrase with a common word, count as a phrase', () => {
    for (const p of [
      'hi yo ok no',
      'iloveyou mom',
      'password abc1',
      'monkey 12345 x',
      'ab cd ef gh ij',
    ]) {
      expect(check(p), p).toBe('tooShort');
    }
    // Four real words, or sixteen characters, are enough; twelve in one piece still are.
    expect(check('red cow sky bay')).toBeNull();
    expect(check('lemon orchard dawn')).toBeNull();
    expect(check('xk3!vq9#Lm2z')).toBeNull();
    // A common entry in a phrase long enough to pass the floor is still refused.
    expect(check('iloveyou iloveyou')).not.toBeNull();
  });

  it('refuses common passwords, with digits or swaps added, and glued ones', () => {
    for (const p of [
      'password1234',
      'p@ssw0rd2024!',
      'iloveyou123456',
      'passwordpassword',
      'monkeydragon99',
    ]) {
      expect(check(p), p).toBe('common');
    }
  });

  it('refuses keyboard walks, counting runs and repetition', () => {
    expect(check('qwertyuiop12')).toBe('common');
    expect(check('1234567890123')).not.toBeNull();
    expect(check('poiuytrewq-4x')).toBe('pattern');
    expect(check('k9mzk9mzk9mz')).toBe('repeated');
    expect(check('abababababab')).toBe('tooRepetitive');
    expect(check('Password123456')).not.toBeNull();
  });

  it('refuses the handle and the name of the app inside it', () => {
    expect(check('anna-garden-2026', { handle: 'anna' })).toBe('containsHandle');
    expect(check('my nutrition coach key')).toBe('containsApp');
    expect(check('anna-garden-2026', { handle: 'bobby' })).toBeNull();
  });

  it('lets a diceware-style phrase of ordinary words through', () => {
    expect(check('correct horse battery staple')).toBeNull();
    expect(check('lamp ocean velvet tractor')).toBeNull();
  });
});
