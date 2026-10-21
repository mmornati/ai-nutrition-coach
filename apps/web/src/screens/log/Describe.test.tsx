// Describe a meal as the person meets it: words (or a short recording turned into text) become the
// same review sheet a photo gives. With no AI it is matched on this device and nothing is sent;
// with an AI the person must agree first, per destination; voice appears only where it can work.
import { useEffect } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { AiSettings, KvAiSettingsStore } from '../../ai';
import { FakeFetch, TEST_KEY, chatReply } from '../../ai/testing';
import { fakeVoiceEnv, type FakeVoice } from '../../capture/voice-testing';
import { strings } from '../../i18n';
import { unlockedBundle } from '../../app/testing';
import { DayProvider } from '../../app/day-context';
import { SessionBoundary, useSession, type Session } from '../../app/session';
import { StoreProvider } from '../../app/store-context';
import { TodayScreen } from '../today/TodayScreen';
import { LogHost } from './LogHost';

const s = strings();
const d = s.describe;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

let grabbed: Session | null = null;
function Grab() {
  const session = useSession();
  useEffect(() => {
    grabbed = session;
  });
  return null;
}

const RICE =
  '[{"name":"Rice","quantityHint":"1 cup","grams":150,"group":"starch","confidence":0.9}]';

async function start(
  options: {
    fetch?: FakeFetch;
    voice?: FakeVoice;
    byok?: boolean;
    instance?: Record<string, unknown>;
    /** Grant the describe consent before opening the sheet. */
    agreed?: boolean;
  } = {},
) {
  const user = userEvent.setup();
  const fetch = options.fetch ?? new FakeFetch();
  if (options.instance) fetch.instanceConfig = options.instance;
  fetch.jsonBody = chatReply(RICE);
  const bundle = await unlockedBundle();
  if (options.instance) {
    await new KvAiSettingsStore(bundle.kv).write(new AiSettings({ rung: { kind: 'instance' } }));
  }
  const view = render(
    <StoreProvider bundle={bundle}>
      <SessionBoundary bundle={bundle} options={{ fetch: fetch.fetch }}>
        <DayProvider>
          <LogHost {...(options.voice ? { voiceEnv: options.voice.env } : {})}>
            <Grab />
            <TodayScreen />
          </LogHost>
        </DayProvider>
      </SessionBoundary>
    </StoreProvider>,
  );
  await screen.findByText('Lunch');
  if (options.instance) {
    await act(async () => {
      await (grabbed as Session).ai.instance.refresh();
    });
  }
  if (options.byok) {
    await act(async () => {
      const ai = (grabbed as Session).ai;
      await ai.settings.setByokTarget({
        endpointUrl: 'https://ai.example.test/v1',
        model: 'chat-1',
        keyHost: 'ai.example.test',
      });
      await ai.keyStore.write(TEST_KEY);
      await ai.settings.setRung({ kind: 'byok' });
    });
  }
  if (options.agreed) {
    await act(async () => {
      await (grabbed as Session).ai.describe.grant();
    });
  }
  // The gate has followed what was just set up before the sheet is opened.
  const describeState = () => (grabbed as Session).ai.describe.getSnapshot();
  if (options.byok || options.instance) {
    await waitFor(() => expect(describeState().status.kind).not.toBe('noAi'));
  }
  if (options.agreed) await waitFor(() => expect(describeState().status.kind).toBe('ready'));
  await user.click(screen.getAllByRole('button', { name: s.shell.logAPlate })[0] as HTMLElement);
  const capture = await screen.findByRole('dialog', { name: s.capture.title });
  await user.click(within(capture).getByRole('button', { name: new RegExp(s.capture.describe) }));
  const sheet = await screen.findByRole('dialog', { name: d.title });
  return { user, fetch, bundle, sheet, view };
}

const field = (sheet: HTMLElement) => within(sheet).getByLabelText(d.fieldLabel);

