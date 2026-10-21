// Ask the coach with no AI configured (the e2e server offers none): the screen explains how to turn
// it on and the link leads to Your AI. No network request is made for it.
import { expect, test } from './persistent';
import { createStore, freshStart } from './flows';

test('Ask the coach without an AI explains how to enable it, with a way to Your AI', async ({
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
  await expect(page.getByRole('heading', { level: 1, name: 'Ask the coach' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The AI coach is off' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open Your AI' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your AI' })).toBeVisible();
  const toggle = page.getByRole('switch', {
    name: 'Let the AI write coach notes and answer questions',
  });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();

  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
