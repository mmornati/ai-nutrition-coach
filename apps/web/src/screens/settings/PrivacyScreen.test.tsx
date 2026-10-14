// Port of apps/client/test/screens/privacy_screen_test.dart, plus the web rule: the page is
// reachable BEFORE the unlock (no session), where it has no Open Food Facts switch.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderUnlockedApp, renderInSession, unlockedBundle } from '../../app/testing';
import { parseRoute } from '../../app/router';
import { PrivacyScreen } from './PrivacyScreen';
import { SettingsScreen } from './SettingsScreen';
import { KV_KEYS } from '../../storage';

afterEach(() => {
  window.location.hash = '';
});

const SECTIONS_TEXT = [
  'Stored on this device, encrypted',
  'What leaves this device, and when',
  'Scanning a barcode',
  'Open Food Facts',
  'Only the barcode is sent',
  'Recognising a photo',
  'only if you turned on your own AI and say yes',
  'may keep requests under its own policy',
  'What the server you got this app from sees',
  'Nothing about you or your plates',
  'Never collected',
  'No analytics, no tracking, no crash reports',
  'no accounts',
  'Deleting your data',
  'Erase all local data',
  'Exporting',
  'plain, unencrypted text files',
  'Shared devices',
];

describe('PrivacyScreen: before the unlock', () => {
  it('routes #/privacy to the Privacy page and works with no session at all', () => {
    expect(parseRoute('#/privacy')).toEqual({ name: 'settings', section: 'privacy' });
    render(<SettingsScreen section="privacy" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'What this app stores and sends' }),
    ).toBeVisible();
    for (const text of SECTIONS_TEXT) {
      expect(document.body.textContent, text).toContain(text);
    }
    // No store is open: nothing to switch, and no shell around the page.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '#/');
  });

  it('states the shared-device note: one history, no in-app profile or app lock', () => {
    render(<PrivacyScreen />);
    expect(screen.getByRole('heading', { level: 2, name: 'Shared devices' })).toBeVisible();
    expect(
      screen.getByText(/sees the same history; there is no in-app profile or app lock/),
    ).toBeVisible();
  });

  it('has no axe violations', async () => {
    render(<PrivacyScreen />);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('PrivacyScreen: unlocked', () => {
  it('has no Android scanner note (the web build has no ML Kit) and describes removing a plate from Today', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<PrivacyScreen />, { bundle });
    expect(document.body.textContent).not.toContain('ML Kit');
    expect(screen.getByText(/open it from Today and choose Remove this plate/)).toBeVisible();
  });

  it('the barcode switch reflects and stores the answer', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<PrivacyScreen />, { bundle });
    const sw = await screen.findByRole('switch', { name: 'Look up barcodes on Open Food Facts' });
    await screen.findByText('You will be asked the first time you scan a barcode.');
    expect(sw).not.toBeChecked();

    await user.click(sw);
    expect(await screen.findByText('On: a scanned barcode is looked up online.')).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.privacyOffLookup)).toBe('allowed');
    expect(sw).toBeChecked();

    await user.click(sw);
    expect(await screen.findByText(/only the offline catalog is used/)).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.privacyOffLookup)).toBe('offlineOnly');
    expect(sw).not.toBeChecked();
  });

  it('a stored "offline only" answer shows the switch off', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.privacyOffLookup, 'offlineOnly');
    await renderInSession(<PrivacyScreen />, { bundle });
    expect(await screen.findByText(/only the offline catalog is used/)).toBeVisible();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('a failed write leaves the switch where it was and says so', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<PrivacyScreen />, { bundle });
    const sw = await screen.findByRole('switch');
    await screen.findByText('You will be asked the first time you scan a barcode.');
    await bundle.controller.lock();
    await user.click(sw);
    expect(
      await screen.findByText(/Couldn’t save that\. Unlock the app and try again\./),
    ).toBeVisible();
    expect(sw).not.toBeChecked();
  });

  it('is reachable from Settings and inside the shell, with a way back to Settings', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    window.location.hash = '#/settings';
    await renderUnlockedApp(bundle);
    await user.click(await screen.findByRole('button', { name: /Privacy/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'What this app stores and sends' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '#/settings');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
