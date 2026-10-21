// The raw (string-typed) operations the store needs from a database. `SqliteStoreDb` implements
// them in the worker over the encrypted SQLite file; `MemoryStoreDb` implements them in plain
// memory (the dev-only unencrypted store and the contract reference). Rows cross the worker
// boundary as plain strings and numbers: mapping to the domain, and the corrupt-row policy, live
// on the main thread (row-mapping.ts).

export interface EntryInsert {
  readonly sourceRef: string;
  readonly displayName: string;
  readonly source: string;
  readonly foodGroup: string;
  readonly quantityLow: string;
  readonly quantityHigh: string;
  readonly quantityUnit: string;
  readonly quantityDisplayLabel: string;
  /** Schema v2, all nullable: weight in grams (text, verbatim), 0/1 estimate flag, JSON text. */
  readonly quantityGrams?: string | null;
  readonly quantityGramsEstimated?: number | null;
  readonly nutrientsPer100g?: string | null;
  readonly foodExtra?: string | null;
}

export interface InsertedPlate {
  readonly plateId: number;
  readonly entryIds: readonly number[];
}

export interface PlateRow {
  readonly id: number;
  readonly loggedAtUtc: string;
}

export interface EntryRow extends EntryInsert {
  readonly id: number;
  readonly plateLogId: number;
}

/** Plates newest first, and all of their entries (each plate's entries by ascending id). */
export interface PlateRowSet {
  readonly plates: readonly PlateRow[];
  readonly entries: readonly EntryRow[];
}

export interface NoteInsert {
  readonly plateLogId: number;
  readonly anchor: string;
  readonly questionKey: string;
  readonly noteText: string;
  readonly generatedAt: string;
}

export interface NoteRow extends NoteInsert {
  readonly id: number;
}

export interface StoreDbOps {
  insertPlate(loggedAtUtc: string, entries: readonly EntryInsert[]): InsertedPlate;
  /** `[from, to)` on the UTC text, either bound optional. Newest first. */
  readPlateRows(fromUtc: string | null, toUtc: string | null): PlateRowSet;
  /** The plate and EVERYTHING attached to it, in ONE transaction. An unknown id is a no-op. */
  deletePlate(plateLogId: number): void;

  insertNote(note: NoteInsert): number;
  /** Insertion order (id ascending). */
  notesForPlate(plateLogId: number): NoteRow[];
  /** Insert-or-ignore; returns the row id of the (new or existing) marker. */
  insertDismissal(key: string, atUtc: string): number;
  dismissalKeys(): string[];
  /** Drops `openPlate:<yyyy-MM-dd>:<slot>` markers dated before `cutoffDay` (`yyyy-MM-dd`). */
  pruneOpenPlateDismissals(cutoffDay: string): void;
  insertInteraction(coachNoteId: number, kind: string, atUtc: string): number;
  /** Notes, their interactions and their dismissal markers (the plate itself stays). */
  deleteNotesForPlate(plateLogId: number): void;

  kvGet(key: string): string | null;
  kvSet(key: string, value: string): void;
  kvDelete(key: string): void;
}

export type StoreOpName = keyof StoreDbOps;

/** Every operation name, for the worker dispatcher and the RPC proxy. */
export const STORE_OP_NAMES: readonly StoreOpName[] = [
  'insertPlate',
  'readPlateRows',
  'deletePlate',
  'insertNote',
  'notesForPlate',
  'insertDismissal',
  'dismissalKeys',
  'pruneOpenPlateDismissals',
  'insertInteraction',
  'deleteNotesForPlate',
  'kvGet',
  'kvSet',
  'kvDelete',
] as const;

/** The async view of the operations, plus `close`. This is what the facades talk to. */
export type StoreDb = {
  readonly [K in StoreOpName]: (
    ...args: Parameters<StoreDbOps[K]>
  ) => Promise<ReturnType<StoreDbOps[K]>>;
} & { close(): Promise<void> };

/** Wrap synchronous operations (in-process: tests, the dev store). */
export function asAsyncDb(ops: StoreDbOps, onClose?: () => void): StoreDb {
  const out: Record<string, unknown> = {};
  for (const name of STORE_OP_NAMES) {
    const fn = ops[name] as (...args: unknown[]) => unknown;
    out[name] = (...args: unknown[]) => {
      try {
        return Promise.resolve(fn.apply(ops, args));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }
  out['close'] = () => {
    onClose?.();
    return Promise.resolve();
  };
  return out as unknown as StoreDb;
}
