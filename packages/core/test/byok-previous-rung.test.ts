import { describe, expect, it } from 'vitest';
import { aiRungConfigEquals, type AiRungConfig, type ByokPreviousRung } from '../src/index';

describe('ByokPreviousRung (FR7)', () => {
  it('structural equality by previousKind only', () => {
    const a: ByokPreviousRung = { previousKind: 'hostedQuota' };
    const b: ByokPreviousRung = { previousKind: 'hostedQuota' };
    const c: ByokPreviousRung = { previousKind: 'noOp' };
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('serialises the keyToken, never the label', () => {
    const json = JSON.stringify({ previousKind: 'hostedQuota' } satisfies ByokPreviousRung);
    expect(json).toContain('hostedQuota');
    expect(json).not.toContain('free model');
  });
});

describe('AiRungConfig with previousRung (FR7)', () => {
  it('default has no previousRung', () => {
    const config: AiRungConfig = { kind: 'noOp' };
    expect(config.previousRung).toBeUndefined();
  });

  it('byok config carries previousRung', () => {
    const config: AiRungConfig = { kind: 'byok', previousRung: { previousKind: 'hostedQuota' } };
    expect(config.previousRung).toBeDefined();
    expect(config.previousRung?.previousKind).toBe('hostedQuota');
  });

  it('equality includes previousRung', () => {
    const mk = (previousKind: ByokPreviousRung['previousKind']): AiRungConfig => ({
      kind: 'byok',
      previousRung: { previousKind },
    });
    expect(aiRungConfigEquals(mk('hostedQuota'), mk('hostedQuota'))).toBe(true);
    expect(aiRungConfigEquals(mk('hostedQuota'), mk('noOp'))).toBe(false);
    expect(aiRungConfigEquals({ kind: 'byok' }, mk('noOp'))).toBe(false);
  });
});
