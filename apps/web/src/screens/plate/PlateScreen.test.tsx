import { act, screen, waitFor, within } from '@testing-library/react';
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

async function openPlate() {
  const bundle = await unlockedBundle();
  const plate = await seedPlate(bundle, at(12, 55), [
    ['Lentil salad', 'protein'],
    ['Tomato', 'vegFruit'],
    ['Sourdough slice', 'starch'],
  ]);
  await bundle.notes.append({
    id: 0,
    plateLogId: plate.id,
    anchor: 'postResolve',
    questionKey: 'post.resolve.balanced',
    text: 'Nice plate — anything you would change next time?',
    generatedAt: Date.now(),
  });
  window.location.hash = `#/plate/${plate.id}`;
  const view = await renderUnlockedApp(bundle);
  await screen.findByRole('heading', { level: 1, name: 'Lunch' });
  return { bundle, plate, ...view };
}

describe('PlateScreen', () => {
  it('shows which lines stopped, what is on the plate and a way back to Today', async () => {
    await openPlate();
    const lines = screen.getByRole('list', { name: 'Lines at this station' });
    // Three lines stopped; dairy is drawn dashed with "passed" in words (never red).
    expect(within(lines).getByText('Veg & fruit')).toBeVisible();
    expect(within(lines).getByText('Protein')).toBeVisible();
    expect(within(lines).getByText('Starch')).toBeVisible();
    expect(within(lines).getByText('Dairy · passed')).toBeVisible();

    const entries = screen.getByRole('list', { name: 'On the plate' });
    expect(within(entries).getByText('Lentil salad')).toBeVisible();
    expect(within(entries).getAllByText('~1 fist')).toHaveLength(3);
    expect(screen.getByText('12:55')).toBeVisible();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '#/',
    );
  });

  it('carries the coach follow-up and the calm chip', async () => {
    const user = userEvent.setup();
    await openPlate();
    const card = await screen.findByRole('group', { name: 'Coach question' });
    await user.click(within(card).getByRole('button', { name: 'Sure' }));
    expect(await screen.findByRole('group', { name: 'More from the coach' })).toBeVisible();
    expect(screen.getAllByText('On this device').length).toBeGreaterThan(0);
  });

  it('removes the plate after a calm confirm and goes back to Today', async () => {
    const user = userEvent.setup();
    const { bundle, plate } = await openPlate();
    await user.click(screen.getByRole('button', { name: 'Remove this plate' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove this plate?' });
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(['', '#/']).toContain(window.location.hash));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await screen.findByText('Plate removed.')).toBeVisible();
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates.map((p) => p.id)).not.toContain(plate.id);
  });

  it('"Keep it" removes nothing', async () => {
    const user = userEvent.setup();
    const { bundle } = await openPlate();
    await user.click(screen.getByRole('button', { name: 'Remove this plate' }));
    await user.click(await screen.findByRole('button', { name: 'Keep it' }));
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Lunch' })).toBeVisible();
  });

  it('a plate that is not there sends the person back to Today', async () => {
    const bundle = await unlockedBundle();
    window.location.hash = '#/plate/999';
    await renderUnlockedApp(bundle);
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await waitFor(() => expect(['', '#/']).toContain(window.location.hash));
  });

  it('has no axe violations', async () => {
    const { container } = await openPlate();
    await screen.findByRole('group', { name: 'Coach question' });
    await act(async () => undefined);
    expect(await axe(container)).toHaveNoViolations();
  });
});
