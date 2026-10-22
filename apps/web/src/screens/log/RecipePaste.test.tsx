// Paste a recipe, as the person meets it in the recipe editor: read on the device with no AI (nothing
// sent), through their AI only after the Describe yes for that destination, falling back to the
// device when the AI fails; the result only PREFILLS the editor and nothing is saved by itself.
import { useLayoutEffect } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { FakeFetch, TEST_KEY, chatReply } from '../../ai/testing';
import { strings } from '../../i18n';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { useSession, type Session } from '../../app/session';
import { TodayScreen } from '../today/TodayScreen';

const s = strings();
const t = s.relog.recipe;
const d = s.describe;

beforeEach(() => {
  grabbed = null;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

let grabbed: Session | null = null;
function Grab() {
  const session = useSession();
  // A LAYOUT effect: it runs inside the commit, before the DOM change is observable, so a test that
  // waits for the screen and then reads `grabbed` always gets THIS render's session. A passive
  // effect can lag behind `findByText`, leaving the previous test's disposed session here (the
  // cause of the intermittent "noAi" failures under load: the AI was set up on a dead session).
  useLayoutEffect(() => {
    grabbed = session;
  });
  return null;
}

type Bundle = Awaited<ReturnType<typeof unlockedBundle>>;

const RECIPE_TEXT = [
  'Rice and salmon bowl',
  'Serves 3',
  'Ingredients',
  '200 g rice',
  '300 g salmon',
  '1 pinch of dragonfruit',
  'Method',
  'Cook the rice and the salmon. Serve warm.',
].join('\n');

async function openEditor(options: { fetch?: FakeFetch; byok?: boolean } = {}) {
  const user = userEvent.setup();
  const bundle: Bundle = await unlockedBundle();
  const fetch = options.fetch ?? new FakeFetch();
  await renderInSession(
    <>
      <Grab />
      <TodayScreen />
    </>,
    { bundle, session: { fetch: fetch.fetch } },
  );
  await screen.findByText('Breakfast');
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
    await waitFor(() =>
      expect((grabbed as Session).ai.describe.getSnapshot().status.kind).not.toBe('noAi'),
    );
  }
  await user.click(screen.getAllByRole('button', { name: s.shell.logAPlate })[0] as HTMLElement);
  const capture = await screen.findByRole('dialog', { name: s.capture.title });
  await user.click(within(capture).getByRole('button', { name: 'Saved meals and recipes' }));
  const saved = await screen.findByRole('dialog', { name: 'Saved meals and recipes' });
  await user.click(within(saved).getByRole('button', { name: 'New recipe' }));
  const editor = await screen.findByRole('dialog', { name: 'New recipe' });
  return { user, editor, fetch, bundle };
}

// Typing 1,000 characters one key at a time is slow: set the text in one go.
const paste = (editor: HTMLElement, text: string) =>
  fireEvent.change(within(editor).getByLabelText(t.pasteLabel), { target: { value: text } });

const chatRequests = (fetch: FakeFetch) =>
  fetch.requests.filter((r) => /chat\/completions/.test(r.url));

describe('Paste a recipe: with no AI', () => {
  it('has a Paste a recipe button, opens a field with the 8,000 limit, says nothing is sent, and has no axe violation', async () => {
    const { user, editor } = await openEditor();
    await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
    expect(within(editor).getByLabelText(t.pasteLabel)).toHaveAttribute('maxlength', '8000');
    expect(within(editor).getByText('Up to 8,000 characters.')).toBeVisible();
    expect(within(editor).getByText(t.pasteNoAiNote)).toBeVisible();
    expect(within(editor).getByRole('link', { name: s.recognized.setUpAi })).toBeVisible();
    expect(await axe(editor)).toHaveNoViolations();
  });

  it('prefills the name, servings and weighed ingredients, lists what is not matched, and saves nothing', async () => {
    const { user, editor, fetch, bundle } = await openEditor();
    await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
    paste(editor, RECIPE_TEXT);
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));

    await waitFor(() =>
      expect(within(editor).getByLabelText(t.name)).toHaveValue('Rice and salmon bowl'),
    );
    expect(within(editor).getByLabelText(t.servings)).toHaveValue('3');
    // The two matched ingredients, with their grams as typed (not estimates).
    const items = within(editor)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items.some((x) => /Rice.*200 g/.test(x))).toBe(true);
    expect(items.some((x) => /Salmon.*300 g/.test(x))).toBe(true);
    // The line nothing matched stays listed, for a manual pick.
    expect(within(editor).getByRole('heading', { name: t.notAddedTitle })).toBeVisible();
    expect(within(editor).getByText('1 pinch of dragonfruit')).toBeVisible();
    // The paste panel is closed; the status line says what happened.
    expect(within(editor).queryByLabelText(t.pasteLabel)).toBeNull();
    expect(within(editor).getByText(t.pasteDone)).toBeVisible();
    expect(within(editor).queryByText(t.pasteEstimated)).toBeNull();
    // Nothing was sent, and nothing was saved.
    expect(fetch.requests).toHaveLength(0);
    const listed = await bundle.saved.listRecipes();
    if (listed.kind !== 'saved') throw new Error('not listed');
    expect(listed.value).toHaveLength(0);
    expect(await axe(editor)).toHaveNoViolations();
  });

  it('marks converted weights as estimates and says so', async () => {
    const { user, editor } = await openEditor();
    await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
    paste(editor, 'Ingredients\n2 tbsp rice\n300 g salmon');
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    await waitFor(() => expect(within(editor).getByText(t.pasteEstimated)).toBeVisible());
    const items = within(editor)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items.some((x) => /Rice.*≈30 g/.test(x))).toBe(true);
    expect(items.some((x) => /Salmon.*300 g/.test(x) && !/≈/.test(x))).toBe(true);
  });

  it('asks for text first, and says so when no ingredient is found', async () => {
    const { user, editor } = await openEditor();
    await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    expect(within(editor).getByText(t.pasteEmpty)).toBeVisible();
    paste(editor, '200 g');
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    expect(await within(editor).findByText(t.pasteNothing)).toBeVisible();
    // The panel stays open to try again; Close leaves it.
    await user.click(
      within(within(editor).getByRole('region', { name: t.pasteTitle })).getByRole('button', {
        name: t.pasteClose,
      }),
    );
    expect(within(editor).queryByLabelText(t.pasteLabel)).toBeNull();
    expect(within(editor).getByRole('button', { name: t.pasteOpen })).toBeVisible();
  });

  it('keeps the ingredients already added and the name already typed', async () => {
    const { user, editor } = await openEditor();
    await user.type(within(editor).getByLabelText(t.name), 'My own name');
    await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
    paste(editor, RECIPE_TEXT);
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    await waitFor(() => expect(within(editor).getByLabelText(t.servings)).toHaveValue('3'));
    expect(within(editor).getByLabelText(t.name)).toHaveValue('My own name');
  });
});

