import { describe, expect, it } from 'vitest';
import * as core from '../src/index';

describe('@anc/core', () => {
  it('loads', () => {
    expect(core).toBeDefined();
  });
});
