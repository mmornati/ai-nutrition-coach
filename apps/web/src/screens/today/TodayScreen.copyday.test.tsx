// "Copy this day to today" on the Today screen, looking at a past day.
import { useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { addCalendarDays, storeFailure } from '@anc/core';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { useDay } from '../../app/day-context';
import { TodayScreen } from './TodayScreen';

beforeEach(() => {
  // Wednesday 2026-10-14, 20:00: every plate of yesterday has its time today already.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

/** Show the day `offset` days back, as the dock's week route does. */
function ViewDay({ offset }: { readonly offset: number }) {
  const day = useDay();
  const { select, today } = day;
  useEffect(() => select(addCalendarDays(today, -offset)), [select, today, offset]);
  return null;
}

async function setup(offset = 1) {
  const bundle = await unlockedBundle();
  // Yesterday: a breakfast, a lunch of two foods and a dinner. A plate today already.
  await seedMeasuredPlate(bundle, at(19, 10, -1), [
    { name: 'Soup', group: 'vegFruit', grams: 300 },
  ]);
  await seedMeasuredPlate(bundle, at(7, 40, -1), [{ name: 'Oatmeal', group: 'starch', grams: 60 }]);
  await seedMeasuredPlate(bundle, at(12, 30, -1), [
    { name: 'Chicken', group: 'protein', grams: 150, per100g: { energyKcal: 165, protein: 31 } },
    { name: 'Rice', group: 'starch', grams: 180 },
  ]);
  await seedMeasuredPlate(bundle, at(8, 0), [{ name: 'Coffee', group: 'other', grams: 200 }]);
  const view = await renderInSession(
    <>
      <ViewDay offset={offset} />
      <TodayScreen />
    </>,
    { bundle },
  );
  return { bundle, ...view };
}

const plates = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) => {
  const read = await bundle.store.readRange();
  if (read.kind !== 'platesRead') throw new Error('read failed');
  return read.plates;
};

describe('Copy this day to today', () => {
  it('is offered for a past day that has plates, not for today and not for an empty day', async () => {
    const { unmount } = await setup(0);
    expect(await screen.findByText('Coffee')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Copy this day to today' }),
    ).not.toBeInTheDocument();
    unmount();

    const empty = await setup(3);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sunday' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Copy this day to today' }),
    ).not.toBeInTheDocument();
    empty.unmount();

    await setup(1);
    expect(await screen.findByRole('button', { name: 'Copy this day to today' })).toBeVisible();
  });

  it('lists exactly what will be copied, with its times, and waits for a yes', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Copy this day to today' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Copy this day to today' });
    const lines = within(within(dialog).getByRole('list', { name: 'Plates to copy' })).getAllByRole(
      'listitem',
    );
    expect(lines.map((l) => l.textContent)).toEqual([
      'Breakfast, 07:40: Oatmeal',
      'Lunch, 12:30: Chicken, Rice',
      'Dinner, 19:10: Soup',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Not now' })).toHaveFocus();
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(await plates(bundle)).toHaveLength(4); // nothing was copied
  });

  it('copies every plate to today at the same clock times, with one coach note for the batch', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Copy this day to today' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Copy this day to today' });
    await user.click(within(dialog).getByRole('button', { name: 'Copy to today' }));

    expect(await screen.findByText('Copied 3 plates to today.')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    const all = await plates(bundle);
    expect(all).toHaveLength(7);
    const copies = all
      .filter((p) => p.loggedAtUtc >= at(0, 0))
      .filter((p) => p.entries[0]?.databaseFood.displayName !== 'Coffee')
      .sort((a, b) => a.loggedAtUtc - b.loggedAtUtc);
    expect(copies.map((p) => p.loggedAtUtc)).toEqual([at(7, 40), at(12, 30), at(19, 10)]);
    expect(copies[1]?.entries.map((e) => [e.databaseFood.displayName, e.quantity.grams])).toEqual([
      ['Chicken', 150],
      ['Rice', 180],
    ]);
    expect(copies[1]?.entries[0]?.databaseFood.nutrientsPer100g).toEqual({
      energyKcal: 165,
      protein: 31,
    });
    // One calm note for the batch: only the last plate is coached.
    const counts = await Promise.all(
      copies.map(async (p) => (await bundle.notes.forPlate(p.id)).length),
    );
    expect(counts).toEqual([0, 0, 1]);
    // The plate that was already there stays as it is.
    await waitFor(() => expect(screen.getByText('Coffee')).toBeVisible());
  });
});

describe('Copy this day: never a plate in the future', () => {
  it('lists the plates whose time has not come under "Later than now" and copies only the rest', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 13, 0));
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Copy this day to today' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Copy this day to today' });
    const copied = within(
      within(dialog).getByRole('list', { name: 'Plates to copy' }),
    ).getAllByRole('listitem');
    expect(copied.map((l) => l.textContent)).toEqual([
      'Breakfast, 07:40: Oatmeal',
      'Lunch, 12:30: Chicken, Rice',
    ]);
    const later = within(
      within(dialog).getByRole('list', { name: 'Later than now, not copied' }),
    ).getAllByRole('listitem');
    expect(later.map((l) => l.textContent)).toEqual(['Dinner, 19:10: Soup']);
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(within(dialog).getByRole('button', { name: 'Copy to today' }));

    expect(await screen.findByText('Copied 2 plates to today.')).toBeVisible();
    const all = await plates(bundle);
    // yesterday's 3 + today's coffee + 2 copies; nothing after 13:00 today.
    expect(all).toHaveLength(6);
    expect(all.filter((p) => p.loggedAtUtc > at(13, 0))).toEqual([]);
  });

  it('offers no copy at all when every plate of the day is still ahead of the clock', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 6, 0));
    await setup();
    await screen.findByText('Oatmeal');
    expect(
      screen.queryByRole('button', { name: 'Copy this day to today' }),
    ).not.toBeInTheDocument();
  });
});

describe('Copy this day: a partial failure retries only what did not land', () => {
  it('keeps the day on screen, says how many landed, and the second copy adds only the missing plate', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    const original = bundle.store.recordPlate.bind(bundle.store);
    let calls = 0;
    const spy = vi.spyOn(bundle.store, 'recordPlate').mockImplementation((input) => {
      calls++;
      return calls === 2 ? Promise.resolve(storeFailure('storeOperation')) : original(input);
    });

    await user.click(await screen.findByRole('button', { name: 'Copy this day to today' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Copy to today' }),
    );
    expect(
      await screen.findByText('Copied 2 of 3 plates. The rest did not save; you can try again.'),
    ).toBeVisible();
    // Still on the past day, with the way to try again.
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).not.toBeInTheDocument();
    expect(await plates(bundle)).toHaveLength(6);

    spy.mockRestore();
    await user.click(await screen.findByRole('button', { name: 'Copy this day to today' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Copy this day to today' });
    // Only the plate that failed (the second: lunch) is offered again.
    expect(
      within(within(dialog).getByRole('list', { name: 'Plates to copy' }))
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['Lunch, 12:30: Chicken, Rice']);
    await user.click(within(dialog).getByRole('button', { name: 'Copy to today' }));
    expect(await screen.findByText('Copied 1 plate to today.')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    // 3 of yesterday + coffee + 3 copies, no duplicate.
    expect(await plates(bundle)).toHaveLength(7);
  });
});
