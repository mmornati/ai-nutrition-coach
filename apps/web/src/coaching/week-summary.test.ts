import { describe, expect, it } from 'vitest';
import {
  COACH_LIMITS,
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  plateLog,
  weeklyReview,
  type PlateLog,
} from '@anc/core';
import { aiText, scriptedCoaching, TEST_NONCE, testReviewGate } from './testing';
import { ReviewGate } from './review';
import { requestWeekSummary, type WeekSummaryDeps } from './week-summary';

const plates: PlateLog[] = [1, 2, 3].map((id) =>
  plateLog({
    id,
    loggedAtUtc: new Date(2026, 9, 14 - id, 12).getTime(),
    entries: [
      {
        id: 1,
        plateLogId: id,
        databaseFood: databaseFood({
          sourceRef: `t:${id}`,
          displayName: 'Salad',
          source: 'manual',
          foodGroup: 'vegFruit',
          nutrientsPer100g: { energyKcal: 20, fibre: 3 },
        }),
        quantity: gramsQuantity(200),
      },
    ],
  }),
);
const review = weeklyReview({
  plates,
  today: new Date(2026, 9, 14, 20).getTime(),
  targets: EU_REFERENCE_INTAKES,
});

const deps = (
  coaching: ReturnType<typeof scriptedCoaching>,
  numbersOn = true,
): WeekSummaryDeps => ({
  coaching,
  numbersOn: () => numbersOn,
  locale: () => 'en',
  targets: () => EU_REFERENCE_INTAKES,
  profile: () => ({ goal: 'eatBetter' }),
  reviews: testReviewGate(),
});

describe('requestWeekSummary', () => {
  it('sends the review, the targets and the profile and returns the validated paragraph', async () => {
    const coaching = scriptedCoaching(() =>
      aiText('Veg came up on every logged day. Which meal made it easiest?'),
    );
    const result = await requestWeekSummary(deps(coaching), review);
    expect(result).toEqual({
      kind: 'text',
      text: 'Veg came up on every logged day. Which meal made it easiest?',
    });
    const user = JSON.parse(coaching.calls[0]?.messages[1]?.content ?? '{}') as Record<
      string,
      unknown
    >;
    expect(user).toMatchObject({ daysLogged: 3, numbers: true, profile: { goal: 'eatBetter' } });
    expect(user['dailyGuide']).toBeDefined();
  });

  it('refuses a paragraph over 600 characters, with a link, banned words or (numbers off) amounts', async () => {
    for (const [bad, numbersOn] of [
      ['a'.repeat(COACH_LIMITS.weekChars + 1), true],
      ['Read https://example.org', true],
      ['Great job this week.', true],
      ['Fibre averaged 9 g a day.', false],
    ] as const) {
      const result = await requestWeekSummary(
        deps(
          scriptedCoaching(() => aiText(bad)),
          numbersOn,
        ),
        review,
      );
      expect(result).toEqual({ kind: 'unsure' });
    }
  });

  it('numbers off: neither averages nor the guide are sent', async () => {
    const coaching = scriptedCoaching(() => aiText('A calm week.'));
    await requestWeekSummary(deps(coaching, false), review);
    const user = coaching.calls[0]?.messages[1]?.content ?? '';
    expect(user).not.toMatch(/dailyAverages|dailyGuide|kcal/);
  });

  it.each([
    [{ kind: 'busy' }, 'busy'],
    [{ kind: 'consentRequired' }, 'consent'],
    [{ kind: 'unavailable' }, 'unavailable'],
    [{ kind: 'failure', message: 'offline' }, 'failure'],
  ] as const)('maps %j to %s', async (reply, kind) => {
    const result = await requestWeekSummary(deps(scriptedCoaching(() => reply)), review);
    expect(result.kind).toBe(kind);
  });

  it('a throwing gate is a calm failure', async () => {
    const result = await requestWeekSummary(
      deps(
        scriptedCoaching(() => {
          throw new Error('boom');
        }),
      ),
      review,
    );
    expect(result.kind).toBe('failure');
  });
});

describe('requestWeekSummary: the second pass', () => {
  const PARA = 'Veg came up on every logged day. Which meal made it easiest?';

  it('is two calls, in order, and the review sees the paragraph and four context values', async () => {
    const coaching = scriptedCoaching(() => aiText(PARA));
    const result = await requestWeekSummary(deps(coaching), review);
    expect(result).toEqual({ kind: 'text', text: PARA });
    expect(coaching.order).toEqual(['main', 'output']);
    expect(coaching.reviewCalls[0]?.messages[1]?.content).toBe(
      [
        'Context:',
        'language: en',
        'weight_talk_allowed: no',
        'daily_guide_kcal: none',
        'floor_kcal: 1200',
        '',
        `<review_text_${TEST_NONCE}>\n${JSON.stringify(PARA)}\n</review_text_${TEST_NONCE}>`,
        '',
        'Reply with exactly one JSON object and nothing else: {"verdict":"ok"} or {"verdict":"unsafe","reason":"<category>"}',
      ].join('\n'),
    );
    expect(JSON.stringify(coaching.reviewCalls[0]?.messages)).not.toMatch(/Salad|daysLogged/);
  });

  it.each([
    ['unsafe', aiText('{"verdict":"unsafe","reason":"fast_loss"}')],
    ['unreadable', aiText('fine')],
    ['a failure', { kind: 'failure', message: 'x' } as const],
    ['a rate limit', { kind: 'busy' } as const],
    ['no consent', { kind: 'consentRequired' } as const],
  ])('a review that is %s: the "not sure" line, nothing of the paragraph', async (_n, reply) => {
    const coaching = scriptedCoaching(() => aiText(PARA), undefined, { output: () => reply });
    expect(await requestWeekSummary(deps(coaching), review)).toEqual({ kind: 'unsure' });
    expect(coaching.order).toEqual(['main', 'output']);
  });

  it('a review that never answers times out: the "not sure" line', async () => {
    const coaching = scriptedCoaching(() => aiText(PARA), undefined, {
      output: () => new Promise(() => undefined),
    });
    expect(await requestWeekSummary({ ...deps(coaching), reviewTimeoutMs: 20 }, review)).toEqual({
      kind: 'unsure',
    });
  });

  it('a rate limit on the coach call is the busy line and no review is sent', async () => {
    const coaching = scriptedCoaching(() => ({ kind: 'busy' }));
    expect((await requestWeekSummary(deps(coaching), review)).kind).toBe('busy');
    expect(coaching.order).toEqual(['main']);
  });

  it('the coach call has a timeout and an abort signal: a call that never answers is a failure', async () => {
    const coaching = scriptedCoaching(() => new Promise(() => undefined));
    const result = await requestWeekSummary({ ...deps(coaching), timeoutMs: 20 }, review);
    expect(result).toEqual({ kind: 'failure', message: '' });
    const signal = coaching.calls[0]?.options?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
    // No review was sent for a paragraph that never came.
    expect(coaching.order).toEqual(['main']);
  });

  it('after the session ends nothing is shown and no review is sent', async () => {
    const lock = new AbortController();
    const gate = new ReviewGate({ nonce: () => TEST_NONCE, signal: lock.signal });
    const coaching = scriptedCoaching(() => {
      lock.abort();
      return aiText(PARA);
    });
    const result = await requestWeekSummary({ ...deps(coaching), reviews: gate }, review);
    expect(result.kind).toBe('failure');
    expect(coaching.order).toEqual(['main']);
  });
});
