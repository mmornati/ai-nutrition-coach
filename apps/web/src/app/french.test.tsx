// The main screens in French: each shows the French catalogue's copy, no English copy leaks into
// its text or accessible names, and axe passes. The language is set the way the app sets it: a
// LocaleProvider above the session, and the stored preference read at the unlock.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { ERASE_SUCCESS, type QuantityRange } from '@anc/core';
import { currentLocale, setCurrentLocale } from '../i18n';
import { fr } from '../i18n/fr';
import { DEFAULT_LOCALE } from '../i18n/locale';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { englishLeaks } from '../i18n/testing';
import { KV_KEYS } from '../storage';
import { AboutNotice } from '../screens/about/AboutNotice';
import { CreatePassphraseScreen } from '../screens/gate/CreatePassphraseScreen';
import { LostStoreScreen } from '../screens/gate/LostStoreScreen';
import { StoreUnavailableScreen } from '../screens/gate/StoreUnavailableScreen';
import { UnlockScreen } from '../screens/gate/UnlockScreen';
import { at, renderUnlockedApp, seedFoodPlate, seedPlate, unlockedBundle } from './testing';

const range = (low: number, high: number, unit: string, displayLabel: string): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel,
});

const French = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial="fr">{children}</LocaleProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  cleanup(); // unmount before the locale resets, so nothing re-renders outside act()
  vi.useRealTimers();
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
  window.location.hash = '';
});

/** An unlocked app whose stored language is French, opened at `hash`, with two plates. */
async function openInFrench(hash: string) {
  const bundle = await unlockedBundle();
  await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
  await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
  await seedPlate(bundle, at(12, 0, -1), [
    ['Eggs', 'protein'],
    ['Spinach', 'vegFruit'],
    ['Toast', 'starch'],
    ['Milk', 'dairy'],
  ]);
  window.location.hash = hash;
  const view = await renderUnlockedApp(bundle, { wrapper: French });
  return { bundle, ...view };
}

const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

async function expectFrenchOnly() {
  expect(currentLocale()).toBe('fr');
  expect(document.documentElement.lang).toBe('fr');
  expect(englishLeaks()).toEqual([]);
  expect(await axe(document.body)).toHaveNoViolations();
}

describe('the app in French', () => {
  it('Today: header, stations, the plate and its lines', async () => {
    await openInFrench('#/');
    await h1(fr.today.today);
    await screen.findByText('Porridge');
    for (const meal of [fr.slots.lunch, fr.slots.dinner]) {
      expect(screen.getByRole('heading', { level: 2, name: meal })).toBeVisible();
    }
    expect(screen.getByRole('heading', { level: 2, name: /^Petit-déjeuner/ })).toBeVisible();
    const plate = screen.getByTestId(/^open-plate-/);
    expect(plate.getAttribute('aria-label')).toMatch(/^Ouvrir Petit-déjeuner, 08:00/);
    expect(plate.getAttribute('aria-label')).toContain('arrêt pour féculents');
    expect(screen.getAllByRole('button', { name: fr.shell.logAPlate }).length).toBeGreaterThan(0);
    await expectFrenchOnly();
  });

  it('Week: the network, the day list and the note, in words', async () => {
    await openInFrench('#/week');
    await h1(fr.week.title);
    await screen.findByRole('button', { name: 'Mardi, les quatre lignes' }, { timeout: 5000 });
    expect(screen.getByText(fr.week.noStreaks)).toBeVisible();
    expect(screen.getByText('8 – 14 octobre')).toBeVisible();
    const route = screen.getByRole('navigation', { name: /^Cette semaine/ });
    expect(within(route).getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /^Réseau de la semaine\. .*Mardi\u202F: les quatre lignes\. Aujourd’hui\u202F: féculents\u202F; .* au calme\.$/,
    );
    await expectFrenchOnly();
  });

  it('the capture sheet: the three ways to log', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openInFrench('#/');
    await h1(fr.today.today);
    await user.click(screen.getAllByRole('button', { name: fr.shell.logAPlate })[0] as HTMLElement);
    const sheet = await screen.findByRole('dialog', { name: fr.capture.title });
    for (const way of [fr.capture.snapshot, fr.capture.barcode, fr.capture.type]) {
      expect(within(sheet).getByRole('button', { name: new RegExp(`^${way}`) })).toBeVisible();
    }
    await expectFrenchOnly();
  });

  it.each([
    ['#/settings', fr.settings.title],
    ['#/settings/ai', fr.ai.yourAi.title],
    ['#/settings/data', fr.yourData.title],
    ['#/settings/privacy', fr.privacy.title],
    ['#/settings/language', fr.language.title],
    ['#/settings/install', fr.install.title],
    ['#/settings/about', fr.aboutScreen.title],
  ])('Settings %s', async (hash, title) => {
    await openInFrench(hash);
    await h1(title);
    await expectFrenchOnly();
  });
});

