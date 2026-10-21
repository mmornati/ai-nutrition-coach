// Ask the coach: off without an AI or a yes (with a way to turn it on), a text chat when it is on,
// the support line for a worry (nothing sent), limits, calm failures, axe.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { chatReply, FakeFetch } from '../../ai/testing';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { configureByokCoaching } from '../../coaching/testing';
import { setCurrentLocale } from '../../i18n';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { KV_KEYS } from '../../storage';
import { SUPPORT_URL } from '../../components/nutrition';
import { AskCoachScreen } from './AskCoachScreen';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
  window.location.hash = '';
});

const ANSWER = 'Lentils came up twice this week. Which dish did you like best?';

async function open(
  options: {
    configure?: 'none' | 'noConsent' | 'ready';
    reply?: string;
    wrapper?: (props: { children: ReactNode }) => ReactNode;
    heading?: string;
    french?: boolean;
  } = {},
) {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(options.reply ?? ANSWER);
  const bundle = await unlockedBundle();
  await seedMeasuredPlate(bundle, at(12, 0, -1), [
    {
      name: 'Lentils',
      group: 'protein',
      grams: 200,
      per100g: { energyKcal: 120, protein: 9, fibre: 8 },
    },
  ]);
  if (options.french) await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
  if (options.configure === 'noConsent') await configureByokCoaching(bundle, { consent: false });
  if (options.configure === 'ready' || options.configure === undefined) {
    await configureByokCoaching(bundle);
  }
  const view = await renderInSession(<AskCoachScreen />, {
    bundle,
    session: { fetch: fake.fetch },
    ...(options.wrapper ? { wrapper: options.wrapper } : {}),
  });
  await screen.findByRole('heading', { level: 1, name: options.heading ?? 'Ask the coach' });
  return { fake, bundle, ...view };
}

describe('Ask the coach: off', () => {
  it('without an AI it says how to turn it on and links to Your AI (no dead end, no request)', async () => {
    const { fake, container } = await open({ configure: 'none' });
    expect(screen.getByRole('heading', { level: 2, name: 'The AI coach is off' })).toBeVisible();
    expect(screen.getByText(/needs an AI/)).toBeVisible();
    const link = screen.getByRole('link', { name: 'Open Your AI' });
    expect(link).toHaveAttribute('href', '#/settings/ai');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fake.requests).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('with an AI but no yes to coaching it names where meals would go and links to Your AI', async () => {
    const { fake } = await open({ configure: 'noConsent' });
    expect(screen.getByText(/sends your meals to api\.example\.com/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Your AI' })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });
});

describe('Ask the coach: the chat', () => {
  it('says what the AI sees and that the conversation is not kept', async () => {
    await open();
    expect(screen.getByText(/never your photos/)).toBeVisible();
    expect(screen.getByText(/not saved or exported/)).toBeVisible();
    expect(screen.getByText(/not medical advice/)).toBeVisible();
  });

  it('asks a question, shows the answer marked as AI-written, and sends the week with it', async () => {
    const user = userEvent.setup();
    const { fake, container } = await open();
    const box = screen.getByRole('textbox', { name: 'Your question' });
    expect(box).toHaveAttribute('maxlength', '500');
    await user.type(box, 'Is my week varied?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    const log = await screen.findByRole('log');
    await waitFor(() => expect(within(log).getByText(ANSWER)).toBeVisible());
    expect(within(log).getByText('Is my week varied?')).toBeVisible();
    expect(within(log).getByText('Written by AI')).toBeVisible();
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(box).toHaveValue('');

    const body = JSON.parse(fake.last.body) as { messages: { role: string; content: string }[] };
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Is my week varied?' });
    expect(body.messages[0]?.content).toContain('Lentils');
    expect(fake.last.headers['authorization']).toMatch(/^Bearer /);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Enter sends (a form), the counter follows the typing, 48 px targets', async () => {
    const user = userEvent.setup();
    await open();
    const box = screen.getByRole('textbox', { name: 'Your question' });
    await user.type(box, 'Hello{Enter}');
    await waitFor(() => expect(screen.getByText(ANSWER)).toBeVisible());
    expect(screen.getByText('1 of 6 questions asked')).toBeVisible();
    expect(screen.getByText('0 of 500 characters')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ask' }).className).toMatch(/min-h-12/);
  });

  it('a worry about eating is answered with the support line and nothing is sent', async () => {
    const user = userEvent.setup();
    const { fake, container } = await open();
    await user.type(
      screen.getByRole('textbox', { name: 'Your question' }),
      'I binge at night and then purge',
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const log = await screen.findByRole('log');
    await waitFor(() => expect(within(log).getByText(/weighing on you/)).toBeVisible());
    const link = within(log).getByRole('link', { name: /Beat, the UK eating disorder charity/ });
    expect(link).toHaveAttribute('href', SUPPORT_URL.en);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(log).queryByText('Written by AI')).toBeNull();
    expect(fake.requests).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a symptom is sent to a doctor, not answered, and nothing is sent', async () => {
    const user = userEvent.setup();
    const { fake } = await open();
    await user.type(
      screen.getByRole('textbox', { name: 'Your question' }),
      'I get chest pain after eating',
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/check with a doctor or a pharmacist/)).toBeVisible();
    expect(fake.requests).toHaveLength(0);
  });

  it('a French worry is routed locally too, in French', async () => {
    const user = userEvent.setup();
    const { fake } = await open({
      french: true,
      heading: 'Interroger le coach',
      wrapper: ({ children }) => <LocaleProvider initial="fr">{children}</LocaleProvider>,
    });
    await user.type(
      screen.getByRole('textbox', { name: 'Votre question' }),
      'je me fais vomir après les repas',
    );
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    expect(await screen.findByText(/vous préoccupent/)).toBeVisible();
    expect(screen.getByRole('link', { name: /FFAB/ })).toHaveAttribute('href', SUPPORT_URL.fr);
    expect(fake.requests).toHaveLength(0);
  });

  it('after 6 questions it stops, and a new conversation starts again', async () => {
    const user = userEvent.setup();
    await open();
    const box = () => screen.getByRole('textbox', { name: 'Your question' });
    for (let i = 1; i <= 6; i++) {
      await user.type(box(), `Question ${i}`);
      await user.click(screen.getByRole('button', { name: 'Ask' }));
      if (i < 6) {
        await waitFor(() => expect(screen.getByText(`${i} of 6 questions asked`)).toBeVisible());
      }
    }
    expect(screen.getByText(/end of this conversation: 6 questions/)).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start a new conversation' }));
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('');
    expect(screen.getByText('0 of 6 questions asked')).toBeVisible();
    expect(within(screen.getByRole('log')).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('a failure is a calm line and the question stays in the box', async () => {
    const user = userEvent.setup();
    const { fake } = await open();
    fake.status = 500;
    const box = screen.getByRole('textbox', { name: 'Your question' });
    await user.type(box, 'Is my week varied?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/could not answer just now/)).toBeVisible();
    expect(box).toHaveValue('Is my week varied?');
  });

  it('a busy AI says so without a countdown', async () => {
    const user = userEvent.setup();
    const { fake } = await open();
    fake.status = 429;
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('The AI is busy. Try again in a moment.')).toBeVisible();
  });

  it('an answer that fails the checks is not shown', async () => {
    const user = userEvent.setup();
    await open({ reply: 'Great job! See https://example.org' });
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/Could you ask it another way/)).toBeVisible();
    expect(screen.queryByText(/example\.org/)).toBeNull();
  });
});