describe('Describe: with no AI', () => {
  it('is a tile on the capture sheet, next to Photo, Barcode and Type it', async () => {
    const { sheet } = await start();
    expect(sheet).toBeVisible();
  });

  it('explains that it matches on this device and sends nothing, with a way to set AI up and a way to type', async () => {
    const { sheet, fetch } = await start();
    expect(within(sheet).getByText(d.noAiNote)).toBeVisible();
    expect(within(sheet).getByRole('link', { name: s.recognized.setUpAi })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(within(sheet).getByRole('button', { name: d.typeInstead })).toBeVisible();
    // The keyboard's own microphone is the free dictation: the hint says so.
    expect(within(sheet).getByText(new RegExp(d.dictation))).toBeVisible();
    // No microphone button: nothing here can transcribe.
    expect(within(sheet).queryByRole('button', { name: d.talk })).not.toBeInTheDocument();
    expect(fetch.requests).toEqual([]);
  });

  it('splits the words, matches each in the food list and logs ONE plate, with nothing sent', async () => {
    const { user, fetch, bundle, sheet } = await start();
    await user.type(field(sheet), 'salmon and an apple');
    await user.click(within(sheet).getByRole('button', { name: d.find }));

    const review = await screen.findByRole('dialog', { name: /Found 2 foods in your words/ });
    expect(within(review).getByText(s.recognized.describedHint)).toBeVisible();
    const ticked = within(review)
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).checked);
    expect(ticked.map((c) => c.closest('li')?.textContent)).toEqual([
      expect.stringContaining('Salmon'),
      expect.stringContaining('Apple'),
    ]);
    await user.click(within(review).getByRole('button', { name: s.common.log }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    if (read.kind !== 'platesRead') throw new Error('plates not read');
    expect(read.plates).toHaveLength(1);
    expect(read.plates[0]?.entries.map((e) => e.databaseFood.displayName)).toEqual([
      'Salmon',
      'Apple',
    ]);
    expect(fetch.requests).toEqual([]);
  });

  it('a piece that matches nothing is named, and the custom food field is there', async () => {
    const { user, sheet } = await start();
    await user.type(field(sheet), 'salmon, zzzqqq');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    const review = await screen.findByRole('dialog', { name: /Found 1 food in your words/ });
    expect(within(review).getByText(/No match for: zzzqqq/)).toBeVisible();
    expect(within(review).getByLabelText(s.recognized.customFoodName)).toBeVisible();
  });

  it('nothing written is a calm line, not a request; Type it instead hands over the first food', async () => {
    const { user, sheet } = await start();
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    expect(await within(sheet).findByText(d.empty)).toBeVisible();
    await user.type(field(sheet), 'two salmon, rice');
    await user.click(within(sheet).getByRole('button', { name: d.typeInstead }));
    const typeIt = await screen.findByRole('dialog', { name: s.catalog.title });
    expect(within(typeIt).getByLabelText(s.catalog.searchLabel)).toHaveValue('salmon');
  });

  it('caps the text at 500 characters', async () => {
    const { sheet, user } = await start();
    await user.click(field(sheet));
    await user.paste('x'.repeat(700));
    expect((field(sheet) as HTMLTextAreaElement).value).toHaveLength(500);
  });

  it('has no axe violations', async () => {
    const { view } = await start();
    expect(await axe(view.baseElement)).toHaveNoViolations();
  });
});

describe('Describe: with your own key', () => {
  it('asks first, naming the host and what is sent; "Not now" sends nothing and matches on this device', async () => {
    const { user, fetch, sheet } = await start({ byok: true });
    expect(within(sheet).getByText(d.askFirstNote)).toBeVisible();
    await user.type(field(sheet), 'salmon');
    await user.click(within(sheet).getByRole('button', { name: d.find }));

    const card = await within(sheet).findByRole('region', {
      name: 'Send your words to ai.example.test?',
    });
    expect(card.textContent).toContain('a short voice recording');
    expect(card.textContent).toContain('This app does not store the recording');
    expect(within(card).getByRole('button', { name: d.consentDecline })).toHaveFocus();
    expect(fetch.requests).toEqual([]);

    await user.click(within(card).getByRole('button', { name: d.consentDecline }));
    expect(await screen.findByRole('dialog', { name: /Found 1 food in your words/ })).toBeVisible();
    expect(fetch.requests).toEqual([]);
    // The agreement was not saved: the consent is still off.
    expect((grabbed as Session).ai.describe.getSnapshot().status.kind).toBe('needsConsent');
  });

  it('a yes is saved for this destination, sends the text to it, and lands the AI’s foods in the review sheet', async () => {
    const { user, fetch, bundle, sheet } = await start({ byok: true });
    await user.type(field(sheet), 'a cup of rice');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    const card = await within(sheet).findByRole('region', {
      name: /Send your words to ai.example.test/,
    });
    await user.click(within(card).getByRole('button', { name: 'Allow ai.example.test' }));

    const review = await screen.findByRole('dialog', { name: /Found 1 food in your words/ });
    expect(fetch.requests).toHaveLength(1);
    expect(fetch.last.url).toBe('https://ai.example.test/v1/chat/completions');
    const sent = JSON.parse(fetch.last.body) as { messages: { role: string; content: string }[] };
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(sent.messages[1]?.content).toBe('a cup of rice');
    expect((grabbed as Session).ai.describe.getSnapshot().status.kind).toBe('ready');

    // The AI's weight guess is the portion (grams editable in the sheet), and it logs as one plate.
    expect(within(review).getAllByText('Rice')[0]).toBeVisible();
    await user.click(within(review).getByRole('button', { name: s.common.log }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    if (read.kind !== 'platesRead') throw new Error('plates not read');
    expect(read.plates[0]?.entries[0]?.quantity.grams).toBe(150);
  });

  it('once agreed it does not ask again; a busy AI is a calm line with a way to match on this device', async () => {
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, fetch });
    expect(within(sheet).getByText(/Your words are sent to ai.example.test/)).toBeVisible();
    fetch.status = 429;
    await user.type(field(sheet), 'salmon');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    expect(await within(sheet).findByText(d.busy, {}, { timeout: 4000 })).toBeVisible();
    expect(within(sheet).queryByRole('region')).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: d.matchHere }));
    expect(await screen.findByRole('dialog', { name: /Found 1 food in your words/ })).toBeVisible();
  });

  it('a failure is calm and keeps what was written', async () => {
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, fetch });
    fetch.status = 503;
    await user.type(field(sheet), 'salmon');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    expect(await within(sheet).findByText(d.failed, {}, { timeout: 4000 })).toBeVisible();
    expect(field(sheet)).toHaveValue('salmon');
  });

  it('an answer with no food says so instead of guessing', async () => {
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, fetch });
    fetch.jsonBody = chatReply('[]');
    await user.type(field(sheet), 'nothing edible');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    expect(await within(sheet).findByText(d.nothingFound)).toBeVisible();
  });

  it('the consent card has no axe violations', async () => {
    const { user, sheet, view } = await start({ byok: true });
    await user.type(field(sheet), 'salmon');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    await within(sheet).findByRole('region', { name: /Send your words/ });
    expect(await axe(view.baseElement)).toHaveNoViolations();
  });
});

