// "Ask the coach about this week": an optional AI paragraph under the rule-based review, only on
// a tap, never instead of the review; with no AI (or no yes) it says how to turn it on.
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { chatReply, FakeFetch } from '../../ai/testing';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { configureByokCoaching } from '../../coaching/testing';
import { KV_KEYS } from '../../storage';
import { WeekScreen } from './WeekScreen';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const PARAGRAPH = 'Veg came up on every logged day. Which meal made it easiest?';

async function openWeek(
  options: {
    configure?: 'none' | 'noConsent' | 'ready';
    numbersOff?: boolean;
    reply?: string;
  } = {},
) {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(options.reply ?? PARAGRAPH);
  const bundle = await unlockedBundle();
  if (options.numbersOff) await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
  for (const offset of [-1, -2, -3]) {
    await seedMeasuredPlate(bundle, at(12, 0, offset), [
      {
        name: 'Salad',
        group: 'vegFruit',
        grams: 200,
        per100g: { energyKcal: 20, protein: 1, fibre: 3, salt: 0.2 },
      },
    ]);
  }
  if (options.configure === 'noConsent') await configureByokCoaching(bundle, { consent: false });
  if (options.configure === 'ready') await configureByokCoaching(bundle);
  const view = await renderInSession(<WeekScreen />, {
    bundle,
    session: { fetch: fake.fetch },
  });
  await screen.findByRole('heading', { level: 2, name: 'The week, in short' }, { timeout: 5000 });
  return { fake, ...view };
}

describe('WeekAiSummary', () => {
  it('with no AI it says how to turn it on, links to Your AI and sends nothing', async () => {
    const { fake } = await openWeek();
    expect(screen.getByText(/choose an AI and turn on AI coaching/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Your AI' })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(screen.queryByRole('button', { name: 'Ask the coach about this week' })).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });

  it('with an AI but no yes it asks for the yes first', async () => {
    const { fake } = await openWeek({ configure: 'noConsent' });
    expect(screen.getByText(/turn on AI coaching in Settings, Your AI/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Your AI' })).toBeVisible();
    expect(fake.requests).toHaveLength(0);
  });

  it('ready: nothing is sent until the tap, then a marked paragraph appears under the review', async () => {
    const user = userEvent.setup();
    const { fake, container } = await openWeek({ configure: 'ready' });
    expect(fake.requests).toHaveLength(0);
    expect(
      screen.getByText(/counts and daily averages of the week to api\.example\.com/i),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ask the coach about this week' }));
    await waitFor(() => expect(screen.getByText(PARAGRAPH)).toBeVisible());
    expect(screen.getByText('Written by AI')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'The coach, on this week' }),
    ).toBeVisible();
    // The rule-based review is still all there.
    expect(screen.getByText('3 days with meals logged')).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'What went well' })).toBeVisible();

    const user1 = JSON.parse(
      (JSON.parse(fake.last.body) as { messages: { content: string }[] }).messages[1]?.content ??
        '{}',
    ) as Record<string, unknown>;
    expect(user1).toMatchObject({ daysLogged: 3, numbers: true });
    expect(Object.keys(user1).sort()).toEqual([
      'dailyAverages',
      'dailyGuide',
      'daysLogged',
      'daysWithData',
      'daysWithGroup',
      'numbers',
      'ruleBasedReview',
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('numbers off: the averages and the guide are not sent', async () => {
    const user = userEvent.setup();
    const { fake } = await openWeek({ configure: 'ready', numbersOff: true });
    await user.click(screen.getByRole('button', { name: 'Ask the coach about this week' }));
    await waitFor(() => expect(fake.requests).toHaveLength(1));
    const sent = JSON.parse(fake.last.body) as { messages: { content: string }[] };
    expect(sent.messages[1]?.content).not.toMatch(/dailyAverages|dailyGuide|kcal/);
  });

  it('a paragraph that fails the checks is not shown', async () => {
    const user = userEvent.setup();
    await openWeek({ configure: 'ready', reply: 'Great job this week! See https://example.org' });
    await user.click(screen.getByRole('button', { name: 'Ask the coach about this week' }));
    expect(await screen.findByText(/did not find words it was happy with/)).toBeVisible();
    expect(screen.queryByText(/example\.org/)).toBeNull();
  });

  it('a failure and a busy AI are calm lines', async () => {
    const user = userEvent.setup();
    const { fake } = await openWeek({ configure: 'ready' });
    fake.status = 429;
    await user.click(screen.getByRole('button', { name: 'Ask the coach about this week' }));
    expect(await screen.findByText('The AI is busy. Try again in a moment.')).toBeVisible();
    fake.status = 500;
    await user.click(screen.getByRole('button', { name: 'Ask the coach about this week' }));
    expect(await screen.findByText(/could not answer just now/)).toBeVisible();
  });

  it('the week screen links to Ask the coach', async () => {
    await openWeek();
    expect(screen.getByRole('link', { name: 'Ask the coach' })).toHaveAttribute('href', '#/coach');
  });
});
