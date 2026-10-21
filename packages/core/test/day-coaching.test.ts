import { describe, expect, it } from 'vitest';
import {
  applicablePatterns,
  COACH_TAXONOMY_KEYS,
  compositionPatternFor,
  createCoachNoteGenerator,
  createRecordPlate,
  createTemplateCoach,
  localDayRange,
  localTime,
  openPlatePatternFor,
  plateLog,
  recordPlateSuccess,
  tallyPlate,
  type DatabaseFood,
  type FoodGroup,
  type GroupsOf,
  type PlateLog,
} from '../src/index';
import { FakeCoachNoteStore, FakeStore, note, plateWith } from './helpers';

const G = (group: FoodGroup, name: string) => ({ group, name });
const day = (h: number, m = 0) => localTime(2026, 8, 16, h, m);

const veg = G('vegFruit', 'Salad');
const meat = G('protein', 'Chicken');
const rice = G('starch', 'Rice');
const cheese = G('dairy', 'Cheese');

const breakfastOats = (id = 90) =>
  plateWith(id, [G('starch', 'Oats'), G('dairy', 'Yogurt')], day(8));
const vegBreakfast = (id = 91) =>
  plateWith(id, [G('vegFruit', 'Banana'), G('starch', 'Toast')], day(8));
const proteinLunch = (id = 92) => plateWith(id, [meat, rice], day(13));

describe('breakfast and late slots never nag', () => {
  it('a yogurt-and-oats breakfast with no veg is a simple breakfast, not a veg nudge', () => {
    expect(compositionPatternFor(breakfastOats(1))).toBe('breakfastSimple');
    expect(applicablePatterns(breakfastOats(1))).toEqual(['breakfastSimple']);
  });

  it('breakfast with fruit next to another group is balanced', () => {
    expect(compositionPatternFor(vegBreakfast(1))).toBe('balanced');
  });

  it('breakfast never gets vegLight, proteinMissingDay or dairyLight', () => {
    const lonely = plateWith(1, [rice], day(7));
    expect(applicablePatterns(lonely)).toEqual(['breakfastSimple']);
  });

  it('a late-night plate has nothing to say', () => {
    expect(compositionPatternFor(plateWith(1, [rice], day(23, 30)))).toBeNull();
    expect(compositionPatternFor(plateWith(1, [rice], day(2)))).toBeNull();
  });

  it('the slot boundaries follow local hours (10:59 breakfast, 11:00 lunch)', () => {
    expect(compositionPatternFor(plateWith(1, [rice], day(10, 59)))).toBe('breakfastSimple');
    expect(compositionPatternFor(plateWith(1, [rice], day(11)))).toBe('vegLight');
  });
});