describe('food names and portions in French', () => {
  /** Plates logged while the app spoke English: the stored text is English, the refs are frozen. */
  async function openWithSeedPlate(hash: (plateId: number) => string) {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
    const plate = await seedFoodPlate(bundle, at(8, 0), [
      ['seed:salmon', 'Salmon', 'protein', range(1.5, 1.5, 'fist', '~1.5 fists')],
      ['seed:spinach', 'Spinach', 'vegFruit', range(1, 2, 'cup', '~1–2 cups')],
      ['seed:chicken breast', 'Chicken Breast', 'protein', range(1, 1, 'fist', '~1 fist')],
      // Not a seed food: a model's name and free-text hint stay exactly as logged.
      [
        'byok-m-Porridge',
        'Porridge maison',
        'starch',
        range(1, 1, 'environ 2 bols', 'environ 2 bols'),
      ],
    ]);
    window.location.hash = hash(plate.id);
    const view = await renderUnlockedApp(bundle, { wrapper: French });
    return { bundle, plate, ...view };
  }

  it('Today names a plate of seed foods in French, and keeps anything else as logged', async () => {
    await openWithSeedPlate(() => '#/');
    await h1(fr.today.today);
    await screen.findByText('Saumon, Épinards, Filet de poulet, Porridge maison');
    await expectFrenchOnly();
  });

  it('the plate screen words the names and the portions in French', async () => {
    await openWithSeedPlate((id) => `#/plate/${id}`);
    const list = await screen.findByRole('list', { name: fr.entries.label });
    const rows = within(list)
      .getAllByRole('listitem')
      .map((li) => [...li.querySelectorAll('span')].slice(0, 2).map((e) => e.textContent));
    expect(rows).toEqual([
      ['Saumon', '~1,5 poing'],
      ['Épinards', '~1–2 tasses'],
      ['Filet de poulet', '~1 poing'],
      ['Porridge maison', 'environ 2 bols'],
    ]);
    await expectFrenchOnly();
  });

  it('Type it finds foods by their French or English name and offers French portions', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openInFrench('#/');
    await h1(fr.today.today);
    await user.click(screen.getAllByRole('button', { name: fr.shell.logAPlate })[0] as HTMLElement);
    const sheet = await screen.findByRole('dialog', { name: fr.capture.title });
    await user.click(
      within(sheet).getByRole('button', { name: new RegExp(`^${fr.capture.type}`) }),
    );
    const typeIt = await screen.findByRole('dialog', { name: fr.catalog.title });
    const search = within(typeIt).getByLabelText(fr.catalog.searchLabel);

    await user.type(search, 'epinards');
    const spinach = await within(typeIt).findByRole('button', { name: /^Épinards, / });
    await user.click(spinach);
    const portions = within(typeIt).getByRole('group', { name: fr.portion.label });
    expect(
      within(portions)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringMatching(/^~1–2 tasses · ≈\d+\u202fg$/)]);
    await expectFrenchOnly();

    await user.clear(search);
    await user.type(search, 'apple');
    expect(await within(typeIt).findByRole('button', { name: /^Pomme, / })).toBeVisible();
    expect(within(typeIt).queryByText('Apple')).toBeNull();
    await expectFrenchOnly();
  });
});

describe('the leak check itself', () => {
  it('finds English copy on an English screen', async () => {
    const bundle = await unlockedBundle();
    window.location.hash = '#/settings';
    await renderUnlockedApp(bundle);
    await h1('Settings');
    await screen.findByText('Your data');
    expect(englishLeaks()).toEqual(expect.arrayContaining(['Your data', 'Install on your phone']));
  });
});

describe('the screens before the unlock, in French', () => {
  const renderFr = (ui: ReactNode) => render(<French>{ui}</French>);
  const unlocked = () => Promise.resolve({ kind: 'unlocked' } as const);

  it('About notice', async () => {
    renderFr(<AboutNotice onDismiss={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1, name: fr.about.title })).toBeVisible();
    expect(screen.getByRole('button', { name: fr.about.ok })).toBeVisible();
    await expectFrenchOnly();
  });

  it('Create passphrase', async () => {
    renderFr(<CreatePassphraseScreen onCreate={unlocked} />);
    expect(screen.getByRole('heading', { level: 1, name: fr.session.createTitle })).toBeVisible();
    expect(screen.getByText(fr.session.createWarning)).toBeVisible();
    await expectFrenchOnly();
  });

  it('Unlock, with the forgot disclosure', async () => {
    renderFr(<UnlockScreen onUnlock={unlocked} onErase={() => Promise.resolve(ERASE_SUCCESS)} />);
    expect(screen.getByRole('heading', { level: 1, name: fr.session.label })).toBeVisible();
    expect(screen.getByRole('button', { name: fr.session.unlock })).toBeVisible();
    await expectFrenchOnly();
  });

  it.each([['unreadable'], ['lost'], ['openFailed']] as const)('Lost store (%s)', async (kind) => {
    renderFr(
      <LostStoreScreen copy={fr.keyLost[kind]} onErase={() => Promise.resolve(ERASE_SUCCESS)} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: fr.keyLost[kind].title })).toBeVisible();
    await expectFrenchOnly();
  });

  it.each([[null], ['insecureContext'], ['inUse']] as const)(
    'Store unavailable (%s)',
    async (reason) => {
      renderFr(<StoreUnavailableScreen reason={reason} onRetry={() => Promise.resolve()} />);
      expect(
        screen.getByRole('heading', { level: 1, name: fr.storeUnavailable.title }),
      ).toBeVisible();
      await expectFrenchOnly();
    },
  );
});
