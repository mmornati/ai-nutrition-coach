// Settings, Nutrition: one switch, on by default, kept in the encrypted store, calm words.
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  at,
  renderInSession,
  renderUnlockedApp,
  seedMeasuredPlate,
  unlockedBundle,
} from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { NutritionScreen } from './NutritionScreen';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const SWITCH = { name: 'Show nutrition numbers' };

describe('NutritionScreen', () => {
  it('shows the switch on by default, with the calm line', async () => {
    await renderInSession(<NutritionScreen />, { bundle: await unlockedBundle() });
    expect(screen.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
    expect(screen.getByRole('switch', SWITCH)).toBeChecked();
    expect(
      screen.getByText(
        'If numbers about food feel stressful, you can turn them off. Your meals are still logged.',
      ),
    ).toBeVisible();
  });

  it('turning it off is kept in the encrypted store and survives a new session', async () => {
    const bundle = await unlockedBundle();
    const first = await renderInSession(<NutritionScreen />, { bundle });
    await userEvent.click(screen.getByRole('switch', SWITCH));
    await waitFor(() => expect(screen.getByRole('switch', SWITCH)).not.toBeChecked());
    expect(await bundle.kv.read(KV_KEYS.uiShowNumbers)).toBe('off');
    first.unmount();

    await renderInSession(<NutritionScreen />, { bundle });
    expect(screen.getByRole('switch', SWITCH)).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', SWITCH));
    await waitFor(() => expect(screen.getByRole('switch', SWITCH)).toBeChecked());
    expect(await bundle.kv.read(KV_KEYS.uiShowNumbers)).toBeNull();
  });

  it('says so, and stays where it was, when the choice cannot be kept', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<NutritionScreen />, { bundle });
    vi.spyOn(bundle.kv, 'write').mockRejectedValue(new Error('locked'));
    await userEvent.click(screen.getByRole('switch', SWITCH));
    expect(await screen.findByText(/did not save just now/)).toBeVisible();
    expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  });

  it('is reachable from the Settings board', async () => {
    const bundle = await unlockedBundle();
    window.location.hash = '#/settings';
    await renderUnlockedApp(bundle);
    await userEvent.click(await screen.findByRole('button', { name: /^Nutrition/ }));
    expect(await screen.findByRole('switch', SWITCH)).toBeVisible();
  });

  it('turning it off hides the Today nutrition section, while the meal stays', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
    const bundle = await unlockedBundle();
    await seedMeasuredPlate(bundle, at(12, 0), [
      { name: 'Yogurt', group: 'dairy', grams: 125, per100g: { protein: 4, energyKcal: 60 } },
    ]);
    window.location.hash = '#/';
    await renderUnlockedApp(bundle);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Today’s nutrition' }),
    ).toBeVisible();

    window.location.hash = '#/settings/nutrition';
    await userEvent.click(await screen.findByRole('switch', SWITCH));
    await waitFor(() => expect(screen.getByRole('switch', SWITCH)).not.toBeChecked());

    window.location.hash = '#/';
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(screen.queryByRole('heading', { name: 'Today’s nutrition' })).toBeNull();
    // The meal itself is still there.
    expect(await screen.findByText('Yogurt')).toBeVisible();
  });

  it('has no axe violations', async () => {
    await renderInSession(<NutritionScreen />, { bundle: await unlockedBundle() });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
