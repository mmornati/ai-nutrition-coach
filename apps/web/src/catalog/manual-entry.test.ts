// Manual entry: text field -> ranked matches -> honest quantity preset chips (first preset default)
// -> Log through RecordPlate; no-match shows the custom food form (source: manual). Ported from
// the earlier client (the logic cases; widget cases live with
// the Phase 7 screen).
import { describe, expect, it, vi } from 'vitest';
import {
  catalogFailure,
  databaseFood,
  notFound,
  rankedMatches,
  recordPlateSuccess,
  storeFailure,
  type CatalogResult,
  type FoodCatalog,
  type FoodEntryDraft,
  type FoodMatch,
  type RecordPlateResult,
} from '@anc/core';
import { OfflineFirstFoodCatalog } from './offline-first-catalog';
import { ManualEntrySession, type CommitPlate } from './manual-entry';

const allow = async (): Promise<boolean> => true;

const salmon: FoodMatch = {
  food: databaseFood({
    sourceRef: 'seed:salmon',
    displayName: 'Salmon',
    source: 'seed',
    foodGroup: 'protein',
  }),
  confidence: 0.8,
  presets: [
    { low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist' },
    { low: 1.5, high: 1.5, unit: 'fist', displayLabel: '~1.5 fists' },
  ],
};

function fakeCatalog(byQuery: Record<string, CatalogResult>): FoodCatalog & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async search(query) {
      calls.push(query);
      return byQuery[query] ?? notFound(query);
    },
    lookupBySourceRef: async () => null,
    lookupByBarcode: async () => notFound(''),
  };
}

function recorder(result?: RecordPlateResult): { commit: CommitPlate; drafts: FoodEntryDraft[][] } {
  const drafts: FoodEntryDraft[][] = [];
  return {
    drafts,
    commit: async (d) => {
      drafts.push([...d]);
      return result ?? recordPlateSuccess({} as never);
    },
  };
}

