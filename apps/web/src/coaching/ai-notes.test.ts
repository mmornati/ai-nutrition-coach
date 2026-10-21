// The AI coach note: written after the template note, upgraded in place, and every failure
// (busy, offline, slow, invalid, too long, banned words, links, amounts while numbers are off)
// leaves the template note exactly as it was.
import { describe, expect, it, vi } from 'vitest';
import {
  AI_FOLLOW_UP_QUESTION_KEY,
  AI_NOTE_QUESTION_KEY,
  coachNoteDismissalKey,
  type CoachNote,
  type CoachNoteGenerationResult,
  type CoachNoteGenerator,
  type PlateLog,
} from '@anc/core';
import { at, seedMeasuredPlate, unlockedBundle } from '../app/testing';
import type { StoreBundle } from '../storage';
import { createAiNoteUpgrader, withAiNotes, type AiNoteDeps, type AiNoteOutcome } from './ai-notes';
import {
  aiNote,
  aiText,
  READY_DESTINATION,
  scriptedCoaching,
  type ScriptedCoaching,
} from './testing';

const TARGETS = {
  energyKcal: 2000,
  fat: 70,
  saturatedFat: 20,
  carbohydrate: 260,
  sugars: 90,
  protein: 50,
  salt: 6,
  fibre: 25,
};

async function setup(
  coaching: ScriptedCoaching,
  extra: Partial<AiNoteDeps> = {},
): Promise<{
  bundle: StoreBundle;
  plate: PlateLog;
  template: CoachNote;
  run: () => Promise<AiNoteOutcome>;
  notes: () => Promise<readonly CoachNote[]>;
}> {
  const bundle = await unlockedBundle();
  const plate = await seedMeasuredPlate(bundle, at(12, 30), [
    {
      name: 'Pasta',
      group: 'starch',
      grams: 220,
      per100g: { energyKcal: 150, protein: 5, carbohydrate: 30 },
    },
  ]);
  const appended = await bundle.notes.append({
    id: 0,
    plateLogId: plate.id,
    anchor: 'postResolve',
    questionKey: 'post.resolve.vegLight',
    text: 'A handful of greens would round this plate out.',
    generatedAt: at(12, 31),
  });
  if (appended.kind !== 'coachNoteAppended') throw new Error('could not seed the template note');
  const upgrader = createAiNoteUpgrader({
    coaching,
    notes: bundle.notes,
    numbersOn: () => true,
    locale: () => 'en',
    targets: () => TARGETS,
    profile: () => ({ diet: 'vegetarian', allergies: ['peanut'] }),
    naming: { nameOf: (f) => f.displayName },
    live: () => true,
    timeoutMs: 40,
    ...extra,
  });
  return {
    bundle,
    plate,
    template: appended.note,
    run: () => upgrader.upgrade({ plate, dayPlates: [plate], template: appended.note }),
    notes: () => bundle.notes.forPlate(plate.id),
  };
}

const GOOD = 'Pasta with a little veg on the side would round this lunch out. What do you have in?';

