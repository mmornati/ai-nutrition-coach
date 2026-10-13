import { describe, expect, it } from 'vitest';
import {
  coachNoteEquals,
  compositionPatternFor,
  createCoachNoteGenerator,
  NO_COACH_QUESTION,
  plateLog,
  type CoachNote,
  type CompositionPattern,
  type FoodGroup,
} from '../src/index';
import { FakeCoach, FakeCoachNoteStore, found, note, plateWith, question, utc } from './helpers';

const G = (group: FoodGroup, name: string) => ({ group, name });

describe('CoachNoteGenerator pattern pick logic', () => {
  it('balanced plate (veg+protein+starch) resolves to balanced', async () => {
    const coach = new FakeCoach().emit(
      found(
        question('postResolve', 'balanced', 'Nice plate — anything you would change next time?'),
      ),
    );
    const store = new FakeCoachNoteStore();
    const gen = createCoachNoteGenerator({ coach, store });
    const plate = plateWith(7, [
      G('vegFruit', 'Salad'),
      G('protein', 'Chicken'),
      G('starch', 'Rice'),
    ]);

    const result = await gen.generateFor(plate);

    expect(result.kind).toBe('coachNoteGenerated');
    if (result.kind !== 'coachNoteGenerated') return;
    expect(result.note.plateLogId).toBe(7);
    expect(result.note.anchor).toBe('postResolve');
    expect(result.note.questionKey).toBe('post.resolve.balanced');
    expect(result.note.text).not.toBe('');
    expect(coach.calls).toEqual([{ anchor: 'postResolve', pattern: 'balanced' }]);
    expect(store.appended).toHaveLength(1);
    expect(store.appended[0]?.plateLogId).toBe(7);
  });

  it('stamps the note with the injected clock', async () => {
    const coach = new FakeCoach().emit(found(question('postResolve', 'balanced')));
    const store = new FakeCoachNoteStore();
    const gen = createCoachNoteGenerator({ coach, store, clock: () => utc(2026, 8, 20, 9) });
    await gen.generateFor(plateWith(1, [G('vegFruit', 'Salad'), G('protein', 'Chicken')]));
    expect(store.appended[0]?.generatedAt).toBe(utc(2026, 8, 20, 9));
  });

  const patternCases: [
    string,
    readonly { group: FoodGroup; name: string }[],
    CompositionPattern,
  ][] = [
    [
      'veg-only plate (2 veg, no protein) resolves to vegRich',
      [G('vegFruit', 'Salad'), G('vegFruit', 'Roasted veg')],
      'vegRich',
    ],
    [
      'protein-heavy plate (3 protein, 1 veg) resolves to proteinHeavy',
      [G('vegFruit', 'Salad'), G('protein', 'Chicken'), G('protein', 'Fish'), G('protein', 'Eggs')],
      'proteinHeavy',
    ],
    [
      'starch-heavy plate (3 starch, 1 veg) resolves to starchHeavy',
      [G('vegFruit', 'Salad'), G('starch', 'Rice'), G('starch', 'Pasta'), G('starch', 'Bread')],
      'starchHeavy',
    ],
    [
      'plate with no veg at all resolves to vegLight',
      [G('protein', 'Chicken'), G('starch', 'Rice')],
      'vegLight',
    ],
    ['single veg entry (no dairy) resolves to dairyLight', [G('vegFruit', 'Salad')], 'dairyLight'],
  ];

  it.each(patternCases)('%s', async (_name, entries, expected) => {
    const coach = new FakeCoach();
    const store = new FakeCoachNoteStore();
    await createCoachNoteGenerator({ coach, store }).generateFor(plateWith(1, entries));
    expect(coach.calls).toHaveLength(1);
    expect(coach.calls[0]?.pattern).toBe(expected);
    expect(compositionPatternFor(plateWith(1, entries))).toBe(expected);
  });

  it('veg plus dairy and a protein is balanced; two groups without dairy is balanced', () => {
    expect(
      compositionPatternFor(plateWith(1, [G('vegFruit', 'a'), G('dairy', 'b'), G('protein', 'c')])),
    ).toBe('balanced');
    expect(compositionPatternFor(plateWith(1, [G('vegFruit', 'a'), G('protein', 'c')]))).toBe(
      'balanced',
    );
  });

  it('only-other-entries returns noCoachNoteGenerated(unknownPattern)', async () => {
    const coach = new FakeCoach();
    const store = new FakeCoachNoteStore();
    const plate = plateWith(1, [G('other', 'Olive oil'), G('other', 'Salt')]);
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(plate);
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'unknownPattern' });
    expect(coach.calls).toEqual([]);
    expect(store.appended).toEqual([]);
  });

  it('empty plate returns noCoachNoteGenerated(emptyPlate) without consulting coach or store', async () => {
    const coach = new FakeCoach();
    const store = new FakeCoachNoteStore();
    const plate = plateLog({ id: 1, loggedAtUtc: utc(2026, 8, 16), entries: [] });
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(plate);
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'emptyPlate' });
    expect(coach.calls).toEqual([]);
    expect(store.appended).toEqual([]);
  });

  it('a missing key (coach says noCoachQuestion) is coachEmpty — no note written', async () => {
    const coach = new FakeCoach().emit(NO_COACH_QUESTION);
    const store = new FakeCoachNoteStore();
    const plate = plateWith(1, [G('vegFruit', 'Salad'), G('protein', 'Chicken')]);
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(plate);
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'coachEmpty' });
    expect(store.appended).toEqual([]);
  });

  it('coach port throwing collapses to coachEmpty', async () => {
    const coach = new FakeCoach();
    coach.throwOnNextCall = true;
    const store = new FakeCoachNoteStore();
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(
      plateWith(1, [G('vegFruit', 'Salad')]),
    );
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'coachEmpty' });
    expect(store.appended).toEqual([]);
  });

  it('store write failure collapses to appendFailed', async () => {
    const coach = new FakeCoach().emit(found(question('postResolve', 'balanced', 'Nice plate.')));
    const store = new FakeCoachNoteStore().forceAppendFailure();
    const plate = plateWith(1, [G('vegFruit', 'Salad'), G('protein', 'Chicken')]);
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(plate);
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'appendFailed' });
    expect(store.appended).toEqual([]);
  });
});

