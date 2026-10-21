// The capture flow's re-logging paths: recent and often foods in Type it, saved meals, and the
// recipe editor (opened from the capture sheet), as the person meets them.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { databaseFood, type FoodEntryDraft } from '@anc/core';
import { strings } from '../../i18n';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { TodayScreen } from '../today/TodayScreen';

const s = strings();

beforeEach(() => {
  // Wednesday 2026-10-14, 12:10.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

type Bundle = Awaited<ReturnType<typeof unlockedBundle>>;

const openCapture = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole('button', { name: s.shell.logAPlate })[0] as HTMLElement);
  return screen.findByRole('dialog', { name: s.capture.title });
};

const plates = async (bundle: Bundle) => {
  const read = await bundle.store.readRange();
  if (read.kind !== 'platesRead') throw new Error('read failed');
  return read.plates;
};

const SALMON = { energyKcal: 208, protein: 20, fat: 13 };

async function withHistory() {
  const bundle = await unlockedBundle();
  await seedMeasuredPlate(bundle, at(19, 0, -1), [
    { name: 'Salmon', group: 'protein', grams: 150, estimated: false, per100g: SALMON },
  ]);
  await seedMeasuredPlate(bundle, at(8, 0, -1), [{ name: 'Rice', group: 'starch', grams: 180 }]);
  await seedMeasuredPlate(bundle, at(19, 0, -2), [
    { name: 'Salmon', group: 'protein', grams: 120, per100g: SALMON },
  ]);
  await seedMeasuredPlate(bundle, at(8, 0, -2), [{ name: 'Apple', group: 'vegFruit', grams: 100 }]);
  await seedMeasuredPlate(bundle, at(19, 0, -3), [
    { name: 'Salmon', group: 'protein', grams: 130, per100g: SALMON },
  ]);
  // Older than the window: neither recent nor often.
  await seedMeasuredPlate(bundle, at(12, 0, -40), [
    { name: 'Fruitcake', group: 'other', grams: 90 },
  ]);
  await seedMeasuredPlate(bundle, at(12, 0, -41), [
    { name: 'Fruitcake', group: 'other', grams: 90 },
  ]);
  return bundle;
}

async function openTypeIt(bundle: Bundle) {
  const user = userEvent.setup();
  await renderInSession(<TodayScreen />, { bundle });
  await screen.findByText('Breakfast');
  const dialog = await openCapture(user);
  await user.click(within(dialog).getByRole('button', { name: /Type it/ }));
  const sheet = await screen.findByRole('dialog', { name: s.catalog.title });
  return { user, sheet };
}

