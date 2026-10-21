import '@testing-library/jest-dom/vitest';
import { act, cleanup, getDefaultNormalizer, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { fr } from '../../i18n/fr';
import { setCurrentLocale, useLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { TodayScreen } from './TodayScreen';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  // Unmount first: resetting the module locale under a mounted provider re-renders it outside act().
  cleanup();
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
    await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
    await renderInSession(ui, { bundle, wrapper });

    await screen.findByRole('button', {
      name: /No veg or fruit logged yet today\. Could this meal have a handful\?\. Tap to dismiss\./,
    });
    await user.click(screen.getByRole('button', { name: 'to-fr' }));

    await waitFor(() =>
      // Keep French narrow no-break spaces as they are (the default normalizer folds them).
      expect(
        screen.getByText(fr.coachQuestions['openPlate.vegLight'], {
          normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/No veg or fruit logged yet today/)).not.toBeInTheDocument();
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
    expect(await screen.findByText(fr.today.plateRemoved)).toBeVisible();
  });

  it('a coach note stored in English is shown in the current language (looked up by its key)', async () => {
    const bundle = await unlockedBundle();
    const plate = await seedPlate(bundle, at(12, 0), [['Chicken', 'protein']]);
    await bundle.notes.append({
      id: 0,
      plateLogId: plate.id,
      anchor: 'postResolve',
      questionKey: 'post.resolve.proteinHeavy',
      text: 'A small bowl of greens or roasted veg would lighten this up.',
      generatedAt: Date.now(),
    });
    await renderInSession(ui, { bundle, wrapper });
    expect(await screen.findByText(/Quite a bit of protein/)).toBeVisible();

    await act(async () => {
      setCurrentLocale('fr');
    });
    expect(
      await screen.findByText(fr.coachQuestions['post.resolve.proteinHeavy'], {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toBeVisible();
    expect(screen.queryByText(/Quite a bit of protein/)).not.toBeInTheDocument();
  });
});