describe('AI coach note: the upgrade', () => {
  it('appends the AI note (and its follow-up) next to the template note', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD, 'Do you like roasted vegetables?'));
    const t = await setup(coaching);
    expect(await t.run()).toBe('upgraded');
    const notes = await t.notes();
    expect(notes.map((n) => [n.anchor, n.questionKey])).toEqual([
      ['postResolve', 'post.resolve.vegLight'],
      ['postResolve', AI_NOTE_QUESTION_KEY],
      ['depthFollowUp', AI_FOLLOW_UP_QUESTION_KEY],
    ]);
    expect(notes[1]?.text).toBe(GOOD);
    expect(notes[2]?.text).toBe('Do you like roasted vegetables?');
    // The template note is untouched.
    expect(notes[0]).toEqual(t.template);
  });

  it('asks for a short, warm completion and sends the plate, the day and the profile', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD));
    const t = await setup(coaching);
    await t.run();
    const call = coaching.calls[0];
    expect(call?.options).toMatchObject({ maxTokens: 220 });
    const [system, user] = call?.messages ?? [];
    expect(system?.role).toBe('system');
    const data = JSON.parse(user?.content ?? '{}') as {
      slot: string;
      plate: { foods: { name: string; grams: number }[] };
      profile: { diet: string };
      templateHint: string;
    };
    expect(data.slot).toBe('lunch');
    expect(data.plate.foods[0]).toMatchObject({ name: 'Pasta', grams: 220 });
    expect(data.profile.diet).toBe('vegetarian');
    expect(data.templateHint).toBe('vegLight');
  });

  it('a note without a follow-up stores no follow-up row', async () => {
    const t = await setup(scriptedCoaching(() => aiNote(GOOD)));
    expect(await t.run()).toBe('upgraded');
    expect((await t.notes()).map((n) => n.anchor)).toEqual(['postResolve', 'postResolve']);
  });

  it.each([
    ['busy', { kind: 'busy' }],
    ['unavailable', { kind: 'unavailable' }],
    ['a failure', { kind: 'failure', message: 'offline' }],
    ['no consent', { kind: 'consentRequired' }],
  ] as const)('%s: the template note stands, silently', async (_name, result) => {
    const t = await setup(scriptedCoaching(() => result));
    expect(await t.run()).toBe('aiFailed');
    expect(await t.notes()).toEqual([t.template]);
  });

  it('a throwing gate is a silent fallback too', async () => {
    const coaching = scriptedCoaching(() => {
      throw new Error('boom');
    });
    const t = await setup(coaching);
    expect(await t.run()).toBe('aiFailed');
    expect(await t.notes()).toEqual([t.template]);
  });

  it('too slow (past the timeout): the template note stands and the late answer is dropped', async () => {
    let release: (() => void) | undefined;
    const coaching = scriptedCoaching(
      () =>
        new Promise((resolve) => {
          release = () => resolve(aiNote(GOOD));
        }),
    );
    const t = await setup(coaching);
    expect(await t.run()).toBe('timedOut');
    release?.();
    await new Promise((r) => setTimeout(r, 10));
    expect(await t.notes()).toEqual([t.template]);
    // The call was cancelled through its signal.
    expect(coaching.calls[0]?.options?.signal?.aborted).toBe(true);
  });

  it.each([
    ['not JSON', aiText('Here is a note for you.')],
    ['a JSON array', aiText('[{"note":"hi"}]')],
    ['a missing note', aiText('{"followUp":"Hm?"}')],
    ['too long (over 280)', aiNote('a'.repeat(281))],
    ['an exclamation mark', aiNote('A lovely plate!')],
    ['a link', aiNote('Read more at https://example.org about pasta.')],
    ['pressure vocabulary', aiNote('Keep your streak going with some greens.')],
    ['over-budget framing', aiNote('That put you over budget for the day.')],
    ['a medical claim', aiNote('Fibre can cure tiredness and diagnose gaps.')],
    ['two questions', aiNote('Any greens in? Or some fruit?')],
  ])('%s: invalid, the template note stands', async (_name, result) => {
    const t = await setup(scriptedCoaching(() => result));
    expect(await t.run()).toBe('invalid');
    expect(await t.notes()).toEqual([t.template]);
  });

  it('a bad follow-up costs only the follow-up', async () => {
    const t = await setup(scriptedCoaching(() => aiNote(GOOD, 'Try https://example.org?')));
    expect(await t.run()).toBe('upgraded');
    expect((await t.notes()).map((n) => n.anchor)).toEqual(['postResolve', 'postResolve']);
  });

  it('numbers off: the prompt carries no amounts, and a note quoting one is refused', async () => {
    const coaching = scriptedCoaching(() => aiNote('About 48 g of carbohydrate in this plate.'));
    const t = await setup(coaching, { numbersOn: () => false });
    expect(await t.run()).toBe('invalid');
    const user = coaching.calls[0]?.messages[1]?.content ?? '';
    expect(user).not.toMatch(/kcal|"grams"|nutrients|dailyGuide/);
    expect(JSON.parse(user)).toMatchObject({ numbers: false });
    expect(await t.notes()).toEqual([t.template]);
    // A note with no amount is fine while numbers are off.
    const ok = await setup(
      scriptedCoaching(() => aiNote(GOOD)),
      { numbersOn: () => false },
    );
    expect(await ok.run()).toBe('upgraded');
  });

  it('the French interface sends the French system prompt', async () => {
    const coaching = scriptedCoaching(() => aiNote('Quelques légumes compléteraient ce repas.'));
    const t = await setup(coaching, { locale: () => 'fr' });
    await t.run();
    expect(coaching.calls[0]?.messages[0]?.content).toContain('Répondez en français');
  });

  it('is not ready (no consent or no AI): nothing is asked at all', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD), {
      kind: 'needsConsent',
      destination: READY_DESTINATION,
    });
    const t = await setup(coaching);
    expect(await t.run()).toBe('notReady');
    expect(coaching.calls).toHaveLength(0);
    const off = await setup(scriptedCoaching(() => aiNote(GOOD), { kind: 'noAi' }));
    expect(await off.run()).toBe('notReady');
  });

  it('a template note the person already dismissed is not swapped', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD));
    const t = await setup(coaching);
    await t.bundle.notes.recordDismissal(coachNoteDismissalKey(t.template.id));
    expect(await t.run()).toBe('dismissed');
    expect(coaching.calls).toHaveLength(0);
  });

  it('a person who already opened the follow-up is not interrupted', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD));
    const t = await setup(coaching);
    await t.bundle.notes.append({
      id: 0,
      plateLogId: t.plate.id,
      anchor: 'depthFollowUp',
      questionKey: 'depth.followUp.vegLight',
      text: 'x',
      generatedAt: at(12, 32),
    });
    expect(await t.run()).toBe('alreadyFollowedUp');
    expect(coaching.calls).toHaveLength(0);
  });

  it('writes nothing once the session has ended', async () => {
    let live = true;
    const t = await setup(
      scriptedCoaching(() => {
        live = false;
        return aiNote(GOOD);
      }),
      { live: () => live },
    );
    expect(await t.run()).toBe('sessionEnded');
    expect(await t.notes()).toEqual([t.template]);
  });

  it('a note that is dismissed while the AI thinks is not added', async () => {
    let templateId = 0;
    const holder: { bundle?: StoreBundle } = {};
    const t = await setup(
      scriptedCoaching(async () => {
        await holder.bundle?.notes.recordDismissal(coachNoteDismissalKey(templateId));
        return aiNote(GOOD);
      }),
    );
    holder.bundle = t.bundle;
    templateId = t.template.id;
    expect(await t.run()).toBe('dismissed');
    expect(await t.notes()).toEqual([t.template]);
  });
});

