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
  it('records every plate in order and coaches only the last: one calm note for the batch', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const outcome = await session.recordPlates([
      { entries: [draft('Toast', 'starch')], loggedAtUtc: at(7, 45) },
      { entries: [draft('Chicken', 'protein')], loggedAtUtc: at(12, 30) },
      { entries: [draft('Salad', 'vegFruit')], loggedAtUtc: at(19, 0) },
    ]);
    expect(outcome).toEqual({ recorded: 3, failed: 0 });

    const read = await bundle.store.readRange();
    if (read.kind !== 'platesRead') throw new Error('read failed');
    const byTime = [...read.plates].sort((a, b) => a.loggedAtUtc - b.loggedAtUtc);
    expect(byTime.map((p) => p.entries[0]?.databaseFood.displayName)).toEqual([
      'Toast',
      'Chicken',
      'Salad',
    ]);
    const counts = await Promise.all(
      byTime.map(async (p) => (await bundle.notes.forPlate(p.id)).length),
    );
    expect(counts.slice(0, 2)).toEqual([0, 0]);
    expect(counts[2]).toBe(1);
    session.dispose();
  });

  it('stops at the first failure and says how many landed', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const bad = {
      ...draft('Chicken', 'protein'),
      quantity: { low: 2, high: 1, unit: 'x', displayLabel: 'x' },
    };
    const outcome = await session.recordPlates([
      { entries: [draft('Toast', 'starch')], loggedAtUtc: at(7, 45) },
      { entries: [bad], loggedAtUtc: at(12, 30) },
      { entries: [draft('Salad', 'vegFruit')], loggedAtUtc: at(19, 0) },
    ]);
    expect(outcome).toEqual({ recorded: 1, failed: 2 });
    session.dispose();
  });

  it('is nothing to do for an empty batch', async () => {
    const session = await createSession(await unlockedBundle());
    expect(await session.recordPlates([])).toEqual({ recorded: 0, failed: 0 });
    session.dispose();
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
