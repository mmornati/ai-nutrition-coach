// "Log this again" and "Save as a meal" on the Plate screen.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import { setCurrentLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { KV_KEYS } from '../../storage';
import { at, renderUnlockedApp, seedMeasuredPlate, unlockedBundle } from '../../app/testing';

const French = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial="fr">{children}</LocaleProvider>
);

beforeEach(() => {
  // Wednesday 2026-10-14, 20:00: dinner time.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  setCurrentLocale('en');
  vi.useRealTimers();
  window.location.hash = '';
});

const SALMON = { energyKcal: 208, protein: 20, fat: 13 };

async function openPlate() {
  const bundle = await unlockedBundle();
  const plate = await seedMeasuredPlate(bundle, at(12, 55), [
    { name: 'Salmon', group: 'protein', grams: 150, estimated: false, per100g: SALMON },
    { name: 'Rice', group: 'starch', grams: 180, estimated: true },
  ]);
  window.location.hash = `#/plate/${plate.id}`;
  const view = await renderUnlockedApp(bundle);
  await screen.findByRole('heading', { level: 1, name: 'Lunch' });
  return { bundle, plate, ...view };
}

const allPlates = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) => {
  const read = await bundle.store.readRange();
  if (read.kind !== 'platesRead') throw new Error('read failed');
  return read.plates;
};

describe('Log this again', () => {
  it('opens a sheet with today and the current meal chosen, and no axe violations', async () => {
    const user = userEvent.setup();
    await openPlate();
    await user.click(screen.getByRole('button', { name: 'Log this again' }));
    const sheet = await screen.findByRole('dialog', { name: 'Log this again' });
    const day = within(sheet).getByRole('group', { name: 'Which day' });
    expect(within(day).getByRole('radio', { name: 'Today' })).toBeChecked();
    expect(within(day).getAllByRole('radio')).toHaveLength(7);
    const meal = within(sheet).getByRole('group', { name: 'Which meal' });
    expect(within(meal).getByRole('radio', { name: 'Dinner' })).toBeChecked();
    // "Late" is not offered for a lunch: an empty late row would invite logging at night.
    expect(within(meal).queryByRole('radio', { name: 'Late' })).not.toBeInTheDocument();
    expect(await axe(sheet)).toHaveNoViolations();
  });

  it('logs a NEW plate on today at the current time, with the same foods, grams and nutrients', async () => {
    const user = userEvent.setup();
    const { bundle, plate } = await openPlate();
    await user.click(screen.getByRole('button', { name: 'Log this again' }));
    const sheet = await screen.findByRole('dialog', { name: 'Log this again' });
    await user.click(within(sheet).getByRole('button', { name: 'Log this plate' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await screen.findByText('Logged again: Dinner.')).toBeVisible();
    await waitFor(() => expect(['', '#/']).toContain(window.location.hash));

    const plates = await allPlates(bundle);
    expect(plates).toHaveLength(2);
    const copy = plates.find((p) => p.id !== plate.id);
    if (!copy) throw new Error('no copy');
    expect(copy.loggedAtUtc).toBe(at(20, 0));
    expect(copy.entries.map((e) => e.id)).not.toContain(plate.entries[0]?.id);
    expect(copy.entries.map((e) => e.databaseFood)).toEqual(
      plate.entries.map((e) => e.databaseFood),
    );
    expect(copy.entries.map((e) => e.quantity)).toEqual(plate.entries.map((e) => e.quantity));
    expect(copy.entries[0]?.databaseFood.nutrientsPer100g).toEqual(SALMON);
    // The original is untouched.
    expect(plates.find((p) => p.id === plate.id)?.entries).toEqual(plate.entries);
    // The normal path ran: the coach wrote its note for the new plate.
    expect((await bundle.notes.forPlate(copy.id)).length).toBeGreaterThan(0);
  });

  it('can land on another day and meal, at that meal’s usual hour', async () => {
    const user = userEvent.setup();
    const { bundle, plate } = await openPlate();
    await user.click(screen.getByRole('button', { name: 'Log this again' }));
    const sheet = await screen.findByRole('dialog', { name: 'Log this again' });
    await user.click(within(sheet).getByRole('radio', { name: /^Monday/ }));
    await user.click(within(sheet).getByRole('radio', { name: 'Breakfast' }));
    await user.click(within(sheet).getByRole('button', { name: 'Log this plate' }));

    expect(await screen.findByText(/^Logged again: Breakfast, Monday/)).toBeVisible();
    const copy = (await allPlates(bundle)).find((p) => p.id !== plate.id);
    expect(copy?.loggedAtUtc).toBe(at(8, 0, -2));
    // The person is taken to the day it landed on.
    expect(await screen.findByRole('heading', { level: 1, name: 'Monday' })).toBeVisible();
  });
});

describe('Log this again, in French', () => {
  it('asks and confirms in French, with the narrow no-break space before the colon', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
    const plate = await seedMeasuredPlate(bundle, at(12, 55), [
      { name: 'Salmon', group: 'protein', grams: 150 },
    ]);
    window.location.hash = `#/plate/${plate.id}`;
    await renderUnlockedApp(bundle, { wrapper: French });
    await user.click(await screen.findByRole('button', { name: 'Noter à nouveau' }));
    const sheet = await screen.findByRole('dialog', { name: 'Noter à nouveau' });
    expect(within(sheet).getByRole('group', { name: 'Quel jour' })).toBeVisible();
    expect(within(sheet).getByRole('radio', { name: 'Aujourd’hui' })).toBeChecked();
    expect(within(sheet).getByRole('radio', { name: 'Dîner' })).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: 'Noter cette assiette' }));
    const note = await screen.findByText(/^Noté à nouveau/);
    expect(note.textContent).toBe('Noté à nouveau\u202F: Dîner.');
  });
});

describe('Save as a meal', () => {
  it('names a template of the plate and keeps it in the store, nutrients included', async () => {
    const user = userEvent.setup();
    const { bundle } = await openPlate();
    await user.click(screen.getByRole('button', { name: 'Save as a meal' }));
    const sheet = await screen.findByRole('dialog', { name: 'Save as a meal' });
    const name = within(sheet).getByLabelText('Name');
    expect(name).toHaveValue('Salmon, Rice');
    expect(await axe(sheet)).toHaveNoViolations();
    await user.clear(name);
    await user.click(within(sheet).getByRole('button', { name: 'Save meal' }));
    expect(await within(sheet).findByText('Give it a name first.')).toBeVisible();
    await user.type(name, 'Fish day');
    await user.click(within(sheet).getByRole('button', { name: 'Save meal' }));

    expect(await screen.findByText('Saved as “Fish day”.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const listed = await bundle.saved.listMeals();
    if (listed.kind !== 'saved') throw new Error('not listed');
    expect(listed.value.map((m) => m.name)).toEqual(['Fish day']);
    expect(listed.value[0]?.entries.map((e) => e.databaseFood.displayName)).toEqual([
      'Salmon',
      'Rice',
    ]);
    expect(listed.value[0]?.entries[0]?.databaseFood.nutrientsPer100g).toEqual(SALMON);
    expect(listed.value[0]?.entries[0]?.quantity.grams).toBe(150);
  });
});
