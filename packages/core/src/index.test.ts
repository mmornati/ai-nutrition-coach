import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('@anc/core', () => {
  it('loads', () => {
    expect(core).toBeDefined();
  });
});
