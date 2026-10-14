// Port of the earlier client (and its F3 / a11y siblings) and the earlier client.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { plateDeleteFailed, storeFailure } from '@anc/core';
import type { StoreBundle } from '../../storage';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { strings } from '../../i18n';
import { TodayScreen } from './TodayScreen';

const s = strings();
const QUIET = s.day.openQuietPlace;

// 2026-10-14 12:10 local: lunch time, so "now" is deterministic. Only Date is faked: the store,
// React and userEvent keep their real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

const stationNames = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.firstChild?.textContent ?? '')
    .filter((t) => ['Breakfast', 'Lunch', 'Dinner', 'Late'].includes(t));

describe('TodayScreen: the day as a map', () => {
  it('an empty day is three open stations, a header and no pressure', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<TodayScreen />, { bundle });

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await screen.findByText('Breakfast')).toBeVisible();
    expect(stationNames()).toEqual(['Breakfast', 'Lunch', 'Dinner']);
    // One whisper (the coach's open-plate hint, on the next open meal), the rest are quiet.
    expect(screen.getAllByText(QUIET)).toHaveLength(2);
    expect(screen.getByText('A calm, varied plate — anything you want to add?')).toBeVisible();
    expect(screen.queryByTestId(/^open-plate-/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('a partial day: one plate and two open stations', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(7, 30), [['Avocado toast', 'starch']]);
    await renderInSession(<TodayScreen />, { bundle });

    expect(await screen.findByText('Avocado toast')).toBeVisible();
    expect(screen.getAllByTestId(/^open-plate-/)).toHaveLength(1);
    expect(stationNames()).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });

  it('a full day: three plates, no open station', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(7, 30), [['Oatmeal', 'starch']]);
    await seedPlate(bundle, at(12, 45), [['Salad bowl', 'vegFruit']]);
    await seedPlate(bundle, at(19, 0), [['Pasta', 'starch']]);
    await renderInSession(<TodayScreen />, { bundle });

    expect(await screen.findByText('Pasta')).toBeVisible();
    expect(screen.getAllByTestId(/^open-plate-/)).toHaveLength(3);
    expect(screen.queryByText(QUIET)).not.toBeInTheDocument();
  });

  it('the late station only appears once it is used', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(23, 30), [['Toast', 'starch']]);
    await renderInSession(<TodayScreen />, { bundle });
    expect(await screen.findByText('Toast')).toBeVisible();
    expect(stationNames()).toContain('Late');
  });

  it("yesterday's plate is not on today's board, but is on yesterday's", async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(19, 0, -1), [['Yesterday pizza', 'starch']]);
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    expect(screen.queryByText('Yesterday pizza')).not.toBeInTheDocument();

    // The dock's week route: the second-to-last stop is yesterday.
    const route = screen.getByRole('navigation', { name: s.week.routeLabel });
    const stops = within(route).getAllByRole('button');
    await user.click(stops[5] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
    expect(await screen.findByText('Yesterday pizza')).toBeVisible();
  });

  it('an older day is titled by its weekday', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    const stops = within(screen.getByRole('navigation', { name: s.week.routeLabel })).getAllByRole(
      'button',
    );
    await user.click(stops[3] as HTMLElement);
    // 14 Oct 2026 is a Wednesday; three days earlier is Sunday.
    expect(await screen.findByRole('heading', { level: 1, name: 'Sunday' })).toBeVisible();
  });

  it('a station names the lines that stopped, never a count or a score', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(12, 45), [
      ['Lentil salad', 'protein'],
      ['Tomato', 'vegFruit'],
    ]);
    await renderInSession(<TodayScreen />, { bundle });
    const open = await screen.findByTestId(/^open-plate-/);
    const name = open.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/Lunch, 12:45/);
    expect(name).toMatch(/veg & fruit and protein stopped/i);
    expect(name).toMatch(/starch and dairy passed through/i);
    expect(document.body.textContent).not.toMatch(/\d+\s*(%|kcal|points?|of 4 filled)/i);
  });

  it('has a Settings entry and the calm "On this device" chip', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    expect(screen.getAllByRole('link', { name: 'Settings' })[0]).toHaveAttribute(
      'href',
      '#/settings',
    );
    expect(within(screen.getByRole('banner')).getByText('On this device')).toBeVisible();
    expect(screen.queryByText(/synced|pending/i)).not.toBeInTheDocument();
  });

  it('links to the week network below the line map (the rail is desktop-only)', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    const link = screen.getByRole('link', { name: s.today.seeWeekNetwork });
    expect(link).toHaveAttribute('href', '#/week');
    expect(link.className).toMatch(/lg:hidden/);
  });

  it('a store that fails shows one calm line: no retry button, no spinner', async () => {
    const bundle = await unlockedBundle();
    const failing = Object.create(bundle.store, {
      watchRange: {
        value: (_range: unknown, observer: { error: (f: unknown) => void }) => {
          queueMicrotask(() => observer.error(storeFailure('storeOperation')));
          return () => undefined;
        },
      },
    }) as StoreBundle['store'];
    await renderInSession(<TodayScreen />, { bundle: { ...bundle, store: failing } });
    expect(await screen.findByText("History can't load right now.")).toBeVisible();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^open-plate-/)).not.toBeInTheDocument();
  });

  it('says the storage answer once, quietly (durable storage)', async () => {
    const bundle = await unlockedBundle({ requestDurable: () => Promise.resolve('persisted') });
    await renderInSession(<TodayScreen />, { bundle });
    expect(await screen.findByText(s.durable.persisted)).toBeVisible();
    expect(screen.queryByText(s.durable.notPersisted)).not.toBeInTheDocument();
  });

  it('says nothing about storage when the browser cannot tell', async () => {
    const bundle = await unlockedBundle({ requestDurable: () => Promise.resolve('unsupported') });
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    expect(screen.queryByText(/Storage:/)).not.toBeInTheDocument();
  });

  it('has no axe violations (empty day, and with a plate and its coach card)', async () => {
    const bundle = await unlockedBundle();
    const { container } = await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    expect(await axe(container)).toHaveNoViolations();
    await act(async () => {
      const plate = await seedPlate(bundle, at(12, 45), [
        ['Lentil salad', 'protein'],
        ['Tomato', 'vegFruit'],
      ]);
      await bundle.notes.append({
        id: 0,
        plateLogId: plate.id,
        anchor: 'postResolve',
        questionKey: 'post.resolve.balanced',
        text: 'Nice plate — anything you would change next time?',
        generatedAt: Date.now(),
      });
    });
    await screen.findByText('Lentil salad, Tomato');
    await screen.findByRole('group', { name: s.coach.group });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('TodayScreen: removing a plate (the earlier client)', () => {
  async function setup() {
    const bundle = await unlockedBundle();
    const porridge = await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
    await seedPlate(bundle, at(12, 0), [['Soup', 'vegFruit']]);
    const view = await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Soup');
    return { bundle, porridge, ...view };
  }
  it('press and hold asks calmly; "Keep it" removes nothing', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    const open = within(screen.getByText('Porridge').closest('li') as HTMLElement).getByTestId(
      /^open-plate-/,
    );
    fireEvent.pointerDown(open, { button: 0, clientX: 5, clientY: 5 });
    await act(() => new Promise((r) => setTimeout(r, 650)));

    const dialog = await screen.findByRole('alertdialog', { name: 'Remove this plate?' });
    expect(within(dialog).getByText(/Porridge will be removed/)).toBeVisible();
    expect(within(dialog).getByText(/can’t be undone/)).toBeVisible();
    // The safe choice has the focus.
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates).toHaveLength(2);
    expect(screen.getByText('Porridge')).toBeVisible();
  });

  it('"Remove" deletes that plate only, with its coach note and dismissal, and the board updates', async () => {
    const user = userEvent.setup();
    const { bundle, porridge } = await setup();
    // Porridge has a coach note (written when it was logged by the app; seed one here) and a dismissal.
    await bundle.notes.append({
      id: 0,
      plateLogId: porridge.id,
      anchor: 'postResolve',
      questionKey: 'post.resolve.starchHeavy',
      text: 'note for porridge',
      generatedAt: Date.now(),
    });
    await user.click(
      within(screen.getByText('Porridge').closest('li') as HTMLElement).getByRole('button', {
        name: /^Remove this plate/,
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('Porridge')).not.toBeInTheDocument());
    expect(screen.getByText('Soup')).toBeVisible();
    expect(await screen.findByText('Plate removed.')).toBeVisible();
    expect(await bundle.notes.forPlate(porridge.id)).toEqual([]);
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates.map((p) => p.id)).not.toContain(porridge.id);
  });

  it('a failed removal says so, calmly, and keeps the plate', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
    const failing = Object.create(bundle.store, {
      deletePlate: {
        value: () => Promise.resolve(plateDeleteFailed(storeFailure('storeOperation'))),
      },
    }) as StoreBundle['store'];
    await renderInSession(<TodayScreen />, { bundle: { ...bundle, store: failing } });
    await screen.findByText('Porridge');
    await user.click(screen.getByRole('button', { name: /^Remove this plate/ }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Couldn’t remove it. Try again.')).toBeVisible();
    expect(screen.getByText('Porridge')).toBeVisible();
  });

  it('is reachable without a long press: a named "Remove this plate" button is in the tab order', async () => {
    const user = userEvent.setup();
    await setup();
    const row = screen.getByText('Soup').closest('li') as HTMLElement;
    const button = within(row).getByRole('button', { name: 'Remove this plate (Lunch, 12:00)' });
    // Hidden until focused, then it appears and opens the same calm confirm.
    expect(button).toHaveClass('sr-only');
    button.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alertdialog', { name: 'Remove this plate?' })).toBeVisible();
  });
});

describe('TodayScreen: the coach question (coach_whisper / coach_depth_panel / open_plate_hint)', () => {
  it('a logged plate gets one question; Sure opens the follow-up, Close retires it for good', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(12, 45), [['Chicken', 'protein']]);
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve',
      questionKey: 'post.resolve.proteinHeavy',
      text: 'A small bowl of greens or roasted veg would lighten this up.',
      generatedAt: Date.now(),
    });
    await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).getByText(/greens or roasted veg/)).toBeVisible();

    await user.click(within(card).getByRole('button', { name: 'Sure' }));
    const depth = await screen.findByRole('group', { name: s.coach.depthGroup });
    expect(depth).toBeVisible();
    await user.click(within(depth).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: s.coach.depthGroup })).toBeNull(),
    );
    expect(screen.queryByRole('group', { name: s.coach.group })).not.toBeInTheDocument();
  });

  it('Ask later dismisses durably: it is still gone after the screen is built again', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const plate = await seedPlate(bundle, at(12, 45), [['Chicken', 'protein']]);
    await bundle.notes.append({
      id: 0,
      plateLogId: plate.id,
      anchor: 'postResolve',
      questionKey: 'post.resolve.proteinHeavy',
      text: 'A small bowl of greens or roasted veg would lighten this up.',
      generatedAt: Date.now(),
    });
    const first = await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    await user.click(within(card).getByRole('button', { name: 'Ask later' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull());
    first.unmount();

    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Chicken');
    expect(screen.queryByRole('group', { name: s.coach.group })).not.toBeInTheDocument();
  });

  it('the open-station hint is one tap target that dismisses durably', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const first = await renderInSession(<TodayScreen />, { bundle });
    const hint = await screen.findByRole('button', {
      name: /A calm, varied plate — anything you want to add\?\. Tap to dismiss\./,
    });
    expect(hint).toHaveClass('min-h-12');
    // A hint is not a question: no Sure / Ask later.
    expect(screen.queryByRole('button', { name: 'Sure' })).not.toBeInTheDocument();
    await user.click(hint);
    await waitFor(() =>
      expect(screen.queryByText('A calm, varied plate — anything you want to add?')).toBeNull(),
    );
    first.unmount();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    expect(screen.queryByText('A calm, varied plate — anything you want to add?')).toBeNull();
  });
});
