// The language across the unlock: the gate speaks the plaintext hint, the unlocked app speaks the
// stored preference, and an erase returns to the browser's language.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locale';
import { KV_KEYS } from '../storage';
import { LOCALE_HINT_KEY } from '../storage/constants';
import { forgetAcknowledgedBeforeStore } from './about-ack';
import { AppRoot } from './AppRoot';
import { lockedBundle, memoryBundle, PASSPHRASE, unlockedBundle } from './testing';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup(); // unmount before the locale resets, so nothing re-renders outside act()
  forgetAcknowledgedBeforeStore();
  window.location.hash = '';
  window.localStorage.clear();
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
});

async function lockedWithStoredLanguage() {
  const bundle = await unlockedBundle();
  await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
  await bundle.kv.write(KV_KEYS.privacyAboutAckAtUtc, new Date().toISOString());
  await bundle.controller.lock();
  return bundle;
}

describe('AppRoot: language', () => {
  it('follows the browser when there is no hint (jsdom is en-US)', async () => {
    const bundle = await lockedBundle();
    render(<AppRoot createBundle={() => Promise.resolve(bundle)} />);
    await screen.findByRole('heading', { level: 1, name: 'Unlock your store' });
    expect(document.documentElement.lang).toBe('en');
  });

  it('the gate uses the plaintext hint before the unlock, the unlocked app the stored preference', async () => {
    const user = userEvent.setup();
    const bundle = await lockedWithStoredLanguage();
    window.localStorage.setItem(LOCALE_HINT_KEY, 'fr');
    render(<AppRoot createBundle={() => Promise.resolve(bundle)} />);
    await screen.findByRole('heading', { level: 1, name: 'Unlock your store' });
    expect(document.documentElement.lang).toBe('fr');

    window.localStorage.setItem(LOCALE_HINT_KEY, 'en'); // a stale hint
    await user.type(screen.getByLabelText('Passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(document.documentElement.lang).toBe('fr');
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBe('fr'); // refreshed
  });

  it('after an erase the first-run screens follow the browser again', async () => {
    const bundle = await lockedWithStoredLanguage();
    window.localStorage.setItem(LOCALE_HINT_KEY, 'fr');
    render(<AppRoot createBundle={() => Promise.resolve(bundle)} />);
    await screen.findByRole('heading', { level: 1, name: 'Unlock your store' });
    expect(document.documentElement.lang).toBe('fr');

    // The hint is left for the erase path itself: the sweep and the gate's re-resolve together.
    await act(async () => {
      await bundle.eraser.eraseAll();
    });
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBeNull();
  });

  it('a first run ignores a stale hint (left by an evicted store) and clears it', async () => {
    window.localStorage.setItem(LOCALE_HINT_KEY, 'fr');
    const bundle = memoryBundle(); // no store yet
    render(<AppRoot createBundle={() => Promise.resolve(bundle)} />);
    await screen.findByRole('heading', { level: 1, name: /about this app/i });
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBeNull();
  });
});
