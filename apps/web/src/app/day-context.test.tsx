// Where a new plate lands: today, unless the person picked a day in the strip. Browsing an earlier
// week moves what is shown, never where a plate goes.
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalendarDays, isSameLocalDay } from '@anc/core';
import { renderInSession, unlockedBundle } from './testing';
import { useDay, type DayState } from './day-context';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DayProvider.logDay', () => {
  it('is today while an earlier week is browsed, and the picked day once one is picked', async () => {
    let day: DayState | undefined;
    function Probe() {
      day = useDay();
      return <p>probe</p>;
    }
    await renderInSession(<Probe />, { bundle: await unlockedBundle() });
    await screen.findByText('probe');
    const state = (): DayState => day as DayState;
    expect(isSameLocalDay(state().logDay, state().today)).toBe(true);

    act(() => state().shiftWeek(-1));
    expect(state().viewingEarlierWeek).toBe(true);
    // What is shown moved to the earlier week; where a plate lands did not.
    expect(isSameLocalDay(state().selected, state().today)).toBe(false);
    expect(isSameLocalDay(state().logDay, state().today)).toBe(true);

    const picked = addCalendarDays(state().today, -9);
    act(() => state().select(picked));
    expect(isSameLocalDay(state().logDay, picked)).toBe(true);

    // Going to another week drops the pick: back to today.
    act(() => state().shiftWeek(-1));
    expect(isSameLocalDay(state().logDay, state().today)).toBe(true);

    act(() => state().showDay(picked));
    expect(isSameLocalDay(state().logDay, addCalendarDays(state().today, -9))).toBe(true);
    act(() => state().goToToday());
    expect(isSameLocalDay(state().logDay, state().today)).toBe(true);
  });
});
