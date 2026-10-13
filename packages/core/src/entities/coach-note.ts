import type { EpochMs } from '../common';
import type { CoachAnchor } from '../value-types/composition-pattern';

/** The durable record of the whisper that landed on a just-logged plate. */
export interface CoachNote {
  readonly id: number;
  readonly plateLogId: number;
  readonly anchor: CoachAnchor;
  readonly questionKey: string;
  readonly text: string;
  readonly generatedAt: EpochMs;
}

/** Once a note is in the store it is the same record: equality is by `id` alone. */
export function coachNoteEquals(a: CoachNote, b: CoachNote): boolean {
  return a.id === b.id;
}
