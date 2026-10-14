// The web `EncryptedStore`: a thin view over the controller's open database. While the store is
// locked, `recordPlate` answers a typed `webSessionKey` failure, `readRange` a typed
// `platesReadFailed`, and `watchRange` emits nothing: no exception crosses the port. Opening,
// keying, verification, locking and erasing live in the controller. The queries are the shared
// SQL in sqlite-store-db.ts.

import {
  isValidQuantity,
  plateDeleteFailed,
  PLATE_DELETED,
  plateLog,
  recordPlateSuccess,
  storeFailure,
  type DeletePlateResult,
  type EncryptedStore,
  type EpochMs,
  type FoodEntry,
  type FoodEntryDraft,
  type PlateLog,
  type ReadPlatesResult,
  type RecordPlateResult,
  type StoreObserver,
  type Unsubscribe,
} from '@anc/core';
import type { ChangeBus } from './change-bus';
import { reportCorruptRow, type CorruptRowReporter } from './corrupt-row-log';
import { isProgrammingError, LOCKED_FAILURE, mapStoreError } from './errors';
import type { EntryInsert } from './ops';
import { mapPlateRows, toStoredInstant } from './row-mapping';
import type { StoreSource } from './store-source';

function toInsert(draft: FoodEntryDraft): EntryInsert {
  return {
    sourceRef: draft.databaseFood.sourceRef,
    displayName: draft.databaseFood.displayName,
    source: draft.databaseFood.source,
    foodGroup: draft.databaseFood.foodGroup,
    // Numeric halves stored as text so the round trip is verbatim: 0.5 comes back as 0.5.
    quantityLow: String(draft.quantity.low),
    quantityHigh: String(draft.quantity.high),
    quantityUnit: draft.quantity.unit,
    quantityDisplayLabel: draft.quantity.displayLabel,
  };
}

function instantOrNull(moment: EpochMs | undefined): string | null | 'invalid' {
  if (moment === undefined) return null;
  if (!Number.isFinite(moment)) return 'invalid';
  return toStoredInstant(Math.floor(moment));
}

export class WebEncryptedStore implements EncryptedStore {
  constructor(
    private readonly source: StoreSource,
    private readonly bus: ChangeBus,
    private readonly options: { now?: () => EpochMs; onCorruptRow?: CorruptRowReporter } = {},
  ) {}

  private report: CorruptRowReporter = (id, reason) =>
    (this.options.onCorruptRow ?? reportCorruptRow)(id, reason);

  /** True when the store is unlocked and the database is open. */
  get isOpen(): boolean {
    return this.source.database() !== null;
  }

  async recordPlate(input: {
    readonly entries: readonly FoodEntryDraft[];
    readonly loggedAtUtc?: EpochMs | undefined;
  }): Promise<RecordPlateResult> {
    // Validity is checked at runtime at every store boundary, not only in the use-case.
    if (input.entries.length === 0) return storeFailure('emptyPlate');
    if (!input.entries.every((e) => isValidQuantity(e.quantity))) {
      return storeFailure('invalidQuantity');
    }
    const db = this.source.database();
    if (!db) return LOCKED_FAILURE;
    const at = Math.floor(input.loggedAtUtc ?? (this.options.now ?? Date.now)());
    if (!Number.isFinite(at)) return storeFailure('storeOperation');
    try {
      const inserted = await db.insertPlate(toStoredInstant(at), input.entries.map(toInsert));
      const entries: FoodEntry[] = input.entries.map((draft, i) => ({
        id: inserted.entryIds[i] ?? 0,
        plateLogId: inserted.plateId,
        databaseFood: { ...draft.databaseFood },
        quantity: { ...draft.quantity },
      }));
      this.bus.emit('plates');
      return recordPlateSuccess(plateLog({ id: inserted.plateId, loggedAtUtc: at, entries }));
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return mapStoreError(error);
    }
  }

  watchRange(
    range: { readonly from: EpochMs; readonly to: EpochMs },
    observer: StoreObserver<readonly PlateLog[]>,
  ): Unsubscribe {
    const db = this.source.database();
    // Locked: nothing to emit; the UI shows its quiet open stations and the gate the unlock screen.
    if (!db) return () => undefined;
    const from = instantOrNull(range.from);
    const to = instantOrNull(range.to);
    let active = true;
    let latest = 0;
    const emit = async (): Promise<void> => {
      const mine = ++latest;
      try {
        const rows =
          from === 'invalid' || to === 'invalid'
            ? { plates: [], entries: [] }
            : await db.readPlateRows(from, to);
        // Dropped silently when unsubscribed, superseded by a newer read, or the store locked.
        if (!active || mine !== latest || this.source.database() !== db) return;
        observer.next(mapPlateRows(rows, this.report));
      } catch (error) {
        if (!active || mine !== latest || this.source.database() !== db) return;
        observer.error(mapStoreError(error));
      }
    };
    const off = this.bus.on('plates', () => void emit());
    void emit();
    return () => {
      active = false;
      off();
    };
  }

  async readRange(
    range: { readonly from?: EpochMs | undefined; readonly to?: EpochMs | undefined } = {},
  ): Promise<ReadPlatesResult> {
    const db = this.source.database();
    if (!db) return { kind: 'platesReadFailed', failure: LOCKED_FAILURE };
    const from = instantOrNull(range.from);
    const to = instantOrNull(range.to);
    if (from === 'invalid' || to === 'invalid') {
      return { kind: 'platesReadFailed', failure: storeFailure('storeOperation') };
    }
    try {
      const rows = await db.readPlateRows(from, to);
      return { kind: 'platesRead', plates: mapPlateRows(rows, this.report) };
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return { kind: 'platesReadFailed', failure: mapStoreError(error) };
    }
  }

  async deletePlate(plateLogId: number): Promise<DeletePlateResult> {
    const db = this.source.database();
    if (!db) return plateDeleteFailed(LOCKED_FAILURE);
    try {
      await db.deletePlate(plateLogId);
      this.bus.emit('plates', 'notes', 'dismissals');
      return PLATE_DELETED;
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return plateDeleteFailed(mapStoreError(error));
    }
  }

  close(): Promise<void> {
    return this.source.lock();
  }
}
