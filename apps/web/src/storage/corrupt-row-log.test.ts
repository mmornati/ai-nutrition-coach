// Port of the earlier client.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { corruptRowsSkipped, reportCorruptRow, resetCorruptRowCounter } from './corrupt-row-log';

beforeEach(() => resetCorruptRowCounter());

describe('the production corrupt-row sink', () => {
  it('counts every skipped row', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    expect(corruptRowsSkipped()).toBe(0);
    reportCorruptRow(7, 'entry: invalid quantity');
    reportCorruptRow(8, 'plate: unparseable timestamp');
    expect(corruptRowsSkipped()).toBe(2);
    resetCorruptRowCounter();
    expect(corruptRowsSkipped()).toBe(0);
  });

  it('only ever prints an id and a fixed reason, never a stored value', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    reportCorruptRow(7, 'entry: invalid quantity');
    for (const call of debug.mock.calls) {
      expect(call).toHaveLength(1);
      expect(String(call[0])).toBe(
        'ai-nutrition-coach: skipped unreadable row #7 (entry: invalid quantity)',
      );
    }
    debug.mockRestore();
  });
});