describe('withAiNotes: the log never waits for the AI', () => {
  it('returns the template result at once and upgrades afterwards', async () => {
    let release: (() => void) | undefined;
    const coaching = scriptedCoaching(
      () =>
        new Promise((resolve) => {
          release = () => resolve(aiNote(GOOD));
        }),
    );
    const t = await setup(coaching, { timeoutMs: 5000 });
    const templateResult: CoachNoteGenerationResult = {
      kind: 'coachNoteGenerated',
      note: t.template,
      reason: 'matched',
    };
    const base: CoachNoteGenerator = { generateFor: async () => templateResult };
    const outcomes: AiNoteOutcome[] = [];
    const upgrader = createAiNoteUpgrader({
      coaching,
      notes: t.bundle.notes,
      numbersOn: () => true,
      locale: () => 'en',
      targets: () => TARGETS,
      profile: () => undefined,
      naming: { nameOf: (f) => f.displayName },
      live: () => true,
      timeoutMs: 5000,
    });
    const generator = withAiNotes(base, upgrader, (o) => outcomes.push(o));

    const result = await generator.generateFor(t.plate, { dayPlates: [t.plate] });
    // Returned while the AI call is still pending: the template note is all there is.
    expect(result).toBe(templateResult);
    expect(await t.notes()).toEqual([t.template]);
    expect(outcomes).toEqual([]);

    await vi.waitFor(() => expect(release).toBeDefined());
    release?.();
    await vi.waitFor(() => expect(outcomes).toEqual(['upgraded']));
    expect(outcomes).toEqual(['upgraded']);
    expect((await t.notes()).map((n) => n.questionKey)).toContain(AI_NOTE_QUESTION_KEY);
  });

  it('a plate with no template note gets no AI call (silence stays silence)', async () => {
    const coaching = scriptedCoaching(() => aiNote(GOOD));
    const t = await setup(coaching);
    const base: CoachNoteGenerator = {
      generateFor: async () => ({ kind: 'noCoachNoteGenerated', reason: 'unknownPattern' }),
    };
    const upgrader = createAiNoteUpgrader({
      coaching,
      notes: t.bundle.notes,
      numbersOn: () => true,
      locale: () => 'en',
      targets: () => TARGETS,
      profile: () => undefined,
      naming: { nameOf: (f) => f.displayName },
      live: () => true,
    });
    await withAiNotes(base, upgrader).generateFor(t.plate, {});
    await new Promise((r) => setTimeout(r, 10));
    expect(coaching.calls).toHaveLength(0);
  });
});
