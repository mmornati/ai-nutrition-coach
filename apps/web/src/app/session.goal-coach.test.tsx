// The goal-aware AI coach, end to end through a real session (lot 6, item 5): what is sent in each
// mode (the pinned field lists live in the core tests), the separate weight-trend switch behind the
// coaching consent, and the answers that talk about weight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatReply, FakeFetch } from '../ai/testing';
import { configureByokCoaching } from '../coaching/testing';
import { KV_KEYS } from '../storage';
import { createSession, type Session } from './session';
import { at, seedMeasuredPlate, unlockedBundle } from './testing';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

const PROFILE = {
  ageBand: '30-49',
  sex: 'female',
  activity: 'moderate',
  goal: 'lose',
  heightCm: 165,
};

async function setup(
  options: {
    goal?: string;
    consent?: boolean;
    reply?: string;
    profile?: Record<string, unknown>;
    latestKg?: number;
  } = {},
) {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(
    options.reply ??
      'Most of your energy came from the pizza. Would a smaller portion of it suit you next time?',
  );
  const bundle = await unlockedBundle();
  await configureByokCoaching(bundle, { consent: options.consent ?? true });
  await bundle.kv.write(
    KV_KEYS.profile,
    JSON.stringify({ ...PROFILE, goal: options.goal ?? 'lose', ...options.profile }),
  );
  for (const offset of [-1, -2, -3, -4]) {
    await seedMeasuredPlate(bundle, at(12, 0, offset), [
      {
        name: 'Pizza',
        group: 'starch',
        grams: 400,
        per100g: { energyKcal: 250, protein: 10, fibre: 2, salt: 0.5, sugars: 2 },
      },
    ]);
    await seedMeasuredPlate(bundle, at(19, 0, offset), [
      {
        name: 'Salad',
        group: 'vegFruit',
        grams: 300,
        per100g: { energyKcal: 30, protein: 2, fibre: 3, salt: 0.1, sugars: 3 },
      },
    ]);
  }
  const session = await createSession(bundle, { fetch: fake.fetch });
  // Weigh-ins over five weeks: the four-week trend is about a kilo lower.
  for (const [offset, kg] of [
    [-35, 72],
    [-21, 71.4],
    [-7, 71.0],
    [-1, options.latestKg ?? 70.8],
  ] as const) {
    const when = at(8, 0, offset);
    await session.profile.record('weight', kg, when, new Date(when).toISOString().slice(0, 10));
  }
  return { fake, bundle, session };
}

const weekPlates = async (session: Session) => {
  const read = await session.store.readRange({});
  if (read.kind !== 'platesRead') throw new Error('read');
  return read.plates;
};
const doc = (call: string) => {
  const body = JSON.parse(call) as { messages: { content: string }[] };
  const data = body.messages[1]!.content;
  return {
    system: body.messages[0]!.content,
    data: JSON.parse(data.slice(data.indexOf('{'))) as Record<string, unknown>,
  };
};

describe('a lose goal: the coach may help, within limits', () => {
  it('the system prompt allows weight talk; the answer about weight loss is shown', async () => {
    const { fake, session } = await setup({
      reply:
        'Most of your energy came from the pizza. Would a smaller portion, or a swap with extra vegetables, help you lose weight at a gentle pace?',
    });
    const outcome = await session.askCoach.send(
      'how do I lose weight with what I eat?',
      await weekPlates(session),
    );
    expect(outcome).toBe('answered');
    const { system, data } = doc(fake.last.body);
    expect(system).toContain('chose the goal of losing weight, so you MAY help');
    expect(data['profile']).toMatchObject({ goal: 'lose' });
    // The week's energy against the rounded guide, and the foods that carried it.
    expect(data['weekEnergy']).toMatchObject({ days: 4 });
    expect(data['topEnergyFoods']).toEqual(['Pizza', 'Salad']);
  });

  it('the weight trend is NOT sent by default, even with the coaching consent', async () => {
    const { fake, session } = await setup();
    await session.askCoach.send('how am I doing?', await weekPlates(session));
    const { data } = doc(fake.last.body);
    expect(data['weightTrend']).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/70\.8|72|kg/);
  });

  it('with the separate switch on, only a coarse direction and rounded change are sent', async () => {
    const { fake, session } = await setup();
    await session.trendShare.set(true);
    await session.askCoach.send('how am I doing?', await weekPlates(session));
    const { system, data } = doc(fake.last.body);
    expect(data['weightTrend']).toEqual({
      direction: 'lower',
      changeKg: expect.any(Number),
      overWeeks: 4,
    });
    expect((data['weightTrend'] as { changeKg: number }).changeKg % 0.5).toBe(0);
    expect(system).toContain('"weightTrend"');
    // Never a raw weigh-in, a height, a BMI or a waist.
    expect(fake.last.body).not.toMatch(/71\.4|71\.0|70\.8|165|bmi|waist/i);
  });

  it('turning coaching off turns the trend switch off with it, and it stays off', async () => {
    const { session } = await setup();
    await session.trendShare.set(true);
    expect(session.trendShare.enabled()).toBe(true);
    await session.ai.coaching.revoke();
    await vi.waitFor(() => expect(session.trendShare.enabled()).toBe(false));
    await session.ai.coaching.grant();
    expect(session.trendShare.enabled()).toBe(false);
  });
});

