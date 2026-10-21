// Ask the coach: off without an AI or a yes (with a way to turn it on), a text chat when it is on,
// the support line for a worry (nothing sent), limits, calm failures, axe.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
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
import { useSession, type Session } from '../../app/session';
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
    expect(body.messages[1]?.content).toContain('Lentils');
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

  it('a possible emergency is answered with the emergency numbers, and nothing is sent', async () => {
    const user = userEvent.setup();
    const { fake } = await open();
    await user.type(
      screen.getByRole('textbox', { name: 'Your question' }),
      'I get chest pain after eating',
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/call your local emergency number now/)).toBeVisible();
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

describe('AskCoachScreen: accessibility', () => {
  it('has no axe violations (the enable-AI path, and the open chat)', async () => {
    const bundle = await unlockedBundle();
    const { container, unmount } = await renderInSession(<AskCoachScreen />, { bundle });
    await screen.findByRole('heading', { level: 2, name: 'The AI coach is off' });
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    const fake = new FakeFetch();
    fake.jsonBody = chatReply(ANSWER);
    const ready = await unlockedBundle();
    await configureByokCoaching(ready);
    const view = await renderInSession(<AskCoachScreen />, {
      bundle: ready,
      session: { fetch: fake.fetch },
    });
    await screen.findByRole('textbox', { name: 'Your question' });
    expect(await axe(view.container)).toHaveNoViolations();
  });
});

describe('Ask the coach: safety copy, numbers off, the log', () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>, text: string, name = 'Ask') => {
    await user.type(screen.getByRole('textbox', { name: /Your question|Votre question/ }), text);
    await user.click(screen.getByRole('button', { name }));
  };

  it('a possible emergency says to call the emergency number now (EN)', async () => {
    const user = userEvent.setup();
    const { fake } = await open();
    await ask(user, 'My throat is swelling after peanuts');
    expect(
      await screen.findByText(
        'This could be urgent. Please call your local emergency number now: 112 in the EU, 999 in the UK, 911 in the US, 15 or 112 in France. I cannot give advice on symptoms.',
      ),
    ).toBeVisible();
    expect(fake.requests).toHaveLength(0);
  });

  it('a possible emergency says to call the secours (FR)', async () => {
    const user = userEvent.setup();
    const { fake } = await open({
      french: true,
      heading: 'Interroger le coach',
      wrapper: ({ children }) => <LocaleProvider initial="fr">{children}</LocaleProvider>,
    });
    await ask(user, 'Je me suis évanoui', 'Demander');
    expect(await screen.findByText(/Appelez les secours maintenant/)).toBeVisible();
    expect(screen.getByText(/le 15 ou le 112 en France/)).toBeVisible();
    expect(fake.requests).toHaveLength(0);
  });

  it('thoughts of self-harm get the crisis lines, in both languages, and nothing is sent', async () => {
    const user = userEvent.setup();
    const en = await open();
    await ask(user, 'I want to kill myself');
    const line = await screen.findByText(/3114/);
    expect(line).toHaveTextContent(/Samaritans are on 116 123/);
    expect(line).toHaveTextContent(/call or text 988/);
    expect(en.fake.requests).toHaveLength(0);
    cleanup();

    const fr = await open({
      french: true,
      heading: 'Interroger le coach',
      wrapper: ({ children }) => <LocaleProvider initial="fr">{children}</LocaleProvider>,
    });
    await ask(user, 'je veux mourir', 'Demander');
    expect(
      await screen.findByText(/appeler le 3114, le numéro national de prévention du suicide/),
    ).toBeVisible();
    expect(fr.fake.requests).toHaveLength(0);
  });

  it('an eating worry shows the support line; another symptom says to see a doctor', async () => {
    const user = userEvent.setup();
    await open();
    await ask(user, 'I feel dizzy after lunch');
    expect(await screen.findByText(/check with a doctor or a pharmacist/)).toBeVisible();
  });

  it('numbers off afterwards: an answer with an amount is hidden, and shown again when they are back', async () => {
    const user = userEvent.setup();
    const fake = new FakeFetch();
    fake.jsonBody = chatReply('You had about 18 g of fibre. Which meal?');
    const bundle = await unlockedBundle();
    await configureByokCoaching(bundle);
    let session: Session | undefined;
    function Probe() {
      session = useSession();
      return null;
    }
    await renderInSession(
      <>
        <Probe />
        <AskCoachScreen />
      </>,
      { bundle, session: { fetch: fake.fetch } },
    );
    await ask(user, 'How much fibre?');
    expect(await screen.findByText(/You had about 18 g of fibre/)).toBeVisible();

    await act(async () => session?.numbers.set(false));
    expect(screen.queryByText(/18 g/)).toBeNull();
    expect(
      screen.getByText(
        'This answer quotes amounts, which are hidden while nutrition numbers are turned off.',
      ),
    ).toBeVisible();

    // And it is not sent back as history while numbers are off.
    fake.jsonBody = chatReply('Fine. Anything else?');
    await ask(user, 'And salt?');
    await screen.findByText('Fine. Anything else?');
    const sent = JSON.parse(fake.last.body) as { messages: { content: string }[] };
    expect(JSON.stringify(sent.messages)).not.toMatch(/18 g|How much fibre/);

    await act(async () => session?.numbers.set(true));
    expect(screen.getByText(/You had about 18 g of fibre/)).toBeVisible();
  });

  it('shows the question once while it is answered, and offers a new conversation once there is history', async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.queryByRole('button', { name: 'Start a new conversation' })).toBeNull();
    await ask(user, 'Is my week varied?');
    await screen.findByText(ANSWER);
    const log = screen.getByRole('log');
    expect(within(log).getAllByText('Is my week varied?')).toHaveLength(1);
    expect(screen.queryAllByText('Is my week varied?')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Start a new conversation' }));
    expect(within(screen.getByRole('log')).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Start a new conversation' })).toBeNull();
  });
});