describe('lunch and dinner: the day decides', () => {
  it('suggests veg only when neither the plate nor the day so far has any', () => {
    const lunch = plateWith(1, [meat, rice], day(13));
    expect(compositionPatternFor(lunch)).toBe('vegLight');
    expect(compositionPatternFor(lunch, { dayPlates: [breakfastOats(90)] })).toBe('vegLight');
  });

  it('does not nag about veg once the day already had some', () => {
    const lunch = plateWith(1, [meat, rice], day(13));
    expect(applicablePatterns(lunch, { dayPlates: [vegBreakfast()] })).not.toContain('vegLight');
    // Protein is on the plate and veg was covered: nothing worth saying beyond a calm question.
    expect(compositionPatternFor(lunch, { dayPlates: [vegBreakfast()] })).toBe('balanced');
  });

  it('veg on the plate itself covers the day', () => {
    const lunch = plateWith(1, [veg, meat], day(13));
    expect(applicablePatterns(lunch)).toEqual(['balanced']);
  });

  it('silence is allowed: a single-food plate after a covered day can have nothing to say', () => {
    const snack = plateWith(1, [cheese], day(15));
    const earlier = [
      plateWith(90, [veg, meat], day(8)),
      plateWith(91, [G('dairy', 'Yogurt')], day(9)),
    ];
    expect(compositionPatternFor(snack, { dayPlates: earlier })).toBeNull();
  });

  it('flags a day with no protein at all', () => {
    const lunch = plateWith(1, [veg, rice], day(13));
    expect(compositionPatternFor(lunch)).toBe('proteinMissingDay');
    expect(compositionPatternFor(lunch, { dayPlates: [proteinLunch()] })).toBe('balanced');
  });

  it('a veg-only lunch on a protein-free day is vegRich', () => {
    const lunch = plateWith(1, [veg, G('vegFruit', 'Roasted veg')], day(13));
    expect(compositionPatternFor(lunch)).toBe('vegRich');
    // Protein earlier: the protein ask goes away.
    expect(compositionPatternFor(lunch, { dayPlates: [proteinLunch()] })).toBe('dairyLight');
  });

  it('skewed plates still get their own pattern when they hold some veg', () => {
    const heavyMeat = plateWith(
      1,
      [veg, meat, G('protein', 'Fish'), G('protein', 'Eggs')],
      day(13),
    );
    expect(compositionPatternFor(heavyMeat)).toBe('proteinHeavy');
    const heavyStarch = plateWith(
      1,
      [veg, meat, G('starch', 'Rice'), G('starch', 'Pasta'), G('starch', 'Bread')],
      day(19),
    );
    expect(compositionPatternFor(heavyStarch)).toBe('starchHeavy');
  });

  it('a plate of only `other` foods has nothing to say', () => {
    expect(compositionPatternFor(plateWith(1, [G('other', 'Salt')], day(13)))).toBeNull();
    expect(applicablePatterns(plateWith(1, [G('other', 'Salt')], day(8)))).toEqual([]);
  });

  it('only the plate`s own local day counts as context', () => {
    const yesterdayVeg = plateWith(90, [veg], localTime(2026, 8, 15, 19));
    const lunch = plateWith(1, [meat, rice], day(13));
    expect(compositionPatternFor(lunch, { dayPlates: [yesterdayVeg] })).toBe('vegLight');
  });

  it('the plate itself in dayPlates is not "earlier"', () => {
    const lunch = plateWith(1, [meat, rice], day(13));
    expect(compositionPatternFor(lunch, { dayPlates: [lunch] })).toBe('vegLight');
  });
});

describe('never the same pattern twice in a row', () => {
  it('moves to the next applicable pattern', () => {
    const dinner = plateWith(1, [meat, rice, cheese], day(19));
    expect(applicablePatterns(dinner)).toEqual(['vegLight', 'balanced']);
    expect(compositionPatternFor(dinner)).toBe('vegLight');
    expect(compositionPatternFor(dinner, { previousPattern: 'vegLight' })).toBe('balanced');
  });

  it('falls back to silence when nothing else applies', () => {
    const dinner = plateWith(1, [rice], day(19));
    expect(applicablePatterns(dinner)).toEqual(['vegLight', 'proteinMissingDay', 'dairyLight']);
    const onlyOne = plateWith(2, [meat, rice], day(19));
    expect(applicablePatterns(onlyOne)).toEqual(['vegLight', 'balanced']);
    expect(
      compositionPatternFor(plateWith(3, [meat], day(19)), {
        previousPattern: 'vegLight',
        dayPlates: [vegBreakfast()],
      }),
    ).toBe('dairyLight');
    expect(
      compositionPatternFor(plateWith(3, [meat], day(19)), {
        previousPattern: 'dairyLight',
        dayPlates: [vegBreakfast(), breakfastOats()],
      }),
    ).toBeNull();
  });
});

