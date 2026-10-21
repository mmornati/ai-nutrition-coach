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
import { aiText, scriptedCoaching } from './testing';
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
const review = weeklyReview({ plates, targets: EU_REFERENCE_INTAKES });

const deps = (
  coaching: ReturnType<typeof scriptedCoaching>,
  numbersOn = true,
): WeekSummaryDeps => ({
  coaching,
  numbersOn: () => numbersOn,
  locale: () => 'en',
  targets: () => EU_REFERENCE_INTAKES,
  profile: () => ({ goal: 'eatBetter' }),
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
