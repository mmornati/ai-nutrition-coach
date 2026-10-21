// Ask the coach, without a screen: safety routing before any call, limits, validation of answers,
// numbers off, the in-memory-only conversation.
import { describe, expect, it } from 'vitest';
import {
  COACH_LIMITS,
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  plateLog,
  type PlateLog,
} from '@anc/core';
import { AskCoachConversation, type AskCoachDeps } from './ask-coach';
import { aiText, scriptedCoaching, type ScriptedCoaching } from './testing';

const plates: PlateLog[] = [
  plateLog({
    id: 1,
    loggedAtUtc: new Date(2026, 9, 13, 12).getTime(),
    entries: [
      {
        id: 1,
        plateLogId: 1,
        databaseFood: databaseFood({
          sourceRef: 't:1',
          displayName: 'Lentils',
          source: 'manual',
          foodGroup: 'protein',
          nutrientsPer100g: { energyKcal: 120, protein: 9, fibre: 8 },
        }),
        quantity: gramsQuantity(200),
      },
    ],
  }),
];

function chat(coaching: ScriptedCoaching, extra: Partial<AskCoachDeps> = {}) {
  return new AskCoachConversation({
    coaching,
    numbersOn: () => true,
    locale: () => 'en',
    targets: () => EU_REFERENCE_INTAKES,
    profile: () => ({ diet: 'vegan' }),
    naming: { nameOf: (f) => f.displayName },
    live: () => true,
    ...extra,
  });
}

const ANSWER = 'Lentils showed up on one day. Would you like ideas for other days?';

describe('Ask the coach: safety first', () => {
  it.each([
    ['I binge at night and I purge afterwards', 'eatingWorry'],
    ['I have been starving myself all week', 'eatingWorry'],
    ['je me fais vomir après chaque repas', 'eatingWorry'],
    ['J’ai des crises de boulimie', 'eatingWorry'],
    ['I get chest pain after eating', 'medicalSymptom'],
    ['J’ai eu un malaise après le déjeuner', 'medicalSymptom'],
  ])('routes %s to the support line and never calls the AI', async (text, signal) => {
    const coaching = scriptedCoaching(() => aiText(ANSWER));
    const c = chat(coaching);
    expect(await c.send(text, plates)).toBe('support');
    expect(coaching.calls).toHaveLength(0);
    const last = c.getSnapshot().entries.at(-1);
    expect(last).toMatchObject({ role: 'assistant', kind: 'support', signal });
    // It counts as a question of this conversation but is never sent to the AI afterwards.
    expect(c.getSnapshot().asked).toBe(1);
    await c.send('What could I eat with lentils?', plates);
    const sent = coaching.calls[0]?.messages ?? [];
    expect(JSON.stringify(sent)).not.toMatch(/binge|starving|vomir|boulimie|chest pain|malaise/i);
  });
});

