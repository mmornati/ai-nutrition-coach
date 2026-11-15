import { createContext, useContext } from 'react';
import type { EpochMs, FoodEntryDraft, MealSlot, RecordPlateResult } from '@anc/core';
import { useSession } from './session';

export interface LogState {
  /** Open the "Log a plate" sheet (Snapshot, Barcode, Type it). */
  readonly open: () => void;
  /** A photo is being read: the open meal shows "Reading the plate…". */
  readonly resolving: boolean;
  /**
   * The day and meal the photo being read will land in, fixed when the photo was taken (changing
   * the week strip during recognition does not move it); `null` when no photo is being read.
   */
  readonly resolvingTarget: { readonly day: EpochMs; readonly slot: MealSlot } | null;
}

export const LogContext = createContext<LogState | null>(null);

export function useLog(): LogState {
  const log = useContext(LogContext);
  if (log === null) throw new Error('useLog needs a <LogHost>');
  return log;
}

/** Records a plate where the log sheet's target says (the chosen day and meal); see LogHost. */
export type RecordHere = (drafts: readonly FoodEntryDraft[]) => Promise<RecordPlateResult>;

export const LogTargetContext = createContext<RecordHere | null>(null);

/**
 * What the log flows record through: the plate lands on the day and meal chosen in the log sheet.
 * Outside a LogHost (a flow rendered on its own) it is simply "now".
 */
export function useRecordHere(): RecordHere {
  const target = useContext(LogTargetContext);
  const { recordPlate } = useSession();
  return target ?? ((drafts) => recordPlate(drafts));
}
