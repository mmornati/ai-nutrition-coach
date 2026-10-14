// The web `CoachNoteStore`: append-only coach notes, the interaction log and the durable
// dismissal markers, on the SAME encrypted database as the plates (one store, no second source).
// While locked, writes answer a typed failure and reads answer "nothing" (a whisper that cannot be
// read is hidden); no exception crosses the port.

import {
  addCalendarDays,
  coachInteractionFailed,
  coachInteractionRecorded,
  persistedInteractionName,
  plateDeleteFailed,
  PLATE_DELETED,
  type CoachInteractionLog,
  type CoachInteractionResult,
  type CoachNote,
  type CoachNoteAppendResult,
  type CoachNoteStore,
  type DeletePlateResult,
  type EpochMs,
  type StoreObserver,
  type Unsubscribe,
} from '@anc/core';
import type { ChangeBus, ChangeTopic } from './change-bus';
import { reportCorruptRow, type CorruptRowReporter } from './corrupt-row-log';
import { isProgrammingError, LOCKED_FAILURE, mapStoreError } from './errors';
import { mapNoteRows, toStoredInstant } from './row-mapping';
import type { StoreSource } from './store-source';

/** Open-plate dismissal keys are per (day, slot); a day outside the 7-day week can never show again. */
const OPEN_PLATE_KEY_RETENTION_DAYS = 7;

function localDayText(moment: EpochMs): string {
  const d = new Date(moment);
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class WebCoachNoteStore implements CoachNoteStore {
  constructor(
    private readonly source: StoreSource,
    private readonly bus: ChangeBus,
    private readonly options: { now?: () => EpochMs; onCorruptRow?: CorruptRowReporter } = {},
  ) {}

  private now(): EpochMs {
    return (this.options.now ?? Date.now)();
  }

  private report: CorruptRowReporter = (id, reason) =>
    (this.options.onCorruptRow ?? reportCorruptRow)(id, reason);

  async append(note: CoachNote): Promise<CoachNoteAppendResult> {
    const db = this.source.database();
    if (!db) return { kind: 'coachNoteAppendFailure', cause: LOCKED_FAILURE };
    try {
      const id = await db.insertNote({
        plateLogId: note.plateLogId,
        anchor: note.anchor,
        questionKey: note.questionKey,
        noteText: note.text,
        generatedAt: toStoredInstant(note.generatedAt),
      });
      this.bus.emit('notes');
      return { kind: 'coachNoteAppended', note: { ...note, id } };
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return { kind: 'coachNoteAppendFailure', cause: mapStoreError(error) };
    }
  }

  async forPlate(plateLogId: number): Promise<readonly CoachNote[]> {
    const db = this.source.database();
    if (!db) return [];
    try {
      return mapNoteRows(await db.notesForPlate(plateLogId), this.report);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      // Port contract: never a thrown exception. A whisper that cannot be read is hidden.
      return [];
    }
  }

  watchForPlate(plateLogId: number, observer: StoreObserver<readonly CoachNote[]>): Unsubscribe {
    return this.watch('notes', observer, [], async (db) =>
      mapNoteRows(await db.notesForPlate(plateLogId), this.report),
    );
  }

  async recordDismissal(key: string): Promise<CoachInteractionResult> {
    const db = this.source.database();
    if (!db) return coachInteractionFailed(LOCKED_FAILURE);
    try {
      const id = await db.insertDismissal(key, toStoredInstant(this.now()));
      await this.pruneOldOpenPlateKeys(db);
      this.bus.emit('dismissals');
      return coachInteractionRecorded(id);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return coachInteractionFailed(mapStoreError(error));
    }
  }

  /** Housekeeping only; the dismissal itself was recorded. */
  private async pruneOldOpenPlateKeys(db: NonNullable<ReturnType<StoreSource['database']>>) {
    try {
      const cutoff = addCalendarDays(this.now(), -OPEN_PLATE_KEY_RETENTION_DAYS);
      await db.pruneOpenPlateDismissals(localDayText(cutoff));
    } catch (error) {
      if (isProgrammingError(error)) throw error;
    }
  }

  watchDismissals(observer: StoreObserver<ReadonlySet<string>>): Unsubscribe {
    return this.watch(
      'dismissals',
      observer,
      new Set<string>() as ReadonlySet<string>,
      async (db) => new Set(await db.dismissalKeys()) as ReadonlySet<string>,
    );
  }

  async recordInteraction(log: CoachInteractionLog): Promise<CoachInteractionResult> {
    const db = this.source.database();
    if (!db) return coachInteractionFailed(LOCKED_FAILURE);
    try {
      const id = await db.insertInteraction(
        log.noteId,
        persistedInteractionName(log.kind),
        toStoredInstant(log.at),
      );
      return coachInteractionRecorded(id);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return coachInteractionFailed(mapStoreError(error));
    }
  }

  async deleteForPlate(plateLogId: number): Promise<DeletePlateResult> {
    const db = this.source.database();
    if (!db) return plateDeleteFailed(LOCKED_FAILURE);
    try {
      await db.deleteNotesForPlate(plateLogId);
      this.bus.emit('notes', 'dismissals');
      return PLATE_DELETED;
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return plateDeleteFailed(mapStoreError(error));
    }
  }

  /**
   * Emit the current value once (asynchronously), then on every change of `topic`. A read failure
   * hides the whisper (emits `empty`); it never poisons the stream. Locked: emits `empty` once,
   * like a store with nothing in it.
   */
  private watch<T>(
    topic: ChangeTopic,
    observer: StoreObserver<T>,
    empty: T,
    read: (db: NonNullable<ReturnType<StoreSource['database']>>) => Promise<T>,
  ): Unsubscribe {
    const db = this.source.database();
    if (!db) {
      let active = true;
      queueMicrotask(() => {
        if (active) observer.next(empty);
      });
      return () => {
        active = false;
      };
    }
    let active = true;
    let latest = 0;
    const emit = async (): Promise<void> => {
      const mine = ++latest;
      let value = empty;
      try {
        value = await read(db);
      } catch (error) {
        if (isProgrammingError(error)) throw error;
      }
      if (!active || mine !== latest || this.source.database() !== db) return;
      observer.next(value);
    };
    const off = this.bus.on(topic, () => void emit());
    void emit();
    return () => {
      active = false;
      off();
    };
  }
}