describe('mixed dishes count in several groups', () => {
  const dishes = new Map<string, readonly FoodGroup[]>([
    ['chicken salad', ['protein', 'vegFruit']],
    ['tomato pasta', ['starch', 'vegFruit']],
  ]);
  const groupsOf: GroupsOf = (food: DatabaseFood) =>
    dishes.get(food.displayName) ?? [food.foodGroup];

  it('tallyPlate counts an entry once in each of its groups', () => {
    const plate = plateWith(1, [G('protein', 'chicken salad'), G('starch', 'Rice')], day(13));
    expect(tallyPlate(plate)).toEqual({ veg: 0, protein: 1, starch: 1, dairy: 0 });
    expect(tallyPlate(plate, groupsOf)).toEqual({ veg: 1, protein: 1, starch: 1, dairy: 0 });
  });

  it('a duplicate group in the resolver result counts once', () => {
    const plate = plateWith(1, [G('protein', 'x')], day(13));
    expect(tallyPlate(plate, () => ['protein', 'protein']).protein).toBe(1);
  });

  it('a chicken salad covers veg: no veg nudge', () => {
    const plate = plateWith(1, [G('protein', 'chicken salad')], day(13));
    expect(compositionPatternFor(plate)).toBe('vegLight');
    expect(compositionPatternFor(plate, { groupsOf })).not.toBe('vegLight');
    expect(applicablePatterns(plate, { groupsOf })).not.toContain('vegLight');
  });

  it('an earlier tomato pasta covers the day`s veg', () => {
    const earlier = plateWith(90, [G('starch', 'tomato pasta')], day(8));
    const lunch = plateWith(1, [meat, rice], day(13));
    expect(compositionPatternFor(lunch, { dayPlates: [earlier] })).toBe('vegLight');
    expect(applicablePatterns(lunch, { dayPlates: [earlier], groupsOf })).not.toContain('vegLight');
  });
});

describe('openPlatePatternFor', () => {
  it('says nothing for breakfast, late, or an empty day', () => {
    expect(
      openPlatePatternFor({
        dayPlates: [rice].map((e) => plateWith(1, [e], day(8))),
        slot: 'breakfast',
      }),
    ).toBeNull();
    expect(
      openPlatePatternFor({ dayPlates: [plateWith(1, [rice], day(8))], slot: 'late' }),
    ).toBeNull();
    expect(openPlatePatternFor({ dayPlates: [], slot: 'lunch' })).toBeNull();
  });

  it('asks about veg when the day so far has none', () => {
    expect(openPlatePatternFor({ dayPlates: [breakfastOats()], slot: 'lunch' })).toBe('vegLight');
  });

  it('asks about protein when veg is covered but protein is not', () => {
    expect(openPlatePatternFor({ dayPlates: [vegBreakfast()], slot: 'dinner' })).toBe(
      'proteinMissingDay',
    );
  });

  it('is hidden when veg and protein are both there', () => {
    expect(
      openPlatePatternFor({ dayPlates: [vegBreakfast(), proteinLunch()], slot: 'dinner' }),
    ).toBeNull();
  });

  it('uses the injected group resolver', () => {
    const all: GroupsOf = () => ['vegFruit', 'protein'];
    expect(
      openPlatePatternFor({ dayPlates: [breakfastOats()], slot: 'lunch', groupsOf: all }),
    ).toBeNull();
  });
});

