// The goal- and energy-aware coach on the REAL encrypted store (lot 6): with a personal guide and
// the goal to lose weight, a dinner well above the guide gets one calm note that names the food
// that carried the energy and asks; "Try it this week" keeps one small step, shown quietly on
// Today and on the coach page, and it survives a lock and an unlock. The clock is pinned to the
// evening: the day's energy is only judged at dinner. No AI is configured, so all of it is the
// built-in coach.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './persistent';
import { createStore, freshStart, unlockAfterReload } from './flows';

test('a dinner well above a personal guide: one calm energy note, a step kept, the coach page', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const dinner = new Date();
  dinner.setHours(19, 30, 0, 0);
  await page.clock.setFixedTime(dinner);
  const errors = await freshStart(page);
  await createStore(page);

  // A guide of the person's own: 1700 kcal (the same figures as profile.spec.ts).
  await page.goto('/#/settings/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  const choose = async (group: string, label: string) => {
    await page
      .getByRole('group', { name: group, exact: true })
      .getByText(label, { exact: true })
      .click();
  };
  await choose('Age range', '30-49');
  await choose('Sex', 'Female');
  await choose('Activity', 'Some movement');
  await page.getByLabel('Height in cm').fill('165');
  await page.getByRole('button', { name: 'Save height' }).click();
  await page.getByLabel('Weight in kg').fill('70');
  await page.getByRole('button', { name: 'Save weight' }).click();
  await choose('Goal', 'Lose weight');
  await choose('Pace', 'Standard');
  await expect(
    page.getByText('Your daily guide is about 1700 kcal and 84 g of protein.'),
  ).toBeVisible();

  // Dinner: a dish of about 2,100 kcal, weighed, against a guide of 1,700.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  await page
    .getByRole('dialog', { name: 'Log a plate' })
    .getByRole('button', { name: /Type it/ })
    .click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill('Qzx pizza');
  await typeIt.getByLabel('Custom food name').fill('Qzx pizza');
  await typeIt.getByText('Weight and nutrition (optional)').click();
  await typeIt.getByLabel('Weight eaten (g)').fill('850');
  await typeIt.getByLabel('Energy (kcal)').fill('250');
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // One calm note: information naming the food, and a question. No scolding, no verdict.
  const card = page.getByRole('group', { name: 'Coach question' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(
    /Much of today’s energy came from qzx pizza, about 2\d{3} kcal\./,
  );
  await expect(card).toContainText('Would a smaller portion, or a swap, suit you next time?');
  await expect(card).not.toContainText(/over|exceed|remaining|limit|budget|!/i);

  // Accept the one small step: it replaces the card with a quiet line.
  await card.getByRole('button', { name: 'Try it this week' }).click();
  await expect(page.getByText('This week: a smaller portion of qzx pizza')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Coach question' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Done with this' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drop it' })).toBeVisible();

  // The step is kept encrypted with the rest: it is still there after a lock and an unlock.
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlockAfterReload(page);
  await expect(page.getByText('This week: a smaller portion of qzx pizza')).toBeVisible();

  // The coach page without any AI: the step, the latest note, the guide, one line about the AI.
  await page.goto('/#/coach');
  await expect(page.getByRole('heading', { level: 1, name: 'The coach' })).toBeVisible();
  await expect(page.getByText('This week: a smaller portion of qzx pizza')).toBeVisible();
  // Accepting the step answered that one question, so it is no longer listed among the latest
  // notes (a note the person dismissed under the plate stays dismissed on the coach page).
  await expect(
    page
      .getByRole('region', { name: 'Latest notes' })
      .getByText(/Much of today’s energy came from qzx pizza/),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Latest notes' }).getByText('No notes in the last days.'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Your daily guide' })
      .getByText(/About 1700 kcal and 84 g of protein a day/),
  ).toBeVisible();
  await expect(
    page.getByText('No AI is set up, so the coach writes its built-in notes.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  // Drop it: gone, with nothing left behind.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Drop it' }).click();
  await expect(page.getByText(/This week:/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
