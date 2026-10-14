// The scan flow: decoded code -> lookupByBarcode -> single match / not found (code prefilled) /
// calm failure; the scanner pauses while a result is shown and resumes after; the one-time Open
// Food Facts notice. Ported from the earlier client (the
// I/O matrix) and the PV7 rules in the earlier client.
import { describe, expect, it, vi } from 'vitest';
import { catalogFailure, databaseFood, notFound, rankedMatches, type FoodMatch } from '@anc/core';
import { PrivacyPrefs } from '../catalog/privacy-prefs';
import { OfflineFirstFoodCatalog } from '../catalog/offline-first-catalog';
import type { KeyValueStore } from '../storage/key-value-store';
import { ScanFlow, type LookupState } from './scan-flow';
import { FakeCatalog } from './testing';

const nutella: FoodMatch = {
  food: databaseFood({
    sourceRef: '3017620422003',
    displayName: 'Nutella',
    source: 'off',
    foodGroup: 'other',
  }),
  confidence: 1,
  presets: [],
};

function flow(
  catalog: FakeCatalog,
  extra: Partial<ConstructorParameters<typeof ScanFlow>[0]> = {},
) {
  const states: LookupState[] = [];
  const f = new ScanFlow({ catalog, onChange: (s) => states.push(s), ...extra });
  return { f, states };
}

describe('ScanFlow', () => {
  it('HAPPY_PATH_KNOWN: a single match opens the match sheet (and the catalog saw exactly one lookup)', async () => {
    const catalog = new FakeCatalog({ '3017620422003': rankedMatches([nutella]) });
    const { f, states } = flow(catalog);
    await f.onCode('3017620422003');
    expect(f.state).toEqual({ kind: 'match', code: '3017620422003', match: nutella });
    expect(states.map((s) => s.kind)).toEqual(['lookingUp', 'match']);
    expect(catalog.calls).toEqual(['3017620422003']);
  });

  it('UNKNOWN_BARCODE: not found carries the scanned code for manual entry', async () => {
    const { f } = flow(new FakeCatalog({ '0000000000000': notFound('0000000000000') }));
    await f.onCode('0000000000000');
    expect(f.state).toEqual({ kind: 'notFound', code: '0000000000000' });
  });

  it('an EMPTY match list is treated as not found', async () => {
    const { f } = flow(new FakeCatalog({ '1': rankedMatches([]) }));
    await f.onCode('1');
    expect(f.state).toEqual({ kind: 'notFound', code: '1' });
  });

  it('CATALOG_FAILURE: the calm failure line; the scanner is NOT paused (manual entry still works)', async () => {
    const { f } = flow(
      new FakeCatalog({ '3017620422003': catalogFailure('httpError', 'OFF HTTP 500') }),
    );
    await f.onCode('3017620422003');
    expect(f.state).toEqual({ kind: 'failure', code: '3017620422003' });
    expect(f.paused).toBe(false);
  });

  it('a catalog that throws is the same calm failure, never a crash', async () => {
    const { f } = flow(
      new FakeCatalog({
        '1': () => {
          throw new Error('adapter bug');
        },
      }),
    );
    await f.onCode('1');
    expect(f.state.kind).toBe('failure');
  });

  it('MULTI_SCAN: the scanner pauses while a result is shown and resumes after dismissResult; two never stack', async () => {
    const catalog = new FakeCatalog({
      '3017620422003': rankedMatches([nutella]),
      '737628064502': notFound('737628064502'),
    });
    const { f } = flow(catalog);
    await f.onCode('3017620422003');
    expect(f.paused).toBe(true);

    // A second scan while the sheet is up is dropped: no lookup, no second result.
    await f.onCode('737628064502');
    expect(catalog.calls).toEqual(['3017620422003']);
    expect(f.state.kind).toBe('match');

    f.dismissResult();
    expect(f.paused).toBe(false);
    expect(f.state).toEqual({ kind: 'idle' });

    await f.onCode('737628064502');
    expect(f.state).toEqual({ kind: 'notFound', code: '737628064502' });
    expect(catalog.calls).toEqual(['3017620422003', '737628064502']);
  });

  it('empty / whitespace codes are ignored; codes are trimmed', async () => {
    const catalog = new FakeCatalog({ '123': rankedMatches([nutella]) });
    const { f } = flow(catalog);
    await f.onCode('   ');
    expect(catalog.calls).toEqual([]);
    await f.onCode(' 123 ');
    expect(catalog.calls).toEqual(['123']);
  });

  it('nothing is published after dispose', async () => {
    const catalog = new FakeCatalog({ '1': rankedMatches([nutella]) });
    const { f, states } = flow(catalog);
    const p = f.onCode('1');
    f.dispose();
    await p;
    expect(states.map((s) => s.kind)).toEqual(['lookingUp']);
    await f.onCode('2');
    expect(catalog.calls).toEqual(['1']);
  });
});

