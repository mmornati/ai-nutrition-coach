import { describe, expect, it } from 'vitest';
import { describeManagedOversightSeam, MANAGED_OVERSIGHT_SEAM } from '../src/index';

describe('ManagedOversightSeam', () => {
  it('marker is a constant', () => {
    expect(MANAGED_OVERSIGHT_SEAM.kind).toBe('managedOversightSeam');
  });

  it('is a marker only: no fields beyond the discriminant, and frozen', () => {
    expect(Object.keys(MANAGED_OVERSIGHT_SEAM)).toEqual(['kind']);
    expect(Object.isFrozen(MANAGED_OVERSIGHT_SEAM)).toBe(true);
  });

  it('description is redacted: never reveals implementation', () => {
    const s = describeManagedOversightSeam(MANAGED_OVERSIGHT_SEAM);
    expect(s).toContain('v2 only');
    expect(s).not.toContain('Service');
    expect(s).not.toContain('Account');
  });
});
