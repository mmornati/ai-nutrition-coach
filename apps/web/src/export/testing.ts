import {
  databaseFood,
  plateLog,
  storeFailure,
  type EncryptedStore,
  type FoodEntry,
  type FoodGroup,
  type PlateLog,
  type QuantityRange,
  type ReadPlatesResult,
  type StoreFailureReason,
} from '@anc/core';

export function entry(
  id: number,
  plateId: number,
  name: string,
  over: {
    ref?: string;
    unit?: string;
    label?: string;
    low?: number;
    high?: number;
    group?: FoodGroup;
    source?: 'off' | 'usda' | 'manual' | 'seed';
  } = {},
): FoodEntry {
  const quantity: QuantityRange = {
    low: over.low ?? 1,
    high: over.high ?? 2,
    unit: over.unit ?? 'fist',
    displayLabel: over.label ?? '1–2 fists',
  };
  return {
    id,
    plateLogId: plateId,
    databaseFood: databaseFood({
      sourceRef: over.ref ?? `ref-${id}`,
      displayName: name,
      source: over.source ?? 'manual',
      ...(over.group === undefined ? {} : { foodGroup: over.group }),
    }),
    quantity,
  };
}

export const plate = (id: number, loggedAt: number, entries: FoodEntry[]): PlateLog =>
  plateLog({ id, loggedAtUtc: loggedAt, entries });

/** Records the last range it was asked for; answers half-open `[from, to)`, newest first. */
export class FakeStore implements EncryptedStore {
  lastRange: { from?: number | undefined; to?: number | undefined } | undefined;
  constructor(
    private readonly plates: readonly PlateLog[] = [],
    private readonly failWith?: StoreFailureReason,
  ) {}
  recordPlate(): never {
    throw new Error('read-only in these tests');
  }
  watchRange(): never {
    throw new Error('not used');
  }
  readRange(range?: {
    from?: number | undefined;
    to?: number | undefined;
  }): Promise<ReadPlatesResult> {
    this.lastRange = range;
    if (this.failWith !== undefined) {
      return Promise.resolve({ kind: 'platesReadFailed', failure: storeFailure(this.failWith) });
    }
    const from = range?.from ?? -Infinity;
    const to = range?.to ?? Infinity;
    const plates = this.plates
      .filter((p) => p.loggedAtUtc >= from && p.loggedAtUtc < to)
      .sort((a, b) => b.loggedAtUtc - a.loggedAtUtc);
    return Promise.resolve({ kind: 'platesRead', plates });
  }
  deletePlate(): never {
    throw new Error('not used');
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** Minimal RFC-4180 row splitter (quotes, doubled quotes, embedded delimiters/newlines). */
export function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i] as string;
    if (quoted) {
      if (c === '"') {
        if (row[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}
