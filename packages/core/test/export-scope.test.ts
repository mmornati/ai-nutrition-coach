import { describe, expect, it } from 'vitest';
import {
  ALL_HISTORY_SCOPE,
  exportScopeRange,
  localTime,
  visibleDayScope,
  weekScope,
} from '../src/index';

describe('ExportScope', () => {
  it('visibleDay carries a day and is a value', () => {
    expect(visibleDayScope(localTime(2026, 8, 16))).toEqual({
      kind: 'visibleDay',
      day: localTime(2026, 8, 16),
    });
  });

  it('week carries a start and is a value', () => {
    expect(weekScope(localTime(2026, 8, 11))).toEqual({
      kind: 'week',
      start: localTime(2026, 8, 11),
    });
  });

  it('allHistory is a constant value', () => {
    expect(ALL_HISTORY_SCOPE).toEqual({ kind: 'allHistory' });
  });

  it('three scopes are distinct kinds', () => {
    const kinds = [
      visibleDayScope(localTime(2026, 8, 16)),
      weekScope(localTime(2026, 8, 11)),
      ALL_HISTORY_SCOPE,
    ].map((s) => s.kind);
    expect(new Set(kinds).size).toBe(3);
  });

  it('week resolves to a half-open 7-calendar-day range from the start of the local day', () => {
    const r = exportScopeRange(weekScope(localTime(2026, 8, 11, 15)));
    expect(r.from).toBe(localTime(2026, 8, 11));
    expect(r.to).toBe(localTime(2026, 8, 18));
  });
});
