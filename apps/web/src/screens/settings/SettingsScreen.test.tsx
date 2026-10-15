// Port of the earlier client: the departures board, its rows and
// where each one goes. No tip jar (it needs the named reviewer's decision first).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { SettingsScreen } from './SettingsScreen';

afterEach(() => {
  window.location.hash = '';
});

async function openSettings(hash = '#/settings') {
  const bundle = await unlockedBundle();
  window.location.hash = hash;
  await renderUnlockedApp(bundle);
  return bundle;
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('SettingsScreen', () => {
  it('lists Your AI, Your data, Privacy, Language, Install on your phone and About, in that order, with their subtitles', async () => {
    await openSettings();
    await heading('Settings');
    const rows = screen
      .getAllByRole('button')
      .filter((b) => b.closest('ul') !== null && b.closest('li') !== null);
    expect(rows.map((r) => r.querySelector('span span')?.textContent)).toEqual([
      'Your AI',
      'Your data',
      'Privacy',
      'Language',
      'Install on your phone',
      'About',
    ]);
    expect(screen.getByText('offline (no AI)')).toBeVisible();
    expect(screen.getByText('export · lock · erase')).toBeVisible();
    expect(screen.getByText('what is stored · what is sent')).toBeVisible();
    expect(screen.getByText('match your device · or choose')).toBeVisible();
    expect(screen.getByText('offline · own icon')).toBeVisible();
    expect(document.body.textContent?.toLowerCase()).not.toContain('tip jar');
  });

  it.each([
    ['Your AI', 'Your AI'],
    ['Your data', 'Your data'],
    ['Privacy', 'What this app stores and sends'],
    ['Language', 'Language'],
    ['Install on your phone', 'Install on your phone'],
    ['About', 'About'],
  ])('%s opens its screen and the way back returns to the board', async (row, title) => {
    const user = userEvent.setup();
    await openSettings();
    await heading('Settings');
    await user.click(screen.getByRole('button', { name: new RegExp(`^${row}`) }));
    await heading(title);
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Settings' }));
    await heading('Settings');
  });

  it('the Your AI row shows the live rung', async () => {
    const user = userEvent.setup();
    await openSettings('#/settings/ai');
    await heading('Your AI');
    await user.click(screen.getByRole('radio', { name: /My own key/ }));
    await user.type(screen.getByLabelText('Endpoint'), 'http://localhost:11434/v1');
    await user.type(screen.getByLabelText('Model'), 'llava');
    await user.type(screen.getByLabelText('API key'), 'sk-local-1234567890abcdef');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Settings' }));
    await heading('Settings');
    expect(await screen.findByText('your key — 1 model')).toBeVisible();
    expect(screen.queryByText('offline (no AI)')).toBeNull();
  });

  it('an unknown section is the board, never a dead end', async () => {
    await openSettings('#/settings/nothing-here');
    await heading('Settings');
  });

  it('the header leaves Settings for Today', async () => {
    await openSettings();
    await heading('Settings');
    expect(screen.getAllByRole('link', { name: 'Today' })[0]).toHaveAttribute('href', '#/');
  });

  it('has no axe violations', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<SettingsScreen section={null} />, { bundle });
    await heading('Settings');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