describe('ManualEntrySession', () => {
  it('typing "salm" surfaces Salmon in the ranked list', async () => {
    const s = new ManualEntrySession(fakeCatalog({ salm: rankedMatches([salmon]) }));
    await s.updateQuery('salm');
    expect(s.state.matches.map((m) => m.food.displayName)).toEqual(['Salmon']);
    expect(s.state.catalogStatus).toBe('matched');
  });

  it('selecting a match defaults to its FIRST preset; Log commits that one plate and resets', async () => {
    const s = new ManualEntrySession(fakeCatalog({ salm: rankedMatches([salmon]) }));
    await s.updateQuery('salm');
    s.selectMatch(salmon);
    expect(s.state.chosenPreset?.displayLabel).toBe('~1 fist');
    const { commit, drafts } = recorder();
    expect(await s.logSelected(commit)).toEqual({ kind: 'logged' });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual([{ databaseFood: salmon.food, quantity: salmon.presets[0] }]);
    expect(s.state.query).toBe('');
    expect(s.state.selected).toBeNull();
  });

  it('swapping the preset before Log commits the new preset', async () => {
    const s = new ManualEntrySession(fakeCatalog({ salm: rankedMatches([salmon]) }));
    await s.updateQuery('salm');
    s.selectMatch(salmon);
    s.selectPreset(salmon.presets[1]!);
    const { commit, drafts } = recorder();
    await s.logSelected(commit);
    expect(drafts[0]![0]!.quantity.displayLabel).toBe('~1.5 fists');
  });

  it('Log with nothing selected, or a food with no preset, needs a quantity and commits nothing', async () => {
    const s = new ManualEntrySession(fakeCatalog({}));
    const { commit, drafts } = recorder();
    expect(await s.logSelected(commit)).toEqual({ kind: 'needsQuantity' });
    s.selectMatch({ ...salmon, presets: [] });
    expect(s.state.chosenPreset).toBeNull();
    expect(await s.logSelected(commit)).toEqual({ kind: 'needsQuantity' });
    expect(drafts).toHaveLength(0);
  });

  it('no-match shows the custom form: logs a manual food (unclassifiable name stays other, ~1 serving)', async () => {
    const s = new ManualEntrySession(fakeCatalog({ zxqwer: notFound('zxqwer') }));
    await s.updateQuery('zxqwer');
    expect(s.state.catalogStatus).toBe('notFound');
    expect(s.state.matches).toEqual([]);
    s.setCustomName('Mystery Stew');
    const { commit, drafts } = recorder();
    expect(await s.logCustom(commit)).toEqual({ kind: 'logged' });
    const draft = drafts[0]![0]!;
    expect(draft.databaseFood).toMatchObject({
      displayName: 'Mystery Stew',
      source: 'manual',
      foodGroup: 'other',
      sourceRef: 'manual:mystery stew',
    });
    expect(draft.quantity).toMatchObject({ low: 1, high: 1, unit: 'serving' });
  });

  it('a typed food is classified by its name: zucchini is vegFruit, chicken salad protein', async () => {
    for (const [name, group] of [
      ['Zucchini', 'vegFruit'],
      ['Chicken salad', 'protein'],
      ['Pizza', 'starch'],
    ] as const) {
      const s = new ManualEntrySession(fakeCatalog({}));
      s.setCustomName(name);
      const { commit, drafts } = recorder();
      expect(await s.logCustom(commit)).toEqual({ kind: 'logged' });
      expect(drafts[0]![0]!.databaseFood).toMatchObject({ displayName: name, foodGroup: group });
    }
  });

  it('a blank custom name needs a name first', async () => {
    const s = new ManualEntrySession(fakeCatalog({}));
    s.setCustomName('   ');
    const { commit, drafts } = recorder();
    expect(await s.logCustom(commit)).toEqual({ kind: 'needsName' });
    expect(drafts).toHaveLength(0);
  });

  it('a catalog failure shows the calm line AND the custom form; Log stays unselected', async () => {
    const s = new ManualEntrySession(fakeCatalog({ apple: catalogFailure('network') }));
    await s.updateQuery('apple');
    expect(s.state).toMatchObject({
      catalogStatus: 'catalogFailure',
      lastError: 'searchUnavailable',
      selected: null,
      matches: [],
    });
  });

  it('a catalog that THROWS is the same calm failure, never a throw', async () => {
    const s = new ManualEntrySession({
      search: async () => {
        throw new Error('boom');
      },
      lookupBySourceRef: async () => null,
      lookupByBarcode: async () => notFound(''),
    });
    await s.updateQuery('apple');
    expect(s.state.lastError).toBe('searchUnavailable');
  });

  it('an empty query resets to idle (and keeps a prefilled custom name)', async () => {
    const s = new ManualEntrySession(fakeCatalog({ salm: rankedMatches([salmon]) }));
    s.setCustomName('3017620422003');
    await s.updateQuery('salm');
    await s.updateQuery('   ');
    expect(s.state).toMatchObject({
      query: '',
      matches: [],
      catalogStatus: 'idle',
      customName: '3017620422003',
    });
  });

  it('a newer query wins even if an older, slower search resolves last', async () => {
    let releaseSlow: (r: CatalogResult) => void = () => undefined;
    const slow = new Promise<CatalogResult>((resolve) => (releaseSlow = resolve));
    const s = new ManualEntrySession({
      search: (q) => (q === 'sa' ? slow : Promise.resolve(rankedMatches([salmon]))),
      lookupBySourceRef: async () => null,
      lookupByBarcode: async () => notFound(''),
    });
    const first = s.updateQuery('sa');
    await s.updateQuery('salm');
    releaseSlow(rankedMatches([]));
    await first;
    expect(s.state.matches).toHaveLength(1);
    expect(s.state.query).toBe('salm');
  });

  it('a scanned barcode that was not found is prefilled into the search AND the custom name', async () => {
    const catalog = fakeCatalog({});
    const s = new ManualEntrySession(catalog);
    await s.prefill(' 0000000000000 ');
    expect(s.state.query).toBe('0000000000000');
    expect(s.state.customName).toBe('0000000000000');
    expect(catalog.calls).toEqual(['0000000000000']);
    expect(s.state.catalogStatus).toBe('notFound');
  });

  it('a failing commit is a typed outcome, the plate form stays, and busy resets on EVERY outcome', async () => {
    const s = new ManualEntrySession(fakeCatalog({}));
    s.selectMatch(salmon);
    const failing = await s.logSelected(async () => storeFailure('keyLost'));
    expect(failing).toEqual({ kind: 'failed', failure: storeFailure('keyLost') });
    expect(s.state.submitting).toBe(false);
    expect(s.state.selected).toBe(salmon);

    const throwing = await s.logSelected(async () => {
      throw new Error('store crashed');
    });
    expect(throwing).toMatchObject({ kind: 'failed' });
    expect(s.state.submitting).toBe(false);
  });

  it('a second Log while one is in flight does nothing (no double plate)', async () => {
    const s = new ManualEntrySession(fakeCatalog({}));
    s.selectMatch(salmon);
    let release: () => void = () => undefined;
    const commit = vi.fn(
      () =>
        new Promise<RecordPlateResult>(
          (resolve) => (release = () => resolve(recordPlateSuccess({} as never))),
        ),
    );
    const first = s.logSelected(commit);
    expect(s.state.submitting).toBe(true);
    expect(await s.logSelected(commit)).toEqual({ kind: 'busy' });
    release();
    expect(await first).toEqual({ kind: 'logged' });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers and works against the real offline-first catalog', async () => {
    const s = new ManualEntrySession(new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }));
    const seen: string[] = [];
    const off = s.subscribe(() => seen.push(s.state.catalogStatus));
    await s.updateQuery('salm');
    off();
    expect(seen.at(-1)).toBe('matched');
    expect(s.state.matches[0]?.food.displayName).toBe('Salmon');
    // The first preset is the default, honestly labelled.
    s.selectMatch(s.state.matches[0]!);
    expect(s.state.chosenPreset?.displayLabel.startsWith('~')).toBe(true);
  });
});