describe('Ask the coach: a question and its answer', () => {
  it('sends the seven days, the targets, the profile and the question, and shows the answer', async () => {
    const coaching = scriptedCoaching(() => aiText(ANSWER));
    const c = chat(coaching);
    expect(await c.send('  Is my week   varied? ', plates)).toBe('answered');
    const messages = coaching.calls[0]?.messages ?? [];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[1]?.content).toBe('Is my week varied?');
    expect(messages[0]?.content).toContain('"Lentils"');
    expect(messages[0]?.content).toContain('"vegan"');
    expect(c.getSnapshot().entries.map((e) => e.role)).toEqual(['user', 'assistant']);
    expect(c.getSnapshot().entries[1]).toMatchObject({ kind: 'answer', text: ANSWER });
    expect(c.getSnapshot().pending).toBeNull();
  });

  it('keeps the conversation: the second call carries the first turn', async () => {
    const coaching = scriptedCoaching(() => aiText(ANSWER));
    const c = chat(coaching);
    await c.send('First question?', plates);
    await c.send('Second question?', plates);
    expect(coaching.calls[1]?.messages.map((m) => [m.role, m.content])).toEqual([
      ['system', expect.any(String)],
      ['user', 'First question?'],
      ['assistant', ANSWER],
      ['user', 'Second question?'],
    ]);
  });

  it('refuses an empty question and one over 500 characters without a call', async () => {
    const coaching = scriptedCoaching(() => aiText(ANSWER));
    const c = chat(coaching);
    expect(await c.send('   ', plates)).toBe('empty');
    expect(await c.send('a'.repeat(COACH_LIMITS.inputChars + 1), plates)).toBe('tooLong');
    expect(await c.send('a'.repeat(COACH_LIMITS.inputChars), plates)).toBe('answered');
    expect(coaching.calls).toHaveLength(1);
  });

  it('stops after 6 questions, and a new conversation starts again', async () => {
    const coaching = scriptedCoaching(() => aiText(ANSWER));
    const c = chat(coaching);
    for (let i = 0; i < COACH_LIMITS.chatTurns; i++) {
      expect(await c.send(`Question ${i}?`, plates)).toBe('answered');
    }
    expect(c.getSnapshot().limitReached).toBe(true);
    expect(await c.send('One more?', plates)).toBe('limit');
    expect(coaching.calls).toHaveLength(COACH_LIMITS.chatTurns);
    c.reset();
    expect(c.getSnapshot()).toMatchObject({ entries: [], asked: 0, limitReached: false });
    expect(await c.send('Fresh start?', plates)).toBe('answered');
  });

  it('an answer that does not pass the checks is dropped, not shown', async () => {
    for (const bad of [
      'Great job! Keep your streak going.',
      'See https://example.org for more',
      'This can cure low energy.',
      'a'.repeat(COACH_LIMITS.answerChars + 1),
      'One? Two? Three?',
    ]) {
      const c = chat(scriptedCoaching(() => aiText(bad)));
      expect(await c.send('Is my week varied?', plates)).toBe('unsure');
      expect(c.getSnapshot().entries[1]).toEqual({
        id: expect.any(Number),
        role: 'assistant',
        kind: 'unsure',
      });
      expect(JSON.stringify(c.getSnapshot())).not.toContain(bad.slice(0, 20));
    }
  });

  it('numbers off: no amounts in the document sent, and an answer with one is dropped', async () => {
    const coaching = scriptedCoaching(() => aiText('You had about 18 g of fibre.'));
    const c = chat(coaching, { numbersOn: () => false });
    expect(await c.send('How much fibre?', plates)).toBe('unsure');
    const system = coaching.calls[0]?.messages[0]?.content ?? '';
    expect(system).not.toMatch(/"kcal"|"fibre_g"|dailyGuide|"grams"/);
  });

  it('busy, failure, no AI and no consent leave the question to send again', async () => {
    const results = [
      [{ kind: 'busy' }, 'busy'],
      [{ kind: 'failure', message: 'the provider could not be reached' }, 'failure'],
      [{ kind: 'unavailable' }, 'unavailable'],
      [{ kind: 'consentRequired' }, 'consent'],
    ] as const;
    for (const [result, outcome] of results) {
      const c = chat(scriptedCoaching(() => result));
      expect(await c.send('Is my week varied?', plates)).toBe(outcome);
      const s = c.getSnapshot();
      expect(s.entries).toEqual([]);
      expect(s.asked).toBe(0);
      expect(s.pending).toBeNull();
      expect(s.notice).toMatchObject({ kind: outcome });
    }
  });

  it('a second question while one is being answered is not sent', async () => {
    let release: (() => void) | undefined;
    const coaching = scriptedCoaching(
      () =>
        new Promise((resolve) => {
          release = () => resolve(aiText(ANSWER));
        }),
    );
    const c = chat(coaching);
    const first = c.send('First?', plates);
    expect(c.getSnapshot().pending).toBe('First?');
    expect(await c.send('Second?', plates)).toBe('busy');
    release?.();
    await first;
    expect(coaching.calls).toHaveLength(1);
  });

  it('an answer that lands after a new conversation started is dropped', async () => {
    let release: (() => void) | undefined;
    const coaching = scriptedCoaching(
      () =>
        new Promise((resolve) => {
          release = () => resolve(aiText(ANSWER));
        }),
    );
    const c = chat(coaching);
    const pending = c.send('First?', plates);
    c.reset();
    release?.();
    await pending;
    expect(c.getSnapshot().entries).toEqual([]);
  });

  it('is in memory only: it has no store, and the text is not in a stringified view', async () => {
    const c = chat(scriptedCoaching(() => aiText(ANSWER)));
    await c.send('Is my week varied?', plates);
    expect(String(c)).toBe('AskCoachConversation(1 questions)');
    expect(String(c)).not.toContain('varied');
  });

  it('notifies subscribers', async () => {
    const c = chat(scriptedCoaching(() => aiText(ANSWER)));
    let calls = 0;
    const stop = c.subscribe(() => {
      calls += 1;
    });
    await c.send('Is my week varied?', plates);
    expect(calls).toBeGreaterThanOrEqual(2);
    stop();
  });
});