describe('CoachNoteGenerator with a day', () => {
  const coach = createTemplateCoach((key) =>
    COACH_TAXONOMY_KEYS.includes(key) ? `copy ${key}` : undefined,
  );

  it('writes no veg note on a breakfast and a calm one instead', async () => {
    const store = new FakeCoachNoteStore();
    const gen = createCoachNoteGenerator({ coach, store });
    const result = await gen.generateFor(breakfastOats(1), { dayPlates: [] });
    expect(result.kind === 'coachNoteGenerated' && result.note.questionKey).toBe(
      'post.resolve.breakfastSimple',
    );
  });

  it('is silent (unknownPattern) on a late plate', async () => {
    const store = new FakeCoachNoteStore();
    const gen = createCoachNoteGenerator({ coach, store });
    const result = await gen.generateFor(plateWith(1, [rice], day(23, 40)));
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'unknownPattern' });
    expect(store.appended).toEqual([]);
  });

  it('does not repeat the previous note of the day', async () => {
    const store = new FakeCoachNoteStore();
    const earlier = plateWith(90, [meat, rice], day(12));
    store.seed(
      note({
        id: 1,
        plateLogId: 90,
        questionKey: 'post.resolve.vegLight',
        generatedAt: day(12),
      }),
    );
    const gen = createCoachNoteGenerator({ coach, store });
    const dinner = plateWith(1, [meat, rice, cheese], day(19));
    const result = await gen.generateFor(dinner, { dayPlates: [earlier, dinner] });
    expect(result.kind === 'coachNoteGenerated' && result.note.questionKey).toBe(
      'post.resolve.balanced',
    );
  });

  it('uses the latest note of the day, ignoring depth follow-ups and other days', async () => {
    const store = new FakeCoachNoteStore();
    const a = plateWith(90, [meat], day(9));
    const b = plateWith(91, [meat], day(12));
    store.seed(
      note({ id: 1, plateLogId: 90, questionKey: 'post.resolve.balanced', generatedAt: day(9) }),
    );
    store.seed(
      note({ id: 2, plateLogId: 91, questionKey: 'post.resolve.vegLight', generatedAt: day(12) }),
    );
    store.seed(
      note({
        id: 3,
        plateLogId: 91,
        anchor: 'depthFollowUp',
        questionKey: 'depth.followUp.balanced',
        generatedAt: day(13),
      }),
    );
    const gen = createCoachNoteGenerator({ coach, store });
    const dinner = plateWith(1, [meat, rice, cheese], day(19));
    const result = await gen.generateFor(dinner, { dayPlates: [a, b] });
    expect(result.kind === 'coachNoteGenerated' && result.note.questionKey).toBe(
      'post.resolve.balanced',
    );
  });

  it('a throwing notes lookup is the same as no history', async () => {
    const store = new FakeCoachNoteStore();
    const earlier = plateWith(90, [meat], day(9));
    store.mode = 'throw';
    const gen = createCoachNoteGenerator({ coach, store });
    const result = await gen.generateFor(plateWith(1, [meat, rice], day(13)), {
      dayPlates: [earlier],
    });
    // The append also throws in this mode: a typed failure, never a throw.
    expect(result).toEqual({ kind: 'noCoachNoteGenerated', reason: 'appendFailed' });
  });

  it('applies the injected group resolver', async () => {
    const store = new FakeCoachNoteStore();
    const gen = createCoachNoteGenerator({ coach, store, groupsOf: () => ['protein', 'vegFruit'] });
    const result = await gen.generateFor(plateWith(1, [G('other', 'chicken salad')], day(13)));
    expect(result.kind === 'coachNoteGenerated' && result.note.questionKey).toBe(
      'post.resolve.balanced',
    );
  });
});

describe('RecordPlate gives the coach the plate`s day', () => {
  const coach = createTemplateCoach((key) =>
    COACH_TAXONOMY_KEYS.includes(key) ? `copy ${key}` : undefined,
  );
  const lunch: PlateLog = plateLog({
    id: 5,
    loggedAtUtc: day(13),
    entries: plateWith(5, [meat, rice], day(13)).entries,
  });
  const draft = {
    databaseFood: lunch.entries[0]!.databaseFood,
    quantity: lunch.entries[0]!.quantity,
  };

  it('reads the local day of the plate and writes no veg note when the day had veg', async () => {
    const store = new FakeStore(recordPlateSuccess(lunch));
    store.dayPlates = [vegBreakfast(), lunch];
    const notes = new FakeCoachNoteStore();
    const record = createRecordPlate({
      generator: createCoachNoteGenerator({ coach, store: notes }),
    });
    await record({ entries: [draft], store });
    expect(store.lastRange).toEqual(localDayRange(day(13)));
    expect(notes.appended.map((n) => n.questionKey)).toEqual(['post.resolve.balanced']);
  });

  it('with an unreadable day the plate is judged alone and the log still succeeds', async () => {
    for (const mode of ['fail', 'throw'] as const) {
      const store = new FakeStore(recordPlateSuccess(lunch));
      store.readMode = mode;
      const notes = new FakeCoachNoteStore();
      const record = createRecordPlate({
        generator: createCoachNoteGenerator({ coach, store: notes }),
      });
      const result = await record({ entries: [draft], store });
      expect(result.kind).toBe('recordPlateSuccess');
      expect(notes.appended.map((n) => n.questionKey)).toEqual(['post.resolve.vegLight']);
    }
  });
});
