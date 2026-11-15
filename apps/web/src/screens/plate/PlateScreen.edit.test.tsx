// Editing a logged plate: amounts, removing, adding a food, completing a food without data, and
// moving the plate to another meal or day. An edit swaps the plate for the edited one.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  at,
  renderInSession,
  renderUnlockedApp,
  seedMeasuredPlate,
  unlockedBundle,
} from '../../app/testing';
import { DaySlotFields } from './DaySlotFields';
import { EditPlateSheet } from './EditPlateSheet';

const YOGURT = { energyKcal: 60, protein: 4 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

async function open(
  foods: Parameters<typeof seedMeasuredPlate>[2],
  when = at(12, 55),
  heading = 'Lunch',
) {
  const bundle = await unlockedBundle();
  const plate = await seedMeasuredPlate(bundle, when, foods);
  window.location.hash = `#/plate/${plate.id}`;
  await renderUnlockedApp(bundle);
  await screen.findByRole('heading', { level: 1, name: heading });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  return { bundle, plate, user };
}

const plates = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) => {
  const read = await bundle.store.readRange();
  return read.kind === 'platesRead' ? read.plates : [];
};

describe('Edit a plate', () => {
  it('changes a weight, recomputes the totals and gives the plate a fresh coach note', async () => {
    const { bundle, plate, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Change the amount of Yogurt' }));
    await user.type(within(sheet).getByLabelText('Grams'), '250');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const [edited, ...rest] = await plates(bundle);
    expect(rest).toHaveLength(0);
    expect(edited?.entries[0]?.quantity.grams).toBe(250);
    // The old plate is gone with its notes; the edited one has its own id and its own note.
    expect(edited?.id).not.toBe(plate.id);
    expect(await bundle.notes.forPlate(plate.id)).toEqual([]);
    expect(await screen.findByText('Plate updated.')).toBeVisible();
    // 250 g of 60 kcal / 100 g.
    expect((await screen.findAllByText('150 kcal'))[0]).toBeVisible();
  });

  it('removes a food, and refuses to save an empty plate', async () => {
    const { bundle, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
      { name: 'Bread', group: 'starch', grams: 40, per100g: { energyKcal: 250 } },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Remove Bread' }));
    await user.click(within(sheet).getByRole('button', { name: 'Remove Yogurt' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    expect(await within(sheet).findByText(/A plate needs at least one food/)).toBeVisible();
    expect(await plates(bundle)).toHaveLength(1);
  });

  it('adds a food from the search and saves it on the same plate', async () => {
    const { bundle, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Add a food' }));
    await user.type(within(sheet).getByLabelText('Food search'), 'apple');
    await user.click(await within(sheet).findByRole('button', { name: /^Apple/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Add to plate' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [edited] = await plates(bundle);
    expect(edited?.entries.map((e) => e.databaseFood.displayName)).toEqual(['Yogurt', 'Apple']);
  });

  it('moves the plate to another meal and day', async () => {
    const { bundle, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('radio', { name: 'Dinner' }));
    await user.click(within(sheet).getAllByRole('radio', { name: /\d/ })[0] as HTMLElement);
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [edited] = await plates(bundle);
    const when = new Date(edited?.loggedAtUtc ?? 0);
    expect(when.getHours()).toBe(19);
    expect(when.getDate()).toBe(13);
  });

  it('keeps the exact time when neither the day nor the meal changes', async () => {
    const { bundle, plate, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await plates(bundle))[0]?.loggedAtUtc).toBe(plate.loggedAtUtc);
  });

  it('completes a food that has no weight or nutrition, so it counts', async () => {
    const { bundle, plate, user } = await open([{ name: 'Soup', group: 'other' }]);
    // The totals have nothing to say yet; the food is the one to complete.
    window.location.hash = `#/plate/${plate.id}/edit`;
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.type(within(sheet).getByLabelText('Weight eaten (g)'), '300');
    await user.type(within(sheet).getByLabelText('Energy (kcal)'), '50');
    // No "apply" step: valid values reach the draft as they are typed.
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [edited] = await plates(bundle);
    expect(edited?.entries[0]?.quantity.grams).toBe(300);
    expect(edited?.entries[0]?.databaseFood.nutrientsPer100g?.energyKcal).toBe(50);
    expect((await screen.findAllByText('150 kcal'))[0]).toBeVisible();
  });

  it('has no axe violation, and Esc closes the sheet', async () => {
    const { user } = await open([{ name: 'Soup', group: 'other' }]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    expect(await axe(sheet)).toHaveNoViolations();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Edit a plate: never in the future', () => {
  it('a dinner from yesterday moved to today at 09:00 cannot stay a dinner: it lands at a meal that has started, not later than now', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0));
    const { bundle, user } = await open(
      [{ name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT }],
      at(19, 0, -1),
      'Dinner',
    );
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    // On its own day the plate's meal is offered (leaving it alone keeps its real time).
    expect(within(sheet).getByRole('radio', { name: 'Dinner' })).toBeChecked();
    await user.click(within(sheet).getByRole('radio', { name: 'Today' }));
    // On today, at 09:00, only the meals that have started: no Dinner, no Lunch.
    expect(within(sheet).queryByRole('radio', { name: 'Dinner' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('radio', { name: 'Lunch' })).not.toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: 'Breakfast' })).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [edited] = await plates(bundle);
    expect(edited?.loggedAtUtc).toBeLessThanOrEqual(Date.now());
    expect(new Date(edited?.loggedAtUtc ?? 0).getDate()).toBe(14);
  });

  it("moving back to the plate's own day offers its own meal again", async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0));
    const { user } = await open(
      [{ name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT }],
      at(19, 0, -1),
      'Dinner',
    );
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('radio', { name: 'Today' }));
    expect(within(sheet).queryByRole('radio', { name: 'Dinner' })).not.toBeInTheDocument();
    await user.click(within(sheet).getAllByRole('radio', { name: /\d/ })[0] as HTMLElement);
    expect(within(sheet).getByRole('radio', { name: 'Dinner' })).toBeInTheDocument();
  });
});

describe('Edit a plate: values typed, invalid text and no-change saves', () => {
  it('nutrition typed after "Complete" counts without any apply step, and invalid text holds Save back with its reason', async () => {
    const { bundle, plate, user } = await open([{ name: 'Soup', group: 'other' }]);
    window.location.hash = `#/plate/${plate.id}/edit`;
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    const save = within(sheet).getByRole('button', { name: 'Save changes' });
    await user.type(within(sheet).getByLabelText('Weight eaten (g)'), '300');
    await user.type(within(sheet).getByLabelText('Energy (kcal)'), 'abc');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    const reason = within(sheet).getByText(/is not a valid number yet/);
    expect(reason).toBeVisible();
    expect(reason).toHaveAttribute('role', 'status');
    expect(save).toHaveAccessibleDescription(/is not a valid number yet/);
    await user.click(save);
    expect(await plates(bundle)).toHaveLength(1);
    expect((await plates(bundle))[0]?.id).toBe(plate.id);
    // Fixing the text frees Save, and what was typed is what is stored.
    await user.clear(within(sheet).getByLabelText('Energy (kcal)'));
    await user.type(within(sheet).getByLabelText('Energy (kcal)'), '50');
    expect(save).not.toHaveAttribute('aria-disabled');
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [edited] = await plates(bundle);
    expect(edited?.entries[0]?.databaseFood.nutrientsPer100g?.energyKcal).toBe(50);
    expect(edited?.entries[0]?.quantity.grams).toBe(300);
  });

  it('a row that is invalid keeps Save off when ANOTHER row is removed (state is by row, not by position)', async () => {
    const { user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
      { name: 'Bread', group: 'starch', grams: 40, per100g: { energyKcal: 250 } },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Change the amount of Yogurt' }));
    await user.type(within(sheet).getByLabelText('Grams'), 'lots');
    const save = within(sheet).getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(sheet).getByRole('button', { name: 'Remove Bread' }));
    expect(save).toHaveAttribute('aria-disabled', 'true');
    // Removing the invalid row itself frees Save.
    await user.click(within(sheet).getByRole('button', { name: 'Remove Yogurt' }));
    expect(save).not.toHaveAttribute('aria-disabled');
  });

  it('saving with nothing changed writes nothing: same plate, notes and interactions stay', async () => {
    const { bundle, plate, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    const before = await bundle.notes.forPlate(plate.id);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    // Change an amount and change it back: still the same plate.
    await user.click(within(sheet).getByRole('button', { name: 'Change the amount of Yogurt' }));
    await user.type(within(sheet).getByLabelText('Grams'), '250');
    await user.clear(within(sheet).getByLabelText('Grams'));
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [same, ...rest] = await plates(bundle);
    expect(rest).toHaveLength(0);
    expect(same?.id).toBe(plate.id);
    expect((await bundle.notes.forPlate(plate.id)).map((n) => n.id)).toEqual(
      before.map((n) => n.id),
    );
    // No "Plate updated." either: nothing was updated.
    expect(screen.queryByText('Plate updated.')).not.toBeInTheDocument();
  });

  it('a plate removed meanwhile is not brought back by the edit', async () => {
    const { bundle, plate, user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    await screen.findByRole('dialog', { name: 'Edit plate' });
    await bundle.store.deletePlate(plate.id);
    // The plate is gone from the day: the screen goes back to it, and nothing is resurrected.
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await plates(bundle)).toHaveLength(0);
  });
});

describe('Edit a plate: focus', () => {
  it('after Save focus goes back to the opener, not to the page', async () => {
    const { user } = await open([{ name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT }]);
    const opener = screen.getByRole('button', { name: 'Edit this plate' });
    await user.click(opener);
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Change the amount of Yogurt' }));
    await user.type(within(sheet).getByLabelText('Grams'), '250');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit this plate' })).toHaveFocus(),
    );
    expect(document.body).not.toHaveFocus();
  });

  it('after removing a row focus lands on the next row, then the previous one, then "Add a food"', async () => {
    const { user } = await open([
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
      { name: 'Bread', group: 'starch', grams: 40, per100g: { energyKcal: 250 } },
      { name: 'Apple', group: 'vegFruit', grams: 150, per100g: { energyKcal: 52 } },
    ]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Remove Bread' }));
    expect(within(sheet).getByRole('button', { name: 'Change the amount of Apple' })).toHaveFocus();
    await user.click(within(sheet).getByRole('button', { name: 'Remove Apple' }));
    expect(
      within(sheet).getByRole('button', { name: 'Change the amount of Yogurt' }),
    ).toHaveFocus();
    await user.click(within(sheet).getByRole('button', { name: 'Remove Yogurt' }));
    expect(within(sheet).getByRole('button', { name: 'Add a food' })).toHaveFocus();
  });

  it('after "Add to plate" focus lands on the new row', async () => {
    const { user } = await open([{ name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT }]);
    await user.click(screen.getByRole('button', { name: 'Edit this plate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    await user.click(within(sheet).getByRole('button', { name: 'Add a food' }));
    await user.type(within(sheet).getByLabelText('Food search'), 'apple');
    await user.click(await within(sheet).findByRole('button', { name: /^Apple/ }));
    // The chosen food is announced in the live region.
    expect(await within(sheet).findByText(/^Selected: Apple/)).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: 'Add to plate' }));
    expect(within(sheet).getByRole('button', { name: 'Change the amount of Apple' })).toHaveFocus();
  });
});

describe('the edit components, rendered by name', () => {
  it('EditPlateSheet has no axe violation', async () => {
    const bundle = await unlockedBundle();
    const plate = await seedMeasuredPlate(bundle, at(12, 55), [
      { name: 'Soup', group: 'other' },
      { name: 'Yogurt', group: 'dairy', grams: 100, per100g: YOGURT },
    ]);
    await renderInSession(
      <EditPlateSheet
        open
        plate={plate}
        onClose={() => undefined}
        onSave={() => Promise.resolve(true)}
      />,
      { bundle },
    );
    const sheet = await screen.findByRole('dialog', { name: 'Edit plate' });
    expect(await axe(sheet)).toHaveNoViolations();
  });

  it('DaySlotFields has no axe violation', async () => {
    const bundle = await unlockedBundle();
    const { container } = await renderInSession(
      <DaySlotFields
        choice={{
          day: at(0),
          setDay: () => undefined,
          slot: 'lunch',
          setSlot: () => undefined,
          slots: ['breakfast', 'lunch', 'dinner'],
        }}
      />,
      { bundle },
    );
    expect(await screen.findByRole('radio', { name: 'Lunch' })).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
  });
});
