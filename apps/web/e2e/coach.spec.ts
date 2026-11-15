// The coach page with no AI configured (the e2e server offers none): a real page (step, latest
// notes, the week, the daily guide) with one calm line about the AI and a link to Your AI. No
// network request is made for it, and there is no conversation box.
import { expect, test } from './persistent';
import { createStore, freshStart } from './flows';

test('the coach page without an AI is a real page, with one line and a way to Your AI', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = await freshStart(page);
  await createStore(page);

  const requests: string[] = [];
  page.on('request', (r) => {
    if (/chat\/completions/.test(r.url())) requests.push(r.url());
  });

  await page.getByRole('link', { name: 'Ask the coach' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'The coach' })).toBeVisible();
  for (const name of ['Your step', 'Latest notes', 'The week, in short', 'Your daily guide']) {
    // The week review is empty before anything is logged.
    if (name === 'The week, in short') continue;
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Open Profile' })).toBeVisible();
  await expect(
    page.getByText('No AI is set up, so the coach writes its built-in notes.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('link', { name: 'Choose one in Your AI' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your AI' })).toBeVisible();
  const toggle = page.getByRole('switch', {
    name: 'Let the AI write coach notes and answer questions',
  });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();

  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
