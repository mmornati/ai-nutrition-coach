// Settings, Profile: optional radio groups, kept in the encrypted store, with the support line.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { ProfileScreen } from './ProfileScreen';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const group = (name: string) => screen.getByRole('group', { name });
const stored = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) =>
  JSON.parse((await bundle.kv.read(KV_KEYS.profile)) ?? 'null') as Record<string, unknown> | null;

describe('ProfileScreen', () => {
  it('shows the optional line and every group on "Not set"', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    expect(
      screen.getByText(
        'Optional. It only tunes the daily guide and the coach. It stays encrypted on this device.',
      ),
    ).toBeVisible();
    for (const name of ['Age range', 'Sex', 'Activity', 'Goal', 'Diet']) {
      expect(within(group(name)).getByRole('radio', { name: 'Not set' })).toBeChecked();
    }
    expect(screen.getByRole('button', { name: 'Clear profile' })).toBeDisabled();
    expect(screen.getByText(/Until then the EU reference intake is used/)).toBeVisible();
  });

  it('a choice is kept in the encrypted store and personalises the guide', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Female' }));
    await userEvent.click(within(group('Age range')).getByRole('radio', { name: '30-49' }));
    await userEvent.click(within(group('Activity')).getByRole('radio', { name: 'Some movement' }));
    await waitFor(async () =>
      expect(await stored(bundle)).toEqual({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
      }),
    );
    expect(await screen.findByText(/Your daily guide is about 2000 kcal/)).toBeVisible();
  });

  it('radio targets are at least 48px tall', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    const pill = within(group('Sex')).getByRole('radio', { name: 'Male' }).nextElementSibling;
    expect(pill?.className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: 'Clear profile' }).className).toContain('min-h-12');
  });

  it('shows the support line beside the goal only when the goal is to lose weight', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    expect(screen.queryByRole('link', { name: /Beat/ })).toBeNull();
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Stay as I am' }));
    expect(screen.queryByRole('link', { name: /Beat/ })).toBeNull();
    await userEvent.click(
      within(group('Goal')).getByRole('radio', { name: 'Lose a little weight' }),
    );
    const link = await screen.findByRole('link', { name: /Beat, the UK eating disorder charity/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('adds and removes allergy tags', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.type(screen.getByLabelText('Allergies or foods to avoid'), 'Peanut{Enter}');
    await userEvent.type(screen.getByLabelText('Allergies or foods to avoid'), 'Sesame');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(async () =>
      expect((await stored(bundle))?.['allergies']).toEqual(['Peanut', 'Sesame']),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Peanut' }));
    await waitFor(async () => expect((await stored(bundle))?.['allergies']).toEqual(['Sesame']));
  });

  it('"Clear profile" removes everything and says so', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(within(group('Diet')).getByRole('radio', { name: 'Vegan' }));
    await waitFor(async () => expect(await stored(bundle)).toEqual({ diet: 'vegan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear profile' }));
    expect(await screen.findByText('Profile cleared.')).toBeVisible();
    expect(await stored(bundle)).toBeNull();
    expect(within(group('Diet')).getByRole('radio', { name: 'Not set' })).toBeChecked();
  });

  it('says so, and changes nothing, when the choice cannot be kept', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    vi.spyOn(bundle.kv, 'write').mockRejectedValue(new Error('locked'));
    await userEvent.click(within(group('Diet')).getByRole('radio', { name: 'Vegan' }));
    expect(await screen.findByText(/did not save just now/)).toBeVisible();
    expect(within(group('Diet')).getByRole('radio', { name: 'Not set' })).toBeChecked();
  });

  it('is reachable from the Settings board', async () => {
    window.location.hash = '#/settings';
    await renderUnlockedApp(await unlockedBundle());
    await userEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });

  it('has no axe violations', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    await userEvent.click(
      within(group('Goal')).getByRole('radio', { name: 'Lose a little weight' }),
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
