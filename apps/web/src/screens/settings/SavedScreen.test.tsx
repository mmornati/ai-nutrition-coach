// Settings, Saved meals: the meals and recipes the person keeps, renamed, deleted or added to.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { databaseFood, type FoodEntryDraft } from '@anc/core';
import type { ReactNode } from 'react';
import { setCurrentLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { SavedScreen } from './SavedScreen';

const French = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial="fr">{children}</LocaleProvider>
);

afterEach(() => {
  setCurrentLocale('en');
  cleanup();
  window.location.hash = '';
});

const item = (name: string, grams: number): FoodEntryDraft => ({
  databaseFood: databaseFood({
    sourceRef: `test:${name.toLowerCase()}`,
    displayName: name,
    source: 'manual',
    foodGroup: 'starch',
    nutrientsPer100g: { energyKcal: 130 },
  }),
  quantity: { low: grams, high: grams, unit: 'g', displayLabel: `${grams} g`, grams },
});

async function seed() {
  const bundle = await unlockedBundle();
  await bundle.saved.saveMeal({
    name: 'Usual breakfast',
    entries: [item('Oats', 60), item('Milk', 200)],
  });
  await bundle.saved.saveMeal({ name: 'Lunch box', entries: [item('Rice', 180)] });
  await bundle.saved.saveRecipe({
    name: 'Rice bake',
    servings: 4,
    cookedWeightGrams: 800,
    ingredients: [item('Rice', 300), item('Peas', 100)],
  });
  return bundle;
}

async function setup() {
  const bundle = await seed();
  const view = await renderInSession(<SavedScreen />, { bundle });
  await screen.findByText('Usual breakfast');
  return { bundle, ...view };
}

describe('SavedScreen', () => {
  it('lists the meals and recipes with what is in them, and has no axe violations', async () => {
    const { container } = await renderInSession(<SavedScreen />, { bundle: await seed() });
    await screen.findByText('Usual breakfast');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Saved meals and recipes' }),
    ).toBeVisible();
    expect(screen.getByText('2 foods · Oats, Milk')).toBeVisible();
    expect(screen.getByText('1 food · Rice')).toBeVisible();
    expect(screen.getByText('4 servings · 2 foods')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says so when nothing is saved, with a way to write a recipe', async () => {
    await renderInSession(<SavedScreen />, { bundle: await unlockedBundle() });
    expect(await screen.findByText(/^Nothing saved yet/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'New recipe' })).toBeVisible();
  });

  it('renames a meal, and refuses an empty name', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(screen.getByRole('button', { name: 'Rename Lunch box' }));
    const field = screen.getByLabelText('New name');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Give it a name first.')).toBeVisible();
    await user.type(field, 'Packed lunch');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Packed lunch')).toBeVisible();
    expect(screen.getByText('Renamed.')).toBeVisible();
    const listed = await bundle.saved.listMeals();
    expect(listed.kind === 'saved' && listed.value.map((m) => m.name)).toEqual([
      'Packed lunch',
      'Usual breakfast',
    ]);
  });

  it('cancelling a rename changes nothing', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(screen.getByRole('button', { name: 'Rename Lunch box' }));
    await user.type(screen.getByLabelText('New name'), ' x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Lunch box')).toBeVisible();
    const listed = await bundle.saved.listMeals();
    expect(listed.kind === 'saved' && listed.value.map((m) => m.name)).toContain('Lunch box');
  });

  it('deletes a meal after a calm confirm; "Keep it" deletes nothing', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete Lunch box' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Lunch box”?' });
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveFocus();
    expect(
      within(dialog).getByText('Plates you already logged from it stay as they are.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.getByText('Lunch box')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Delete Lunch box' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(screen.queryByText('Lunch box')).not.toBeInTheDocument());
    expect(screen.getByText('Deleted.')).toBeVisible();
    const listed = await bundle.saved.listMeals();
    expect(listed.kind === 'saved' && listed.value.map((m) => m.name)).toEqual(['Usual breakfast']);
  });

  it('deletes a recipe', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete Rice bake' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(screen.queryByText('Rice bake')).not.toBeInTheDocument());
    const listed = await bundle.saved.listRecipes();
    expect(listed.kind === 'saved' && listed.value).toEqual([]);
  });

  it('writes a new recipe from here and lists it', async () => {
    const user = userEvent.setup();
    const { bundle } = await setup();
    await user.click(screen.getByRole('button', { name: 'New recipe' }));
    const editor = await screen.findByRole('dialog', { name: 'New recipe' });
    await user.type(within(editor).getByLabelText('Search an ingredient'), 'rice');
    await user.click(
      (await within(editor).findAllByRole('button', { name: /^Rice/ }))[0] as HTMLElement,
    );
    await user.type(within(editor).getByLabelText('Grams'), '150');
    await user.click(within(editor).getByRole('button', { name: 'Add to recipe' }));
    await user.type(within(editor).getByLabelText('Recipe name'), 'Plain rice');
    await user.click(within(editor).getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByText('Plain rice')).toBeVisible();
    expect(screen.getByText('Recipe saved: “Plain rice”.')).toBeVisible();
    const listed = await bundle.saved.listRecipes();
    expect(listed.kind === 'saved' && listed.value.map((r) => r.name)).toContain('Plain rice');
  });

  it('speaks French, with the narrow no-break space before the colon', async () => {
    const bundle = await seed();
    await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
    await renderInSession(<SavedScreen />, { bundle, wrapper: French });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Repas et recettes gardés' }),
    ).toBeVisible();
    expect(screen.getByText('2 aliments · Oats, Milk')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nouvelle recette' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Renommer Lunch box' })).toBeVisible();
  });

  describe('focus', () => {
    it('opening a rename puts focus in the field; saving or cancelling returns it to that row’s Rename button', async () => {
      const user = userEvent.setup();
      await setup();
      await user.click(screen.getByRole('button', { name: 'Rename Lunch box' }));
      expect(screen.getByLabelText('New name')).toHaveFocus();
      await user.keyboard(' 2');
      await user.click(screen.getByRole('button', { name: 'Save name' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Rename Lunch box 2' })).toHaveFocus(),
      );

      await user.click(screen.getByRole('button', { name: 'Rename Lunch box 2' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Rename Lunch box 2' })).toHaveFocus();
    });

    const confirmDelete = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
      await user.click(screen.getByRole('button', { name: `Delete ${name}` }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      );
    };

    it('after a delete focus moves to the next row, else the section heading, else New recipe', async () => {
      const user = userEvent.setup();
      await setup();
      // Meals are listed newest first: Lunch box, then Usual breakfast.
      await confirmDelete(user, 'Lunch box');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Rename Usual breakfast' })).toHaveFocus(),
      );
      // The last meal: the section heading takes focus.
      await confirmDelete(user, 'Usual breakfast');
      await waitFor(() => expect(screen.queryByText('Usual breakfast')).not.toBeInTheDocument());
      // No meals left: the Meals section is gone, so the recipes heading is not it either; the
      // recipe row's own delete is the next stop only while it exists.
      await confirmDelete(user, 'Rice bake');
      await waitFor(() => expect(screen.getByRole('button', { name: 'New recipe' })).toHaveFocus());
    });

    it('deleting the last meal of several moves focus to the Meals heading', async () => {
      const user = userEvent.setup();
      await setup();
      await confirmDelete(user, 'Usual breakfast'); // the second and last row
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Meals' })).toHaveFocus(),
      );
    });
  });
});