describe('Type it: recent and often foods', () => {
  it('lists the last distinct foods and the most frequent ones before anything is typed', async () => {
    const { sheet } = await openTypeIt(await withHistory());
    const recent = await within(sheet).findByRole('region', { name: 'Recent' });
    const names = within(recent)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.block')?.textContent);
    expect(names).toEqual(['Salmon', 'Rice', 'Apple']);
    // Each row says the quantity it will be logged with.
    expect(within(recent).getByText('~1 fist · 150 g')).toBeVisible();

    const often = within(sheet).getByRole('region', { name: 'Often' });
    expect(within(often).getAllByRole('listitem')).toHaveLength(1);
    expect(within(often).getByText('3 times in 30 days')).toBeVisible();
    expect(within(sheet).queryByText('Fruitcake')).not.toBeInTheDocument();
  });

  it('one tap logs the food with the quantity it last had, nutrients included', async () => {
    const bundle = await withHistory();
    const { user, sheet } = await openTypeIt(bundle);
    const recent = await within(sheet).findByRole('region', { name: 'Recent' });
    await user.click(within(recent).getByRole('button', { name: /^Log Salmon,/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const added = (await plates(bundle)).find((p) => p.loggedAtUtc === at(12, 10));
    expect(added?.entries).toHaveLength(1);
    expect(added?.entries[0]?.databaseFood.displayName).toBe('Salmon');
    expect(added?.entries[0]?.quantity.grams).toBe(150);
    expect(added?.entries[0]?.databaseFood.nutrientsPer100g).toEqual(SALMON);
    expect(await screen.findByRole('button', { name: s.today.logAnother })).toBeVisible();
  });

  it('"Change" opens the food in the picker with its last amount, and logs the edited one', async () => {
    const bundle = await withHistory();
    const { user, sheet } = await openTypeIt(bundle);
    await user.click(
      await within(sheet).findByRole('button', { name: 'Change the amount of Rice' }),
    );
    const grams = within(sheet).getByLabelText(s.nutrition.gramsLabel);
    expect(
      within(within(sheet).getByRole('group', { name: s.portion.label })).getByRole('button', {
        name: /180 g/,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.type(grams, '250');
    await user.click(within(sheet).getByRole('button', { name: s.common.log }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const added = (await plates(bundle)).find((p) => p.loggedAtUtc === at(12, 10));
    expect(added?.entries[0]?.databaseFood.displayName).toBe('Rice');
    expect(added?.entries[0]?.quantity.grams).toBe(250);
  });

  it('shows no lists without history, and none once something is typed', async () => {
    const empty = await openTypeIt(await unlockedBundle());
    expect(empty.sheet).toHaveTextContent(s.catalog.typeHint);
    expect(within(empty.sheet).queryByRole('region', { name: 'Recent' })).not.toBeInTheDocument();
  });

  it('hides the lists while the person types a search', async () => {
    const { user, sheet } = await openTypeIt(await withHistory());
    await within(sheet).findByRole('region', { name: 'Recent' });
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'apple');
    await within(sheet).findByRole('button', { name: /^Apple/ });
    expect(within(sheet).queryByRole('region', { name: 'Recent' })).not.toBeInTheDocument();
  });

  it('has no axe violations with the lists showing', async () => {
    const { sheet } = await openTypeIt(await withHistory());
    await within(sheet).findByRole('region', { name: 'Recent' });
    expect(await axe(sheet)).toHaveNoViolations();
  });
});

const meal = (name: string, grams: number, per100g?: typeof SALMON): FoodEntryDraft => ({
  databaseFood: databaseFood({
    sourceRef: `test:${name.toLowerCase()}`,
    displayName: name,
    source: 'manual',
    foodGroup: 'protein',
    ...(per100g ? { nutrientsPer100g: per100g } : {}),
  }),
  quantity: { low: grams, high: grams, unit: 'g', displayLabel: `${grams} g`, grams },
});

describe('Saved meals in the capture sheet', () => {
  async function openSaved(bundle: Bundle) {
    const user = userEvent.setup();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    const capture = await openCapture(user);
    await user.click(within(capture).getByRole('button', { name: 'Saved meals and recipes' }));
    const sheet = await screen.findByRole('dialog', { name: 'Saved meals and recipes' });
    return { user, sheet };
  }

  it('says so when nothing is saved yet', async () => {
    const { sheet } = await openSaved(await unlockedBundle());
    expect(await within(sheet).findByText(s.relog.savedEmpty)).toBeVisible();
    expect(await axe(sheet)).toHaveNoViolations();
  });

  it('logs a saved meal as a new plate, with the amounts changed first', async () => {
    const bundle = await unlockedBundle();
    await bundle.saved.saveMeal({
      name: 'Fish and rice',
      entries: [meal('Salmon', 150, SALMON), meal('Rice', 180)],
    });
    const { user, sheet } = await openSaved(bundle);
    await user.click(await within(sheet).findByRole('button', { name: /Fish and rice/ }));

    const editor = await screen.findByRole('dialog', { name: 'Log “Fish and rice”' });
    expect(within(editor).getByText('150 g')).toBeVisible();
    await user.click(within(editor).getByRole('button', { name: 'Change the amount of Rice' }));
    await user.type(within(editor).getByLabelText(s.nutrition.gramsLabel), '90');
    expect(await axe(editor)).toHaveNoViolations();
    await user.click(within(editor).getByRole('button', { name: 'Log this meal' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const added = (await plates(bundle)).find((p) => p.loggedAtUtc === at(12, 10));
    expect(added?.entries.map((e) => [e.databaseFood.displayName, e.quantity.grams])).toEqual([
      ['Salmon', 150],
      ['Rice', 90],
    ]);
    expect(added?.entries[0]?.databaseFood.nutrientsPer100g).toEqual(SALMON);
    // The saved meal itself is unchanged by the edit.
    const kept = await bundle.saved.listMeals();
    expect(kept.kind === 'saved' && kept.value[0]?.entries[1]?.quantity.grams).toBe(180);
  });

  it('keeps Log off while a Grams field holds something that is not a weight', async () => {
    const bundle = await unlockedBundle();
    await bundle.saved.saveMeal({ name: 'Rice', entries: [meal('Rice', 180)] });
    const { user, sheet } = await openSaved(bundle);
    await user.click(await within(sheet).findByRole('button', { name: /Rice/ }));
    const editor = await screen.findByRole('dialog', { name: 'Log “Rice”' });
    await user.click(within(editor).getByRole('button', { name: 'Change the amount of Rice' }));
    await user.type(within(editor).getByLabelText(s.nutrition.gramsLabel), 'lots');
    expect(within(editor).getByRole('button', { name: 'Log this meal' })).toBeDisabled();
  });
});

describe('The recipe editor', () => {
  async function openEditor(bundle: Bundle) {
    const user = userEvent.setup();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Breakfast');
    const capture = await openCapture(user);
    await user.click(within(capture).getByRole('button', { name: 'Saved meals and recipes' }));
    const saved = await screen.findByRole('dialog', { name: 'Saved meals and recipes' });
    await user.click(within(saved).getByRole('button', { name: 'New recipe' }));
    const editor = await screen.findByRole('dialog', { name: 'New recipe' });
    return { user, editor };
  }

  async function addIngredient(
    user: ReturnType<typeof userEvent.setup>,
    editor: HTMLElement,
    query: string,
    pick: RegExp,
    grams: string,
  ) {
    await user.type(within(editor).getByLabelText('Search an ingredient'), query);
    await user.click(await within(editor).findByRole('button', { name: pick }));
    await user.type(within(editor).getByLabelText(s.nutrition.gramsLabel), grams);
    await user.click(within(editor).getByRole('button', { name: 'Add to recipe' }));
  }

  it('builds a recipe from ingredients with grams, shows the per-serving values, and saves it', async () => {
    const bundle = await unlockedBundle();
    const { user, editor } = await openEditor(bundle);
    expect(within(editor).getByText('No ingredients yet.')).toBeVisible();
    expect(await axe(editor)).toHaveNoViolations();

    await addIngredient(user, editor, 'rice', /^Rice/, '200');
    await addIngredient(user, editor, 'salm', /^Salmon/, '300');
    expect(within(editor).getAllByRole('listitem')).toHaveLength(2);

    await user.type(within(editor).getByLabelText('Recipe name'), 'Salmon and rice');
    await user.clear(within(editor).getByLabelText('Servings'));
    await user.type(within(editor).getByLabelText('Servings'), '2');
    await user.type(within(editor).getByLabelText('Cooked weight, in grams (optional)'), '400');
    // 500 g of ingredients cooked down to 400 g, two servings: 200 g each.
    expect(within(editor).getByText('One serving is about 200 g.')).toBeVisible();
    expect(within(editor).getByText(/^Per serving: ≈ \d+ kcal/)).toBeVisible();
    expect(await axe(editor)).toHaveNoViolations();

    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New recipe' })).not.toBeInTheDocument(),
    );
    const listed = await bundle.saved.listRecipes();
    if (listed.kind !== 'saved') throw new Error('not listed');
    expect(listed.value).toHaveLength(1);
    const recipe = listed.value[0];
    expect(recipe).toMatchObject({ name: 'Salmon and rice', servings: 2, cookedWeightGrams: 400 });
    expect(recipe?.ingredients.map((i) => [i.databaseFood.displayName, i.quantity.grams])).toEqual([
      ['Rice', 200],
      ['Salmon', 300],
    ]);
  });

  it('refuses, calmly, a recipe with no name or no ingredient, and saves nothing', async () => {
    const bundle = await unlockedBundle();
    const { user, editor } = await openEditor(bundle);
    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));
    expect(await within(editor).findByText('Give the recipe a name.')).toBeVisible();
    await user.type(within(editor).getByLabelText('Recipe name'), 'Empty');
    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));
    expect(await within(editor).findByText('Add at least one ingredient.')).toBeVisible();
    await user.clear(within(editor).getByLabelText('Servings'));
    await user.type(within(editor).getByLabelText('Servings'), 'two');
    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));
    expect(
      await within(editor).findByText('Servings is a whole number from 1 to 100.'),
    ).toBeVisible();
    const listed = await bundle.saved.listRecipes();
    expect(listed.kind === 'saved' && listed.value).toEqual([]);
  });

  it('a food no catalog knows (so it has no weight) cannot be added as an ingredient', async () => {
    const bundle = await unlockedBundle();
    const { user, editor } = await openEditor(bundle);
    await addIngredient(user, editor, 'rice', /^Rice/, '200');
    // Not in any catalog: the custom-food path has no grams and no nutrients.
    await user.type(within(editor).getByLabelText('Search an ingredient'), 'zzqx mystery');
    expect(within(editor).queryByRole('button', { name: 'Add to recipe' })).not.toBeInTheDocument();
  });

  it('a saved recipe is found by its name in the food search, with its serving as a preset', async () => {
    const bundle = await unlockedBundle();
    const { user, editor } = await openEditor(bundle);
    await addIngredient(user, editor, 'rice', /^Rice/, '200');
    await user.type(within(editor).getByLabelText('Recipe name'), 'Zesty bake');
    await user.clear(within(editor).getByLabelText('Servings'));
    await user.type(within(editor).getByLabelText('Servings'), '2');
    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));
    // Back on the saved list, the recipe is there; its row opens the food search on its name.
    const saved = await screen.findByRole('dialog', { name: 'Saved meals and recipes' });
    await user.click(await within(saved).findByRole('button', { name: /Zesty bake/ }));
    const typeIt = await screen.findByRole('dialog', { name: s.catalog.title });
    await user.click(await within(typeIt).findByRole('button', { name: /^Zesty bake/ }));
    // One serving of a 200 g recipe for two: 100 g, an estimate (no cooked weight).
    expect(within(typeIt).getByText('≈100 g')).toBeVisible();
    await user.click(within(typeIt).getByRole('button', { name: s.common.log }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const added = (await plates(bundle)).find((p) => p.loggedAtUtc === at(12, 10));
    expect(added?.entries[0]?.databaseFood).toMatchObject({
      source: 'recipe',
      displayName: 'Zesty bake',
    });
    expect(added?.entries[0]?.quantity.grams).toBe(100);
    expect(added?.entries[0]?.databaseFood.nutrientsPer100g?.energyKcal).toBeGreaterThan(0);
  });
});
