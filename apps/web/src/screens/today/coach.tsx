import { useEffect, useState } from 'react';
import type { CoachNote, CoachNoteStore, PlateLog } from '@anc/core';
import { CoachCard, DepthPanel } from '../../components/day';
import { useSession } from '../../app/session';

/** Durable dismissal markers (`note:<id>`, `openPlate:<day>:<slot>`), live. */
export function useDismissals(notes: CoachNoteStore): ReadonlySet<string> {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  useEffect(
    () =>
      notes.watchDismissals({
        next: setDismissed,
        error: () => setDismissed(new Set()),
      }),
    [notes],
  );
  return dismissed;
}

/** The coach notes of one plate, live. */
export function usePlateNotes(notes: CoachNoteStore, plateLogId: number): readonly CoachNote[] {
  const [list, setList] = useState<readonly CoachNote[]>([]);
  useEffect(
    () =>
      notes.watchForPlate(plateLogId, {
        next: setList,
        error: () => setList([]),
      }),
    [notes, plateLogId],
  );
  return list;
}

type Phase =
  { readonly kind: 'card' } | { readonly kind: 'depth'; readonly followUp: string | null };

/**
 * The one coach question under a plate: Sure opens the bounded follow-up, Ask later dismisses it
 * for good. The card never re-asks, and dismissing costs nothing. Nothing renders when there is
 * no question, or it was dismissed.
 */
export function PlateCoach({
  plate,
  dismissed,
}: {
  readonly plate: PlateLog;
  readonly dismissed: ReadonlySet<string>;
}) {
  const { notes, coachInteractions } = useSession();
  const list = usePlateNotes(notes, plate.id);
  const [phase, setPhase] = useState<Phase>({ kind: 'card' });
  const [gone, setGone] = useState(false);

  const note = list.find((n) => n.anchor === 'postResolve');
  if (gone || !note || dismissed.has(`note:${note.id}`)) return null;

  const sure = async () => {
    let followUp: string | null = null;
    try {
      followUp =
        (await coachInteractions.record({ note, kind: 'sure' })).followedUpNote?.text ?? null;
    } catch {
      followUp = null;
    }
    setPhase({ kind: 'depth', followUp });
  };
  const askLater = () => {
    setGone(true);
    void coachInteractions.record({ note, kind: 'askLater' }).catch(() => undefined);
  };
  const close = () => {
    setGone(true);
    void (async () => {
      try {
        await coachInteractions.record({ note, kind: 'depthAnswer' });
        await coachInteractions.record({ note, kind: 'dismiss' });
      } catch {
        // Closed for this session; the card may return after a reload at worst.
      }
    })();
  };

  return phase.kind === 'card' ? (
    <CoachCard question={note.text} onSure={() => void sure()} onAskLater={askLater} />
  ) : (
    <DepthPanel followUp={phase.followUp} onClose={close} />
  );
}
