// The "The week, in short" section of the Week screen: days with meals logged (a count, never a
// run), the daily average bars, what went well, one thing to try. Rule-based, no score.
import type { ReactNode } from 'react';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  at,
  renderInSession,
  seedMeasuredPlate,
  seedPlate,
  unlockedBundle,
} from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { WeekReview } from './WeekReview';
import { WeekScreen } from './WeekScreen';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

async function seedWeek(options: { readonly numbersOff?: boolean } = {}) {
  const bundle = await unlockedBundle();
  if (options.numbersOff) await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
  for (const offset of [-1, -2, -3]) {
    await seedMeasuredPlate(bundle, at(12, 0, offset), [
      {
        name: 'Salad',
        group: 'vegFruit',
        grams: 200,
        per100g: { energyKcal: 20, protein: 1, fibre: 3, salt: 0.2 },
      },
      {
        name: 'Beans',
        group: 'protein',
        grams: 100,
        per100g: { energyKcal: 90, protein: 8, fibre: 6, salt: 0.1 },
      },
    ]);
  }
  return bundle;
}

async function renderWeek(
  bundle: Awaited<ReturnType<typeof unlockedBundle>>,
  ui: ReactNode = <WeekScreen />,
) {
  const view = await renderInSession(ui, { bundle });
  await screen.findByRole('heading', { level: 2, name: 'The week, in short' }, { timeout: 5000 });
  return view;
}

describe('WeekReview', () => {
  it('counts days with meals logged, shows the average bars, two positives and one suggestion', async () => {
    await renderWeek(await seedWeek());
    const section = screen
      .getByRole('heading', { level: 2, name: 'The week, in short' })
      .closest('section') as HTMLElement;
    expect(within(section).getByText('3 days with meals logged')).toBeVisible();
    expect(within(section).getByText('Daily average')).toBeVisible();
    expect(within(section).getByRole('list', { name: /Nutrient amounts/ })).toBeVisible();
    expect(within(section).getByText('Veg or fruit came up on 3 of 3 logged days.')).toBeVisible();
    expect(
      within(section).getByText('Salt averaged 0.5 g a day, on the lighter side.'),
    ).toBeVisible();
    expect(within(section).getByText('One thing to try')).toBeVisible();
    expect(within(section).getByText(/^Protein averaged 10 g a day\./)).toBeVisible();
    expect(section.textContent).not.toMatch(/in a row|streak|score|goal|remaining/i);
  });

  it('hides the bars and every line quoting grams while numbers are off, keeping the day count', async () => {
    await renderWeek(await seedWeek({ numbersOff: true }));
    const section = screen
      .getByRole('heading', { level: 2, name: 'The week, in short' })
      .closest('section') as HTMLElement;
    expect(within(section).getByText('3 days with meals logged')).toBeVisible();
    expect(within(section).queryByText('Daily average')).toBeNull();
    expect(within(section).queryByRole('list', { name: /Nutrient amounts/ })).toBeNull();
    expect(within(section).getByText('Veg or fruit came up on 3 of 3 logged days.')).toBeVisible();
    expect(section.textContent).not.toMatch(/\d+ g\b/);
  });

  it('says nothing about nutrients for a week without weights, and is absent for an empty week', async () => {
    const bundle = await unlockedBundle();
    for (const offset of [-1, -2, -3]) {
      await seedPlate(bundle, at(12, 0, offset), [['Chocolate bar', 'other']]);
    }
    await renderWeek(bundle);
    expect(screen.queryByText('Daily average')).toBeNull();
    cleanup();

    const empty = await unlockedBundle();
    await renderInSession(<WeekScreen />, { bundle: empty });
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    expect(screen.queryByRole('heading', { name: 'The week, in short' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = await renderWeek(await seedWeek(), <WeekReview />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
