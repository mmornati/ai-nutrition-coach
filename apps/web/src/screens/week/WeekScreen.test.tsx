// Port of the earlier client's behaviour: seven days, tapping a day selects it, no streaks and
// no week report score.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  at,
  renderInSession,
  renderUnlockedApp,
  seedPlate,
  unlockedBundle,
} from '../../app/testing';
import { WeekScreen } from './WeekScreen';

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
  // The heading renders before the week's plates have been read from the store; every assertion
  // below depends on them, so wait for the seeded day to show up (a slow, loaded run needs this).
  await screen.findByRole('button', { name: /Tuesday: all four groups/ }, { timeout: 5000 });
  return { bundle, ...view };
}

describe('WeekScreen', () => {
  it('shows seven towels, in words as well as colour, with the date span', async () => {
    await openWeek();
    expect(screen.getByText('8 – 14 October')).toBeVisible();
    const network = screen.getByRole('img');
    await waitFor(() => {
      expect(network.getAttribute('aria-label')).toMatch(/The week\./);
      expect(network.getAttribute('aria-label')).toMatch(/Tuesday: all four groups\./);
    });
    const list = screen.getByRole('button', { name: /Today/ }).closest('ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
  });

  it('tapping a day selects it and shows it on Today', async () => {
    const user = userEvent.setup();
    await openWeek();
    await user.click(screen.getByRole('button', { name: /Tuesday: all four groups/ }));
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
    expect(text).not.toMatch(/\bstreak(?!s)\b|\bscore\b|\bbadge\b|\bgoal\b|in a row/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(12, 0, -1), [
      ['Eggs', 'protein'],
      ['Spinach', 'vegFruit'],
    ]);
    const { container } = await renderInSession(<WeekScreen />, { bundle });
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('moves to earlier weeks and back; today stays one tap away', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    // Monday 5 October: nine days before "today" (Wednesday 14 October), in the week before.
    await seedPlate(bundle, at(12, 0, -9), [
      ['Eggs', 'protein'],
      ['Spinach', 'vegFruit'],
      ['Toast', 'starch'],
      ['Milk', 'dairy'],
    ]);
    window.location.hash = '#/week';
    await renderUnlockedApp(bundle);
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    expect(screen.getByRole('button', { name: 'Later week' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Earlier week' })).toBeVisible();
    expect(await screen.findByText('1 – 7 October')).toBeVisible();
    // The dock's route follows the week in view, says which week that is, and no day of it is "today".
    expect(
      screen.queryByRole('navigation', { name: 'This week: choose a day' }),
    ).not.toBeInTheDocument();
    const route = screen.getByRole('navigation', {
      name: 'Week from 1 October to 7 October: choose a day',
    });
    expect(within(route).getAllByRole('button')).toHaveLength(7);
    expect(within(route).queryByRole('button', { name: /, today$/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Monday: all four groups/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Monday' })).toBeVisible();
    expect(await screen.findByText('Eggs, Spinach, Toast, Milk')).toBeVisible();

    // One tap back to today, from Today.
    await user.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to today' })).not.toBeInTheDocument();
  });

  it('"Later week" and "Back to this week" return to the week ending today', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    window.location.hash = '#/week';
    await renderUnlockedApp(bundle);
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    expect(await screen.findByText('24 – 30 September')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Later week' }));
    expect(await screen.findByText('1 – 7 October')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to this week' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This week' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Later week' })).toBeDisabled();
  });
});

describe('WeekScreen: an earlier week says so', () => {
  async function earlierWeek() {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(12, 0, -9), [
      ['Eggs', 'protein'],
      ['Spinach', 'vegFruit'],
      ['Toast', 'starch'],
      ['Milk', 'dairy'],
    ]);
    window.location.hash = '#/week';
    await renderUnlockedApp(bundle);
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    await screen.findByRole('heading', { level: 1, name: 'Earlier week' });
    return { user, bundle };
  }

  it('names its dates in the week note, never "this week"', async () => {
    await earlierWeek();
    expect(
      await screen.findByText(
        'All four food groups showed up in the week from 1 October to 7 October.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/showed up this week/)).not.toBeInTheDocument();
  });

  it('an earlier week with nothing logged says it for those dates', async () => {
    const { user } = await earlierWeek();
    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    expect(
      await screen.findByText('No plates logged in the week from 24 September to 30 September.'),
    ).toBeVisible();
  });

  it('moves focus to the heading when "Later week" or "Back to this week" brings this week back', async () => {
    const { user } = await earlierWeek();
    await user.click(screen.getByRole('button', { name: 'Later week' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'This week' });
    await waitFor(() => expect(heading).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Earlier week' }));
    await screen.findByRole('heading', { level: 1, name: 'Earlier week' });
    await user.click(screen.getByRole('button', { name: 'Back to this week' }));
    const again = await screen.findByRole('heading', { level: 1, name: 'This week' });
    await waitFor(() => expect(again).toHaveFocus());
  });
});
