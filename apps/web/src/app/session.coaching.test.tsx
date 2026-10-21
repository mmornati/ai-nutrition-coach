// The whole path: log a plate, the template note is stored first, the AI note arrives after and
// replaces it in place; any failure, a missing yes or a lock leaves the template note alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatReply, FakeFetch } from '../ai/testing';
import { configureByokCoaching } from '../coaching/testing';
import { KV_KEYS } from '../storage';
import { createSession, type Session } from './session';
import { draft, unlockedBundle } from './testing';

const NOTE = 'Chicken and nothing green beside it. What greens do you have at home that you enjoy?';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup(
  options: { consent?: boolean; configure?: boolean; numbersOff?: boolean } = {},
) {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(
    JSON.stringify({ note: NOTE, followUp: 'Do you cook them or eat them raw?' }),
  );
  const bundle = await unlockedBundle();
  if (options.configure !== false) {
    await configureByokCoaching(bundle, { consent: options.consent ?? true });
  }
  if (options.numbersOff) await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
  const session = await createSession(bundle, { fetch: fake.fetch });
  return { fake, bundle, session };
}

const log = (session: Session) => session.recordPlate([draft('Chicken', 'protein')]);
const notesOf = async (session: Session, plateId: number) =>
  (await session.notes.forPlate(plateId)).map((n) => n.questionKey);

describe('logging a plate with AI coaching on', () => {
  it('stores the template note first and upgrades it in place when the AI answers', async () => {
    const { fake, session } = await setup();
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    const id = result.plateLog.id;

    // The call returned with the template note already stored.
    expect((await notesOf(session, id))[0]).toMatch(/^post\.resolve\./);

    await vi.waitFor(async () =>
      expect((await notesOf(session, id)).some((k) => k.startsWith('post.resolve.ai'))).toBe(true),
    );
    const keys = await notesOf(session, id);
    expect(keys[0]).toMatch(/^post\.resolve\.(?!ai)/);
    expect(keys).toContain('depth.followUp.ai?lang=en');
    const stored = (await session.notes.forPlate(id)).find(
      (n) => n.questionKey === 'post.resolve.ai?lang=en',
    );
    expect(stored?.text).toBe(NOTE);

    // One call, to the user's endpoint, with the plate, and no photo or passphrase anywhere.
    expect(fake.requests).toHaveLength(1);
    expect(fake.last.url).toBe('https://api.example.com/v1/chat/completions');
    expect(fake.last.body).toContain('Chicken');
    expect(fake.last.body).not.toMatch(/image|passphrase/i);
    session.dispose();
  });

  it('a failing AI leaves the template note and the log is unaffected', async () => {
    const { fake, session } = await setup();
    fake.status = 500;
    const result = await log(session);
    expect(result.kind).toBe('recordPlateSuccess');
    if (result.kind !== 'recordPlateSuccess') return;
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    const keys = await notesOf(session, result.plateLog.id);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^post\.resolve\./);
    session.dispose();
  });

  it('an offline AI (the request cannot be made) changes nothing either', async () => {
    const { fake, session } = await setup();
    fake.error = new TypeError('Failed to fetch');
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
    session.dispose();
  });

  it('a reply that is not the contract leaves the template note', async () => {
    const { fake, session } = await setup();
    fake.jsonBody = chatReply('Sure, here is a note: eat more greens!');
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
    session.dispose();
  });

  it('no yes to coaching: no AI call at all, the template note only', async () => {
    const { fake, session } = await setup({ consent: false });
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.requests).toHaveLength(0);
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
    session.dispose();
  });

  it('No AI: no AI call at all', async () => {
    const { fake, session } = await setup({ configure: false });
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.requests).toHaveLength(0);
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
    session.dispose();
  });

  it('a lock while the AI thinks writes nothing afterwards', async () => {
    const { fake, session } = await setup();
    fake.hang = true;
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    session.dispose();
    await new Promise((r) => setTimeout(r, 30));
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
  });

  it('numbers off: the plate goes without grams and nutrients, and a note with an amount is refused', async () => {
    const { fake, session } = await setup({ numbersOff: true });
    fake.jsonBody = chatReply(
      JSON.stringify({ note: 'About 30 g of protein here.', followUp: '' }),
    );
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const sent = JSON.parse(fake.last.body) as { messages: { content: string }[] };
    expect(sent.messages[1]?.content).toContain('"numbers":false');
    expect(sent.messages[1]?.content).not.toMatch(/kcal|grams/);
    await new Promise((r) => setTimeout(r, 20));
    expect(await notesOf(session, result.plateLog.id)).toHaveLength(1);
    session.dispose();
  });
});

describe('races around the AI note', () => {
  async function gated() {
    const fake = new FakeFetch();
    fake.jsonBody = chatReply(JSON.stringify({ note: NOTE, followUp: 'Do you cook them?' }));
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const bundle = await unlockedBundle();
    await configureByokCoaching(bundle);
    const session = await createSession(bundle, {
      fetch: async (url, init) => {
        await gate;
        return fake.fetch(url, init);
      },
    });
    return { fake, session, open };
  }

  it('Sure tapped while the AI thinks: no AI note and no second follow-up', async () => {
    const { fake, session, open } = await gated();
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    const [template] = await session.notes.forPlate(result.plateLog.id);
    if (template === undefined) throw new Error('no template note');
    await session.coachInteractions.record({ note: template, kind: 'sure' });
    open();
    await new Promise((r) => setTimeout(r, 40));
    expect(fake.requests.length).toBeLessThanOrEqual(1);
    const rows = await session.notes.forPlate(result.plateLog.id);
    expect(rows.some((n) => n.questionKey.startsWith('post.resolve.ai'))).toBe(false);
    expect(rows.filter((n) => n.anchor === 'depthFollowUp').length).toBeLessThanOrEqual(1);
    session.dispose();
  });

  it('a plate removed while the AI thinks leaves no orphan AI rows', async () => {
    const { session, open } = await gated();
    const result = await log(session);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not logged');
    await session.deletePlate(result.plateLog.id);
    open();
    await new Promise((r) => setTimeout(r, 40));
    expect(await session.notes.forPlate(result.plateLog.id)).toEqual([]);
    session.dispose();
  });
});

describe('the Ask the coach conversation follows the destination', () => {
  it('is cleared when coaching is switched off or its destination changes', async () => {
    const { fake, session } = await setup();
    fake.jsonBody = chatReply('Lentils came up twice. Which dish did you like?');
    expect(await session.askCoach.send('Is my week varied?', [])).toBe('answered');
    expect(session.askCoach.getSnapshot().entries).toHaveLength(2);

    await session.ai.coaching.revoke();
    expect(session.askCoach.getSnapshot().entries).toEqual([]);

    await session.ai.coaching.grant();
    expect(await session.askCoach.send('Again?', [])).toBe('answered');
    await session.ai.settings.setByokTarget({
      endpointUrl: 'https://api.elsewhere.test/v1',
      model: 'm',
    });
    expect(session.askCoach.getSnapshot().entries).toEqual([]);
    session.dispose();
  });
});
