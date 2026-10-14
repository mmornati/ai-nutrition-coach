import '@testing-library/jest-dom/vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { setCurrentLocale, useLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { TodayScreen } from './TodayScreen';

// A stand-in French catalogue: the real one lands in Phase C. Only the copy under test differs.
vi.mock('../../i18n/catalogues', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../i18n/catalogues')>();
  const { en } = await import('../../i18n/en');
  const fr = {
    ...en,
    coachQuestions: {
      ...en.coachQuestions,
      'openPlate.balanced': 'Une assiette variée : un ajout ?',
    },
    today: { ...en.today, plateRemoved: 'Assiette retirée.' },
  };
  return {
    ...original,
    catalogueFor: (locale: string) => (locale === 'fr' ? fr : en),
  };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
  window.location.hash = '';
});

function Switch() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale('fr')}>
      to-fr
    </button>
  );
}

// The provider sits above the session, as it does at the app root.
const wrapper = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial="en">{children}</LocaleProvider>
);
const ui = (
  <>
    <Switch />
    <TodayScreen />
  </>
);

describe('TodayScreen follows the locale without a remount', () => {
  it('the open-plate hint (a memoised coach question) is re-worded after setLocale', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(ui, { bundle, wrapper });

    await screen.findByRole('button', {
      name: /A calm, varied plate — anything you want to add\?\. Tap to dismiss\./,
    });
    await user.click(screen.getByRole('button', { name: 'to-fr' }));

    await waitFor(() =>
      expect(screen.getByText('Une assiette variée : un ajout ?')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/A calm, varied plate/)).not.toBeInTheDocument();
  });

  it('a notice already on screen is re-worded after setLocale', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
    await renderInSession(ui, { bundle, wrapper });
    await screen.findByText('Porridge');
    await user.click(screen.getByRole('button', { name: /^Remove this plate/ }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Plate removed.')).toBeVisible();

    await act(async () => {
      setCurrentLocale('fr');
    });
    expect(await screen.findByText('Assiette retirée.')).toBeVisible();
  });
});
