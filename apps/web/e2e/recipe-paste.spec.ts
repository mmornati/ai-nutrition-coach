// Paste a recipe with no AI, on the real encrypted store in a real browser under the production CSP:
// a small French recipe is read ON THIS DEVICE (nothing is sent anywhere), the recipe editor opens
// prefilled (name, servings, ingredients with grams, the converted weight marked as an estimate, the
// unknown line listed), nothing is saved until the person saves, and the saved recipe is then found
// in the food search. The clock is pinned to lunch time so the screen does not depend on the run time.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './persistent';
import { createStore, freshStart } from './flows';

const FRENCH_RECIPE = [
  'Riz au lait',
  'Pour 4 personnes',
  'Ingrédients',
  '200 g de riz',
  '1 l de lait',
  '1 pincée de xyzzy',
  'Préparation',
  'Faites cuire le riz dans le lait.',
].join('\n');

test('paste a French recipe with no AI, review the prefilled editor, save it and find it in search', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  const errors = await freshStart(page);
  await createStore(page);

  // Nothing of a pasted recipe may leave the page: no AI, no fetch of a page, no third party.
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || /\/ai\/v1\/|chat\/completions/.test(r.url())) {
      sent.push(`${r.method()} ${r.url()}`);
    }
  });

  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const capture = page.getByRole('dialog', { name: 'Log a plate' });
  await capture.getByRole('button', { name: 'Saved meals and recipes' }).click();
  const saved = page.getByRole('dialog', { name: 'Saved meals and recipes' });
  await saved.getByRole('button', { name: 'New recipe' }).click();
  const editor = page.getByRole('dialog', { name: 'New recipe' });
  await editor.getByRole('button', { name: 'Paste a recipe' }).click();

  await expect(
    editor.getByText(/No AI is set up, so the recipe is read on this device/),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);

  await editor.getByLabel('Recipe text').fill(FRENCH_RECIPE);
  await editor.getByRole('button', { name: 'Read this recipe' }).click();

  // Prefilled for review: name, servings, two weighed ingredients (the litre is an estimate).
  await expect(editor.getByLabel('Recipe name')).toHaveValue('Riz au lait');
  await expect(editor.getByLabel('Servings')).toHaveValue('4');
  await expect(editor.getByRole('listitem').filter({ hasText: /Rice.*200 g/ })).toBeVisible();
  await expect(editor.getByRole('listitem').filter({ hasText: /milk.*≈1000 g/i })).toBeVisible();
  await expect(editor.getByText(/Weights marked ≈ are estimates/)).toBeVisible();
  // The line nothing matched stays listed for a manual pick.
  await expect(editor.getByRole('heading', { name: 'Not matched yet' })).toBeVisible();
  await expect(editor.getByText('1 pincée de xyzzy')).toBeVisible();
  const reviewAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(reviewAxe.violations).toEqual([]);

  // Saving is the person's own act.
  await editor.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('dialog', { name: 'New recipe' })).toHaveCount(0);
  const list = page.getByRole('dialog', { name: 'Saved meals and recipes' });
  await expect(list.getByRole('button', { name: /Riz au lait/ })).toBeVisible();

  // The recipe is found by its name in the food search.
  await list.getByRole('button', { name: /Riz au lait/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await expect(typeIt.getByRole('button', { name: /^Riz au lait/ })).toBeVisible();

  expect(sent).toEqual([]);
  expect(errors).toEqual([]);
});
