// The session's part of "log this again": a plate recorded at a given time, a copied day coached
// once (the last plate), and the recipes that join the food search.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, draft, unlockedBundle } from './testing';
import { createSession } from './session';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 9, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Session.recordPlate at a given time', () => {
  it('lands the plate at that instant, through the normal path (a coach note is written)', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const when = at(19, 30, -2);
    const result = await session.recordPlate([draft('Chicken', 'protein')], when);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not recorded');
    expect(result.plateLog.loggedAtUtc).toBe(when);
    expect((await session.notes.forPlate(result.plateLog.id)).length).toBe(1);
    session.dispose();
  });
});

describe('Session.recordPlates (copying a day)', () => {
  const plateOf = (name: string, group: 'starch' | 'protein' | 'vegFruit', h: number, m = 0) => ({
    entries: [draft(name, group)],
    loggedAtUtc: at(h, m),
  });
  const bad = (h: number) => ({
    entries: [
      {
        ...draft('Chicken', 'protein'),
        quantity: { low: 2, high: 1, unit: 'x', displayLabel: 'x' },
      },
    ],
    loggedAtUtc: at(h),
  });
  const noteCounts = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) => {
    const read = await bundle.store.readRange();
    if (read.kind !== 'platesRead') throw new Error('read failed');
    const byTime = [...read.plates].sort((a, b) => a.loggedAtUtc - b.loggedAtUtc);
    return Promise.all(
      byTime.map(
        async (p) =>
          [
            p.entries[0]?.databaseFood.displayName,
            (await bundle.notes.forPlate(p.id)).length,
          ] as const,
      ),
    );
  };

  it('records every plate in order and coaches only the last: one calm note for the batch', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const outcome = await session.recordPlates([
      plateOf('Toast', 'starch', 7, 45),
      plateOf('Chicken', 'protein', 12, 30),
      plateOf('Salad', 'vegFruit', 19),
    ]);
    expect(outcome).toMatchObject({ recorded: 3, failed: 0, failedPlates: [] });
    expect(await noteCounts(bundle)).toEqual([
      ['Toast', 0],
      ['Chicken', 0],
      ['Salad', 1],
    ]);
    session.dispose();
  });

  it('marks the device as having changes (one flag, not one op per plate) once it is connected to a relay', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    session.syncQueue.setConnected(true);
    await session.recordPlates([
      plateOf('Toast', 'starch', 7, 45),
      plateOf('Chicken', 'protein', 12, 30),
      plateOf('Salad', 'vegFruit', 19),
    ]);
    expect(session.syncQueue.dirty).toBe(true);
    expect(await session.syncQueue.pending()).toHaveLength(1);
    session.dispose();
  });

  it('a failure mid-batch does not stop the others: the note goes to the last plate that landed, and the failed one is handed back', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const middle = bad(12);
    const outcome = await session.recordPlates([
      plateOf('Toast', 'starch', 7, 45),
      middle,
      plateOf('Salad', 'vegFruit', 19),
    ]);
    expect(outcome.recorded).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.failedPlates).toEqual([middle]);
    expect(await noteCounts(bundle)).toEqual([
      ['Toast', 0],
      ['Salad', 1],
    ]);
    session.dispose();
  });

  it('when the LAST plate fails, the previous plate that landed is the one coached', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const outcome = await session.recordPlates([
      plateOf('Toast', 'starch', 7, 45),
      plateOf('Chicken', 'protein', 12, 30),
      bad(19),
    ]);
    expect(outcome).toMatchObject({ recorded: 2, failed: 1 });
    expect(await noteCounts(bundle)).toEqual([
      ['Toast', 0],
      ['Chicken', 1],
    ]);
    session.dispose();
  });

  it('with every plate failing nothing is coached and every plate is handed back', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const outcome = await session.recordPlates([bad(8), bad(12)]);
    expect(outcome).toMatchObject({ recorded: 0, failed: 2 });
    expect(outcome.failedPlates).toHaveLength(2);
    session.dispose();
  });

  it('is nothing to do for an empty batch', async () => {
    const session = await createSession(await unlockedBundle());
    expect(await session.recordPlates([])).toEqual({ recorded: 0, failed: 0, failedPlates: [] });
    session.dispose();
  });
});

describe('Session.dispose', () => {
  it('forgets the recipes it read, so a new search after a dispose would read them again', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    await session.catalog.search('rice');
    const reads = vi.spyOn(bundle.saved, 'listRecipes');
    session.dispose();
    await session.catalog.search('rice');
    expect(reads).toHaveBeenCalledTimes(1);
  });
});

describe('Session.saved and recipes in the food search', () => {
  it('a recipe saved through the session shows up in the next search, and is gone once deleted', async () => {
    const session = await createSession(await unlockedBundle());
    const rice = await session.catalog.search('rice');
    const ricePick = rice.kind === 'rankedMatches' ? rice.matches[0] : undefined;
    if (ricePick === undefined) throw new Error('no rice in the seeds');
    const saved = await session.saved.saveRecipe({
      name: 'Zucchini rice bake',
      servings: 2,
      cookedWeightGrams: 500,
      ingredients: [
        {
          databaseFood: ricePick.food,
          quantity: { low: 200, high: 200, unit: 'g', displayLabel: '200 g', grams: 200 },
        },
      ],
    });
    if (saved.kind !== 'saved') throw new Error('not saved');

    // Searched BEFORE the save too: the cache must not hide the new recipe.
    const found = await session.catalog.search('zucchini');
    expect(found.kind === 'rankedMatches' && found.matches[0]?.food.sourceRef).toBe(
      `recipe:${saved.value.id}`,
    );
    expect(found.kind === 'rankedMatches' && found.matches[0]?.food.source).toBe('recipe');

    await session.saved.deleteRecipe(saved.value.id);
    expect((await session.catalog.search('zucchini')).kind).not.toBe('rankedMatches');
    session.dispose();
  });
});
