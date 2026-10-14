import { describe, expect, it } from 'vitest';
import {
  AI_RUNG_KINDS,
  aiRungConfigEquals,
  aiRungKeyToken,
  aiRungLabel,
  type AiRungConfig,
} from '../src/index';

describe('AiRungKind (AD-5)', () => {
  it('ships exactly four kinds: noOp | hostedQuota | byok | local', () => {
    expect(AI_RUNG_KINDS).toEqual(['noOp', 'hostedQuota', 'byok', 'local']);
  });

  it('the v2 `local` seam is a first-class value (FR8)', () => {
    expect(aiRungLabel('local')).not.toBe('');
    expect(aiRungKeyToken('local')).toBe('local');
  });

  it('every label is non-empty and distinct', () => {
    const labels = AI_RUNG_KINDS.map(aiRungLabel);
    for (const label of labels) expect(label).not.toBe('');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('every keyToken is non-empty and distinct', () => {
    const tokens = AI_RUNG_KINDS.map(aiRungKeyToken);
    for (const token of tokens) expect(token).not.toBe('');
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('labels are human-readable, tokens are machine-readable', () => {
    for (const kind of AI_RUNG_KINDS) expect(aiRungLabel(kind)).not.toBe(aiRungKeyToken(kind));
  });
});

describe('AiRungConfig (AD-5)', () => {
  it('equality is by `kind` when there is no previous rung', () => {
    const a: AiRungConfig = { kind: 'noOp' };
    const b: AiRungConfig = { kind: 'noOp' };
    const c: AiRungConfig = { kind: 'hostedQuota' };
    expect(aiRungConfigEquals(a, b)).toBe(true);
    expect(aiRungConfigEquals(a, c)).toBe(false);
  });

  it('serialises the keyToken, never the label', () => {
    const json = JSON.stringify({ kind: 'hostedQuota' } satisfies AiRungConfig);
    expect(json).toContain('hostedQuota');
    expect(json).not.toContain('free model');
  });

  it('default v1 config is `noOp` (Story 1.8 carry-over)', () => {
    const defaultConfig: AiRungConfig = { kind: 'noOp' };
    expect(defaultConfig.kind).toBe('noOp');
  });
});