describe('Describe: with the AI this server offers', () => {
  const OFFER = { enabled: true, model: 'vendor/model-x', label: 'Acme AI' };

  it('the consent names this server and the provider behind it, and sends no key', async () => {
    const { user, fetch, sheet } = await start({ instance: OFFER });
    await waitFor(() =>
      expect((grabbed as Session).ai.settings.getSnapshot().rung.kind).toBe('instance'),
    );
    await user.type(field(sheet), 'a cup of rice');
    await user.click(within(sheet).getByRole('button', { name: d.find }));
    const card = await within(sheet).findByRole('region', { name: d.consentTitleInstance });
    expect(card.textContent).toContain('this server (localhost)');
    expect(card.textContent).toContain('passes it on to Acme AI');
    expect(card.textContent).toContain('not from your device');
    await user.click(within(card).getByRole('button', { name: d.consentAllowInstance }));
    await screen.findByRole('dialog', { name: /Found 1 food in your words/ });
    expect(new URL(fetch.last.url).pathname).toBe('/ai/v1/chat/completions');
    expect(fetch.last.headers['authorization']).toBeUndefined();
  });
});

describe('Describe: voice', () => {
  const OFFER_VOICE = {
    enabled: true,
    model: 'vendor/model-x',
    label: 'Acme AI',
    transcription: true,
    transcriptionModel: 'whisper-x',
  };

  it('is hidden with no AI, and on a server that does not transcribe', async () => {
    const none = await start({ voice: fakeVoiceEnv() });
    expect(within(none.sheet).queryByRole('button', { name: d.talk })).not.toBeInTheDocument();
  });

  it('is hidden when the browser cannot record', async () => {
    const { sheet } = await start({
      byok: true,
      agreed: true,
      voice: fakeVoiceEnv({ noRecorder: true }),
    });
    expect(within(sheet).queryByRole('button', { name: d.talk })).not.toBeInTheDocument();
  });

  it('records, shows a calm state with no digits, transcribes into the field for review, and never logs by itself', async () => {
    const voice = fakeVoiceEnv();
    const fetch = new FakeFetch();
    const { user, sheet, bundle } = await start({ byok: true, agreed: true, voice, fetch });
    const talk = await within(sheet).findByRole('button', { name: d.talk });
    expect(talk).toHaveAttribute('aria-pressed', 'false');
    // At least 48 px tall.
    expect(talk.className).toContain('min-h-14');

    await user.click(talk);
    expect(await within(sheet).findByText(d.listening)).toBeVisible();
    expect(talk).toHaveAttribute('aria-pressed', 'true');
    expect(voice.asked()).toBe(1);
    // A line, not a countdown: nothing in the group counts seconds.
    const group = within(sheet).getByRole('group', { name: d.recordingLabel });
    expect(group.textContent).not.toMatch(/\d/);

    fetch.jsonBody = { text: 'salmon and an apple' };
    await user.click(talk);
    await waitFor(() => expect(field(sheet)).toHaveValue('salmon and an apple'));
    expect(await within(sheet).findByText(d.transcribed)).toBeVisible();
    expect(talk).toHaveAttribute('aria-pressed', 'false');
    // The microphone is released and the audio was sent once, as multipart, to the key endpoint.
    expect(voice.streams[0]?.track.stopped).toBe(true);
    expect(fetch.last.url).toBe('https://ai.example.test/v1/audio/transcriptions');
    expect(fetch.last.init.body).toBeInstanceOf(FormData);
    // Nothing was logged: the person still has to find the foods and review them.
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates).toHaveLength(0);
  });

  it('works from the keyboard: Space and Enter toggle the button', async () => {
    const voice = fakeVoiceEnv();
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, voice, fetch });
    const talk = await within(sheet).findByRole('button', { name: d.talk });
    talk.focus();
    await user.keyboard(' ');
    await waitFor(() => expect(talk).toHaveAttribute('aria-pressed', 'true'));
    fetch.jsonBody = { text: 'rice' };
    await user.keyboard('{Enter}');
    await waitFor(() => expect(field(sheet)).toHaveValue('rice'));
  });

  it('adds the transcript to what was already written, within 500 characters', async () => {
    const voice = fakeVoiceEnv();
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, voice, fetch });
    await user.type(field(sheet), 'rice');
    const talk = await within(sheet).findByRole('button', { name: d.talk });
    await user.click(talk);
    fetch.jsonBody = { text: 'and an apple' };
    await user.click(talk);
    await waitFor(() => expect(field(sheet)).toHaveValue('rice and an apple'));
  });

  it('a denied microphone is one calm line and the keyboard still works', async () => {
    const voice = fakeVoiceEnv({ deny: 'NotAllowedError' });
    const { user, sheet } = await start({ byok: true, agreed: true, voice });
    await user.click(await within(sheet).findByRole('button', { name: d.talk }));
    expect(await within(sheet).findByText(d.micDenied)).toBeVisible();
    expect(within(sheet).getByRole('button', { name: d.talk })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.type(field(sheet), 'rice');
    expect(field(sheet)).toHaveValue('rice');
  });

  it('no microphone at all is an "unavailable" line, not an error', async () => {
    const voice = fakeVoiceEnv({ deny: 'NotFoundError' });
    const { user, sheet } = await start({ byok: true, agreed: true, voice });
    await user.click(await within(sheet).findByRole('button', { name: d.talk }));
    expect(await within(sheet).findByText(d.micUnavailable)).toBeVisible();
  });

  it('asks the describe consent before recording: Allow does not start the microphone, the next tap does', async () => {
    const voice = fakeVoiceEnv();
    const { user, sheet } = await start({ byok: true, voice });
    await user.click(await within(sheet).findByRole('button', { name: d.talk }));
    const card = await within(sheet).findByRole('region', { name: /Send your words/ });
    expect(voice.asked()).toBe(0);
    await user.click(within(card).getByRole('button', { name: 'Allow ai.example.test' }));
    expect(
      await within(sheet).findByText(d.recordHint, { selector: '[role=status]' }),
    ).toBeVisible();
    expect(voice.asked()).toBe(0);
    await user.click(await within(sheet).findByRole('button', { name: d.talk }));
    await waitFor(() => expect(voice.asked()).toBe(1));
  });

  it('a service with no transcription hides the button after the first 404 (and says why)', async () => {
    const voice = fakeVoiceEnv();
    const fetch = new FakeFetch();
    const { user, sheet } = await start({ byok: true, agreed: true, voice, fetch });
    const talk = await within(sheet).findByRole('button', { name: d.talk });
    await user.click(talk);
    fetch.status = 404;
    await user.click(talk);
    expect(await within(sheet).findByText(d.voiceUnsupported)).toBeVisible();
    await waitFor(() =>
      expect(within(sheet).queryByRole('button', { name: d.talk })).not.toBeInTheDocument(),
    );
  });

  it('an empty recording says nothing was heard', async () => {
    const quiet = fakeVoiceEnv({ bytes: 0 });
    const a = await start({ byok: true, agreed: true, voice: quiet });
    const talk = await within(a.sheet).findByRole('button', { name: d.talk });
    await a.user.click(talk);
    await a.user.click(talk);
    expect(await within(a.sheet).findByText(d.heardNothing)).toBeVisible();
  });

  it('is offered on the instance rung only when the server transcribes, with no key', async () => {
    const voice = fakeVoiceEnv();
    const fetch = new FakeFetch();
    const { user, sheet } = await start({
      instance: OFFER_VOICE,
      agreed: true,
      voice,
      fetch,
    });
    const talk = await within(sheet).findByRole('button', { name: d.talk });
    await user.click(talk);
    fetch.jsonBody = { text: 'salmon' };
    await user.click(talk);
    await waitFor(() => expect(field(sheet)).toHaveValue('salmon'));
    expect(fetch.last.url).toMatch(/\/ai\/v1\/audio\/transcriptions$/);
    expect(fetch.last.headers['authorization']).toBeUndefined();
    expect((fetch.last.init.body as FormData).get('model')).toBe('whisper-x');
  });
});
