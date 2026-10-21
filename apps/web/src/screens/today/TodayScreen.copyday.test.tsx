// "Copy this day to today" on the Today screen, looking at a past day.
import { useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { addCalendarDays } from '@anc/core';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { useDay } from '../../app/day-context';
import { TodayScreen } from './TodayScreen';

beforeEach(() => {
  // Wednesday 2026-10-14, 09:00.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 9, 0) });
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
