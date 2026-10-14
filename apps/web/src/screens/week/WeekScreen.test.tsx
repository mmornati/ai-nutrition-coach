// Port of week_strip_test.dart's behaviour: seven days, tapping a day selects it, no streaks and
// no week report score.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { at, renderUnlockedApp, seedPlate, unlockedBundle } from '../../app/testing';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

async function openWeek() {
  const bundle = await unlockedBundle();
  await seedPlate(bundle, at(12, 0, -1), [
    ['Eggs', 'protein'],
    ['Spinach', 'vegFruit'],
    ['Toast', 'starch'],
    ['Milk', 'dairy'],
  ]);
  await seedPlate(bundle, at(12, 0, -3), [['Chocolate bar', 'other']]);
  window.location.hash = '#/week';
  const view = await renderUnlockedApp(bundle);
  await screen.findByRole('heading', { level: 1, name: 'This week' });
  return { bundle, ...view };
}

describe('WeekScreen', () => {
  it('shows seven days, in words as well as colour, with the date span', async () => {
    await openWeek();
    expect(screen.getByText('8 – 14 October')).toBeVisible();
    const network = screen.getByRole('img');
    expect(network.getAttribute('aria-label')).toMatch(/Week network\./);
    expect(network.getAttribute('aria-label')).toMatch(/Tuesday: all four lines\./);
    const list = screen.getByRole('button', { name: /Today/ }).closest('ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
  });

  it('tapping a day selects it and shows it on Today', async () => {
    const user = userEvent.setup();
    await openWeek();
    await user.click(screen.getByRole('button', { name: /Tuesday: all four lines/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
    expect(await screen.findByText('Eggs, Spinach, Toast, Milk')).toBeVisible();
    await waitFor(() => expect(['', '#/']).toContain(window.location.hash));
  });

  it('the dock route also selects a day and keeps the week in view', async () => {
    const user = userEvent.setup();
    await openWeek();
    const route = screen.getByRole('navigation', { name: 'This week: choose a day' });
    const stops = within(route).getAllByRole('button');
    expect(stops).toHaveLength(7);
    await user.click(stops[5] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
  });

  it('has no streaks, no score, no countdown, no guilt', async () => {
    await openWeek();
    const text = document.body.textContent ?? '';
    expect(text).toContain('No streaks, no countdowns, no guilt.');
    expect(text).not.toMatch(/\bstreak(?!s)\b|\bscore\b|\bbadge\b|\bgoal\b|\d+ ?day/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = await openWeek();
    expect(await axe(container)).toHaveNoViolations();
  });
});