describe('Paste a recipe: with an AI', () => {
  const AI_REPLY = JSON.stringify({
    name: 'Bowl from the AI',
    servings: 2,
    ingredients: [
      { name: 'rice', grams: 180, estimated: true },
      { name: 'salmon', grams: 250, estimated: false },
      { name: 'dragonfruit', grams: 30, estimated: true },
    ],
  });

  async function aiEditor(reply: unknown = chatReply(AI_REPLY)) {
    const fetch = new FakeFetch();
    fetch.jsonBody = reply;
    const view = await openEditor({ fetch, byok: true });
    await view.user.click(within(view.editor).getByRole('button', { name: t.pasteOpen }));
    paste(view.editor, RECIPE_TEXT);
    return view;
  }

  it('asks first and sends nothing until the person says yes; Not now reads it on the device', async () => {
    const { user, editor, fetch } = await aiEditor();
    expect(within(editor).getByText(t.pasteAskFirstNote)).toBeVisible();
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    const card = await within(editor).findByRole('region', {
      name: /Send your words to ai\.example\.test\?/,
    });
    // The disclosure names a pasted recipe and its limit.
    expect(within(card).getByText(/recipe you paste \(8,000 characters at most\)/)).toBeVisible();
    expect(chatRequests(fetch)).toHaveLength(0);
    await user.click(within(card).getByRole('button', { name: d.consentDecline }));
    await waitFor(() =>
      expect(within(editor).getByLabelText(t.name)).toHaveValue('Rice and salmon bowl'),
    );
    expect(within(editor).getByText(t.pasteDeclined)).toBeVisible();
    expect(chatRequests(fetch)).toHaveLength(0);
    expect((grabbed as Session).ai.describe.getSnapshot().status.kind).toBe('needsConsent');
  });

  it('after Allow sends exactly the recipe text, then matches the AI names on the device (weights from the AI, nutrients from the catalogue)', async () => {
    const { user, editor, fetch } = await aiEditor();
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    const card = await within(editor).findByRole('region', {
      name: /Send your words to ai\.example\.test\?/,
    });
    await user.click(within(card).getByRole('button', { name: 'Allow ai.example.test' }));
    await waitFor(() =>
      expect(within(editor).getByLabelText(t.name)).toHaveValue('Bowl from the AI'),
    );
    expect(chatRequests(fetch)).toHaveLength(1);
    const body = JSON.parse(chatRequests(fetch)[0]?.body ?? '{}') as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[1]?.content).toBe(RECIPE_TEXT);
    expect(within(editor).getByLabelText(t.servings)).toHaveValue('2');
    const items = within(editor)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items.some((x) => /Rice.*≈180 g/.test(x))).toBe(true);
    expect(items.some((x) => /Salmon.*250 g/.test(x) && !/≈/.test(x))).toBe(true);
    expect(within(editor).getByText('dragonfruit (≈30 g)')).toBeVisible();
    expect(within(editor).getByText(t.pasteEstimated)).toBeVisible();
    expect((grabbed as Session).ai.describe.getSnapshot().status.kind).toBe('ready');
  });

  it('with the yes already given it sends at once; a reply that breaks a rule falls back to the device', async () => {
    const { user, editor, fetch } = await aiEditor(chatReply('I could not read that.'));
    await act(async () => {
      await (grabbed as Session).ai.describe.grant();
    });
    await waitFor(() =>
      expect((grabbed as Session).ai.describe.getSnapshot().status.kind).toBe('ready'),
    );
    expect(
      within(editor).getByText('The recipe text is sent to ai.example.test to be read.', {
        exact: false,
      }),
    ).toBeVisible();
    await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
    await waitFor(() =>
      expect(within(editor).getByLabelText(t.name)).toHaveValue('Rice and salmon bowl'),
    );
    expect(chatRequests(fetch)).toHaveLength(1);
    expect(within(editor).getByText(t.pasteAiFailed)).toBeVisible();
    expect(within(editor).getByLabelText(t.servings)).toHaveValue('3');
  });
});
