import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { forgetAcknowledgedBeforeStore } from './app/about-ack';
import { memoryBundle } from './app/testing';
import { fr } from './i18n/fr';

// One controllable update signal for the whole file.
const sw = vi.hoisted(() => ({ needRefresh: false }));
vi.mock('./pwa/useAppUpdate', () => ({
  useAppUpdate: () => ({ updateReady: sw.needRefresh, applyUpdate: () => Promise.resolve() }),
}));

afterEach(() => {
  forgetAcknowledgedBeforeStore();
  sw.needRefresh = false;
  window.location.hash = '';
});

const firstRun = () => render(<App createBundle={async () => memoryBundle()} />);

describe('App', () => {
  it('opens on the About notice on a first run, before any passphrase screen', async () => {
    firstRun();
    expect(await screen.findByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
    expect(screen.queryByLabelText('Passphrase')).not.toBeInTheDocument();
  });

  it('serves the dev gallery on #/gallery while developing', async () => {
    window.location.hash = '#/gallery';
    firstRun();
    expect(await screen.findByRole('heading', { level: 1, name: 'Gallery' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = firstRun();
    await screen.findByRole('heading', { level: 1, name: 'About this app' });
    expect(await axe(container)).toHaveNoViolations();
  });

  // the earlier client: the locale resolves to English for any browser locale we do not speak, and
  // a malformed `navigator.languages` tag never stops the app.
  it.each([
    ['a POSIX tag', ['C.UTF-8', 'en_US.UTF-8']],
    ['an empty tag', ['']],
    ['garbage', ['zz-@@-??', 'x']],
    ['another language', ['ja', 'de-DE']],
    ['no languages at all', []],
  ])('is English for a browser locale it does not speak (%s)', async (_name, languages) => {
    const spy = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);
    const lang = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
    try {
      firstRun();
      expect(
        await screen.findByRole('heading', { level: 1, name: 'About this app' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    } finally {
      spy.mockRestore();
      lang.mockRestore();
    }
  });

  it('speaks French on a first run in a French browser', async () => {
    const spy = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'en']);
    try {
      firstRun();
      expect(
        await screen.findByRole('heading', { level: 1, name: fr.about.title }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: fr.about.ok })).toBeInTheDocument();
      expect(document.documentElement.lang).toBe('fr');
    } finally {
      spy.mockRestore();
    }
  });

  // the earlier client: the update line appears above every screen, only while an update is
  // waiting and not dismissed.
  it('shows the update line above the first-run screens and Today, until it is dismissed', async () => {
    const user = userEvent.setup();
    sw.needRefresh = true;
    firstRun();
    const line = await screen.findByText(/A new version is ready/);
    expect(line).toBeVisible();
    // The line comes after the page in the DOM (read after it) and is pinned first with CSS order.
    const main = screen.getByRole('main');
    expect(main.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/A new version is ready/)).not.toBeInTheDocument();
  });

  it('shows no update line while no update is waiting', async () => {
    firstRun();
    await screen.findByRole('heading', { level: 1, name: 'About this app' });
    expect(screen.queryByText(/A new version is ready/)).not.toBeInTheDocument();
  });
});