describe('the weight trend is sent only while weight help is allowed (item 4)', () => {
  const trendOf = async (options: Parameters<typeof setup>[0]) => {
    const { fake, session } = await setup(options);
    await session.trendShare.set(true);
    expect(session.trendShare.enabled()).toBe(true);
    await session.askCoach.send('how am I doing?', await weekPlates(session));
    const { system, data } = doc(fake.last.body);
    return { trend: data['weightTrend'], system };
  };

  it('a lose goal that no safeguard holds: sent', async () => {
    const { trend, system } = await trendOf({});
    expect(trend).toMatchObject({ direction: 'lower' });
    expect(system).toContain('"weightTrend"');
  });

  it.each([
    ['a gain goal with a BMI of 30 or more (no surplus)', { goal: 'gain', latestKg: 90 }],
    ['pregnancy or breastfeeding', { profile: { pregnantOrBreastfeeding: true } }],
    ['an underweight BMI', { latestKg: 45 }],
    ['65 and over', { profile: { ageBand: '65+' } }],
    ['no height (the body is unknown)', { profile: { heightCm: undefined } }],
    ['no weight goal at all', { goal: 'eatBetter' }],
  ] as const)('%s: not sent, even with the switch on', async (_name, options) => {
    const { trend, system } = await trendOf(options as Parameters<typeof setup>[0]);
    expect(trend).toBeUndefined();
    expect(system).not.toContain('"weightTrend"');
  });
});

describe('no weight goal keeps today’s restraint', () => {
  it('the prompt does not push weight loss and an answer about it is not shown', async () => {
    const { fake, session } = await setup({
      goal: 'eatBetter',
      reply: 'To lose weight, a smaller portion of the pizza would help. Would that suit you?',
    });
    const outcome = await session.askCoach.send(
      'how do I lose weight with what I eat?',
      await weekPlates(session),
    );
    expect(outcome).toBe('unsure');
    const state = session.askCoach.getSnapshot();
    expect(state.entries.at(-1)).toMatchObject({ kind: 'unsure', weight: true });
    const { system } = doc(fake.last.body);
    expect(system).toContain('has not chosen a weight goal');
    expect(system).not.toContain('MAY help');
  });

  it('a request for a very fast loss is answered on the device and never sent', async () => {
    const { fake, session } = await setup();
    const before = fake.requests.length;
    expect(
      await session.askCoach.send('I want to lose 5 kg in a week', await weekPlates(session)),
    ).toBe('support');
    expect(
      await session.askCoach.send(
        'Comment manger 800 calories par jour ?',
        await weekPlates(session),
      ),
    ).toBe('support');
    expect(fake.requests.length).toBe(before);
    expect(
      session.askCoach
        .getSnapshot()
        .entries.filter((e) => e.role === 'assistant' && e.kind === 'support'),
    ).toHaveLength(2);
  });

  it('harmful advice is refused even for someone who chose to lose weight', async () => {
    const { session } = await setup({ reply: 'You could skip dinner and eat 900 kcal a day.' });
    expect(await session.askCoach.send('what should I change?', await weekPlates(session))).toBe(
      'unsure',
    );
  });
});