describe('the one-time Open Food Facts notice (PV7)', () => {
  class Kv implements KeyValueStore {
    readonly map = new Map<string, string>();
    async read(k: string) {
      return this.map.get(k) ?? null;
    }
    async write(k: string, v: string) {
      this.map.set(k, v);
    }
    async delete(k: string) {
      this.map.delete(k);
    }
  }

  it('is asked while there is no answer, BEFORE the lookup; the answer is stored and not asked again', async () => {
    const kv = new Kv();
    const prefs = new PrivacyPrefs(kv);
    const order: string[] = [];
    const catalog = new FakeCatalog({ '1': notFound('1') });
    const lookup = catalog.lookupByBarcode.bind(catalog);
    catalog.lookupByBarcode = async (c) => {
      order.push('lookup');
      return lookup(c);
    };
    const askOffNotice = vi.fn(async () => {
      order.push('notice');
      return 'allowed' as const;
    });
    const { f } = flow(catalog, { prefs, askOffNotice });
    await f.onCode('1');
    f.dismissResult();
    await f.onCode('2');
    expect(askOffNotice).toHaveBeenCalledTimes(1);
    expect(order.slice(0, 2)).toEqual(['notice', 'lookup']);
    expect(await prefs.offLookupChoice()).toBe('allowed');
  });

  it('"Don\'t look up online" is stored too; a dismissal that throws counts as offline-only', async () => {
    const prefs = new PrivacyPrefs(new Kv());
    const { f } = flow(new FakeCatalog(), {
      prefs,
      askOffNotice: async () => {
        throw new Error('dialog gone');
      },
    });
    await f.onCode('1');
    expect(await prefs.offLookupChoice()).toBe('offlineOnly');
  });

  it('an answered notice is not asked again', async () => {
    const prefs = new PrivacyPrefs(new Kv());
    await prefs.setOffLookupChoice('offlineOnly');
    const askOffNotice = vi.fn(async () => 'allowed' as const);
    const { f } = flow(new FakeCatalog(), { prefs, askOffNotice });
    await f.onCode('1');
    expect(askOffNotice).not.toHaveBeenCalled();
  });

  it('a store that cannot be read: nothing is asked, the lookup still goes to the catalog (whose gate is closed)', async () => {
    const prefs = {
      offLookupChoice: async () => {
        throw new Error('locked');
      },
      setOffLookupChoice: async () => undefined,
    };
    const askOffNotice = vi.fn(async () => 'allowed' as const);
    const catalog = new FakeCatalog();
    const { f } = flow(catalog, { prefs, askOffNotice });
    await f.onCode('1');
    expect(askOffNotice).not.toHaveBeenCalled();
    expect(catalog.calls).toEqual(['1']);
  });

  it('a failed write only means we ask again next time; and nothing was sent unasked', async () => {
    const fetchCalls: string[] = [];
    const kv: KeyValueStore = {
      read: async () => null,
      write: async () => {
        throw new Error('store locked');
      },
      delete: async () => undefined,
    };
    const prefs = new PrivacyPrefs(kv);
    const askOffNotice = vi.fn(async () => 'allowed' as const);
    // The REAL catalog with the REAL gate: the unsaved answer leaves the gate closed.
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: async () => (await prefs.offLookupChoice()) === 'allowed',
      offSource: {
        lookup: async (b) => {
          fetchCalls.push(b);
          return { kind: 'notFound', barcode: b };
        },
      },
    });
    const { f } = flow(catalog as never, { prefs, askOffNotice });
    await f.onCode('1');
    f.dismissResult();
    await f.onCode('1');
    expect(askOffNotice).toHaveBeenCalledTimes(2);
    expect(fetchCalls).toEqual([]);
  });

  it('end to end with the real catalog: OK then the lookup is sent; "Don\'t look up" then nothing is', async () => {
    for (const [answer, sent] of [
      ['allowed', 1],
      ['offlineOnly', 0],
    ] as const) {
      const prefs = new PrivacyPrefs(new Kv());
      const calls: string[] = [];
      const catalog = new OfflineFirstFoodCatalog({
        onlineLookupAllowed: async () => (await prefs.offLookupChoice()) === 'allowed',
        offSource: {
          lookup: async (b) => {
            calls.push(b);
            return { kind: 'notFound', barcode: b };
          },
        },
      });
      const { f } = flow(catalog as never, { prefs, askOffNotice: async () => answer });
      await f.onCode('3017620422003');
      expect(calls, answer).toHaveLength(sent);
      expect(f.state.kind, answer).toBe('notFound'); // either way the manual path opens
    }
  });
});
