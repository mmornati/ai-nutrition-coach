// The body profile on the REAL encrypted store (docs/adr/0008): fill the profile (height, weight,
// goal to lose, standard pace), see the personal daily guide on the Profile screen and against a
// day's nutrition on Today, then lock and unlock and find it all again (the profile and the dated
// weigh-in are stored encrypted, not in the page).
import { expect, test } from './persistent';
import { createStore, freshStart, unlockAfterReload } from './flows';

test('profile: height, weight, goal lose at the standard pace -> a personal guide on Profile and Today -> survives lock and unlock', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await freshStart(page);
  await createStore(page);

  await page.goto('/#/settings/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  // The radios are visually hidden: a click on their label is the tap a person makes.
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
  // Henry (2005) weight and height, x 1.6: 2200 kcal to keep the weight, 500 below it: 1700 kcal.
  await expect(
    page.getByText('Your daily guide is about 1700 kcal and 84 g of protein.'),
  ).toBeVisible();
  await expect(page.getByText(/Last: 70 kg on /)).toBeVisible();

  // Today: a food with known energy is drawn against the personal guide.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  await page
    .getByRole('dialog', { name: 'Log a plate' })
    .getByRole('button', { name: /Type it/ })
    .click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill('Qzx stew');
  await typeIt.getByLabel('Custom food name').fill('Qzx stew');
  await typeIt.getByText('Weight and nutrition (optional)').click();
  await typeIt.getByLabel('Weight eaten (g)').fill('850');
  await typeIt.getByLabel('Energy (kcal)').fill('100');
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const bars = page.getByRole('list', { name: /Nutrient amounts/ });
  await expect(bars.getByText('about 50% of your daily guide (1700 kcal)')).toBeVisible();

  // Lock, unlock: the guide is rebuilt from the encrypted store.
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlockAfterReload(page);
  await expect(
    page
      .getByRole('list', { name: /Nutrient amounts/ })
      .getByText('about 50% of your daily guide (1700 kcal)'),
  ).toBeVisible();
  await page.goto('/#/settings/profile');
  await expect(
    page.getByText('Your daily guide is about 1700 kcal and 84 g of protein.'),
  ).toBeVisible();
  await expect(page.getByLabel('Height in cm')).toHaveValue('165');
  // The weigh-in field starts empty; the last weight is text beside it.
  await expect(page.getByLabel('Weight in kg')).toHaveValue('');
  await expect(page.getByText(/Last: 70 kg on /)).toBeVisible();
  expect(errors).toEqual([]);
});