describe('CoachNote value type (FR9)', () => {
  it('round-trips every required field', () => {
    const n = note({
      id: 1,
      plateLogId: 7,
      questionKey: 'post.resolve.balanced',
      text: 'Nice plate.',
    });
    expect(n).toMatchObject({
      id: 1,
      plateLogId: 7,
      anchor: 'postResolve',
      questionKey: 'post.resolve.balanced',
      text: 'Nice plate.',
    });
  });

  it('equality is by id; same id compares equal regardless of text', () => {
    const a = note({ id: 1, text: 'first' });
    const b: CoachNote = { ...a, anchor: 'openPlate', questionKey: 'b', text: 'second' };
    expect(coachNoteEquals(a, b)).toBe(true);
  });

  it('different ids compare not equal', () => {
    expect(coachNoteEquals(note({ id: 1 }), note({ id: 2 }))).toBe(false);
  });

  it('spreading returns a new instance with overridden fields', () => {
    const base = note({ id: 1, text: 'original' });
    const updated = { ...base, text: 'revised', plateLogId: 9 };
    expect(updated).toMatchObject({ text: 'revised', plateLogId: 9, id: 1 });
    expect(base.text).toBe('original');
  });
});

describe('append and generation results', () => {
  it('coachNoteAppended carries the assigned note; failure carries a StoreFailure cause', async () => {
    const store = new FakeCoachNoteStore();
    const ok = await store.append(note({ id: 0 }));
    expect(ok.kind === 'coachNoteAppended' && ok.note.id).toBe(100);
    store.mode = 'fail';
    const bad = await store.append(note());
    expect(bad).toEqual({
      kind: 'coachNoteAppendFailure',
      cause: { kind: 'storeFailure', reason: 'secureKey' },
    });
  });

  it('a THROWING store.append is a typed appendFailed, never a throw', async () => {
    const coach = new FakeCoach().emit(found(question('postResolve', 'dairyLight')));
    const store = new FakeCoachNoteStore();
    store.mode = 'throw';
    const result = await createCoachNoteGenerator({ coach, store }).generateFor(
      plateWith(1, [G('vegFruit', 'x')]),
    );
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'appendFailed' });
  });

  it('a generated note has the default reason "matched"', async () => {
    const coach = new FakeCoach().emit(found(question('postResolve', 'dairyLight')));
    const result = await createCoachNoteGenerator({
      coach,
      store: new FakeCoachNoteStore(),
    }).generateFor(plateWith(1, [G('vegFruit', 'x')]));
    expect(result.kind === 'coachNoteGenerated' && result.reason).toBe('matched');
  });
});
