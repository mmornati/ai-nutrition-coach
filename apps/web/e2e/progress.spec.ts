// The first-run welcome, weigh-ins, the trend and the week navigation on the REAL encrypted store:
//  - complete the welcome and land on Today with a personal guide;
//  - skip it (one quiet line on Today, remembered);
//  - three weigh-ins on different days: the trend sentence and the table behind the chart;
//  - move to last week and back.
import { expect, test } from './persistent';
import { createStore, createStoreToWelcome, freshStart, unlockAfterReload } from './flows';

const isoDay = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('welcome: four steps, a personal guide, Today; never shown again after a lock', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await freshStart(page);
  await createStoreToWelcome(page);

  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await expect(page.getByText(/Log what you eat by photo, barcode, typing/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'What you are here for' }),
  ).toBeVisible();
  // The radios are visually hidden: a click on their label is the tap a person makes.
  const choose = async (group: string, label: string) => {
    await page
      .getByRole('group', { name: group, exact: true })
      .getByText(label, { exact: true })
      .click();
  };
  await choose('Goal', 'Stay as I am');
  await expect(
    page.getByRole('link', { name: /Beat, the UK eating disorder charity/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
  await choose('Age range', '30-49');
  await choose('Sex', 'Female');
  await choose('Activity', 'Some movement');
  await page.getByLabel('Height in cm').fill('165');
  await page.getByLabel('Weight in kg').fill('70');
  await page.getByLabel('Weight in kg').blur();
  // Henry (2005) weight and height, x 1.6: about 2200 kcal to keep the weight.
  await expect(
    page.getByText(/Your daily guide is about 2200\skcal and 5\d\sg of protein/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your first plate' })).toBeVisible();
  await expect(page.getByText(/No AI is connected/)).toBeVisible();
  await page.getByRole('button', { name: 'Log my first plate' }).click();
  await expect(page.getByRole('dialog', { name: 'Log a plate' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  // A personal guide now stands behind the day, and the quiet "add details" line does not show.
  await expect(page.getByText(/general reference/)).toHaveCount(0);
  await page.goto('/#/settings/profile');
  await expect(
    page.getByText(/Your daily guide is about 2200\skcal and 5\d\sg of protein/),
  ).toBeVisible();

  // Lock and unlock: Today, not the welcome.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlockAfterReload(page);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('welcome: "Not now" lands on Today with one quiet line that is remembered once dismissed', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await freshStart(page);
  await createStore(page);
  await expect(
    page.getByText(
      'Your day is shown against a general reference. Add a few details for a guide of your own.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText(/general reference/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlockAfterReload(page);
  await expect(page.getByText(/general reference/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('weigh-ins: three days give a trend sentence and a table; last week and back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await freshStart(page);
  await createStore(page);

  const saveWeighIn = async (offset: number, kg: string) => {
    const sheet = page.getByRole('dialog', { name: 'Weigh-in' });
    await sheet.getByLabel('Day').fill(isoDay(offset));
    await sheet.getByLabel('Weight in kg').fill(kg);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  };
  // Today's, one tap from Today on a quiet link (a decimal comma is accepted) ...
  await page.getByRole('button', { name: 'Add a weigh-in' }).click();
  await saveWeighIn(0, '81,2');
  // ... and two earlier days from Trends.
  await page.goto('/#/progress');
  for (const [offset, kg] of [
    [-13, '82,0'],
    [-6, '81.5'],
  ] as const) {
    await page.getByRole('button', { name: 'Add a weigh-in' }).click();
    await saveWeighIn(offset, kg);
  }

  // Still on Trends: no second goto to the same address (WebKit reloads on it, which locks the store).
  await expect(page.getByRole('heading', { level: 1, name: 'Trends' })).toBeVisible();
  await expect(
    page.getByText(/^Trend: 81\.5\skg, about 0\.5\skg lower than a week ago\.$/),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Weight and trend chart' })).toBeVisible();
  await page.getByText('Weigh-ins and trend as a table').click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);

  // Last week, and back: today is one tap away.
  await page.goto('/#/week');
  await expect(page.getByRole('heading', { level: 1, name: 'This week' })).toBeVisible();
  await page.getByRole('button', { name: 'Earlier week' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Earlier week' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to this week' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'This week' })).toBeVisible();

  // The data survives a lock.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Lock' }).click();
  await unlockAfterReload(page);
  await page.goto('/#/progress');
  await expect(page.getByText(/^Trend: 81\.5\skg/)).toBeVisible();
  expect(errors).toEqual([]);
});
