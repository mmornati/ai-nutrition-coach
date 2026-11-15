import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  coachNoteDismissalKey,
  containsNumberWithUnit,
  aiNoteLocale,
  isAiCoachNote,
  parseCompositionPattern,
  slotOfPlate,
  splitQuestionKey,
  stepOfferFor,
  type CoachNote,
  type CoachNoteStore,
  type PlateLog,
} from '@anc/core';
import { CoachCard, DepthPanel } from '../../components/day';
import { coachCopy, coachCopyForDisplay, coachKeyHasNumbers } from '../../app/coach-copy';
import { useSession } from '../../app/session';
import { useShowNumbers } from '../../components/nutrition';
import { currentLocale, useLocale, useStrings, type Strings } from '../../i18n';
import type { Locale } from '../../i18n/locale';

/**
 * A stored note's question in the CURRENT language: looked up by its key, so a note written while
 * the app spoke English reads in French after a switch. The stored text is the fallback for a key
 * the catalogue no longer has.
 */
export const noteQuestion = (
  all: Strings,
  note: Pick<CoachNote, 'questionKey' | 'text'>,
  locale: Locale = currentLocale(),
): string => coachCopy(all, note.questionKey, {}, locale) ?? note.text;

/**
 * The text of the note a plate shows now, or `null` when it shows none: an AI note in the interface
 * language (and without figures while numbers are off), else the template note in the current
 * catalogue, else nothing. The same choice `PlateCoach` makes, for the coach page.
 */
export function resolveNoteText(
  all: Strings,
  locale: Locale,
  list: readonly CoachNote[],
  showNumbers: boolean,
): string | null {
  const template = list.find((n) => n.anchor === 'postResolve' && !isAiCoachNote(n));
  const ai = list.find((n) => n.anchor === 'postResolve' && isAiCoachNote(n));
  if (
    ai !== undefined &&
    aiNoteLocale(ai) === locale &&
    (showNumbers || !containsNumberWithUnit(ai.text))
  ) {
    return ai.text;
  }
  if (template === undefined) return null;
  const text = coachCopyForDisplay(all, template.questionKey, showNumbers, locale);
  if (text !== undefined) return text;
  return showNumbers || !coachKeyHasNumbers(template.questionKey) ? template.text : null;
}

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
  | { readonly kind: 'card' }
  /** `note` is the note that was shown when Sure was tapped: Close is recorded against it. */
  | { readonly kind: 'depth'; readonly note: CoachNote; readonly followUp: CoachNote | null };

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
  const { notes, coachInteractions, step, clock } = useSession();
  const activeStep = useSyncExternalStore(step.subscribe, step.current);
  const all = useStrings();
  const { locale } = useLocale();
  const list = usePlateNotes(notes, plate.id);
  const [phase, setPhase] = useState<Phase>({ kind: 'card' });
  const [gone, setGone] = useState(false);
  const showNumbers = useShowNumbers();

  const template = list.find((n) => n.anchor === 'postResolve' && !isAiCoachNote(n));
  const aiNote = list.find((n) => n.anchor === 'postResolve' && isAiCoachNote(n));
  // An AI-written note replaces the template one in place, unless it was written in another
  // language than the interface now speaks, or it quotes amounts while numbers are off (the person
  // may have changed either since): then the template note stands.
  const usableAi = (n: CoachNote): boolean =>
    aiNoteLocale(n) === locale && (showNumbers || !containsNumberWithUnit(n.text));
  const useAi = aiNote !== undefined && usableAi(aiNote);
  const note = useAi ? aiNote : template;
  // The one question is dismissed for good when either of its two versions was.
  const isDismissed = [template, aiNote].some(
    (n) => n !== undefined && dismissed.has(coachNoteDismissalKey(n.id)),
  );
  if (gone || !note || isDismissed) return null;
  // A note that quotes nutrient numbers stays out of sight while numbers are turned off, unless
  // the catalogue has the same line without figures.
  const templateText = coachCopyForDisplay(all, note.questionKey, showNumbers, locale);
  if (
    !useAi &&
    !showNumbers &&
    templateText === undefined &&
    coachKeyHasNumbers(note.questionKey)
  ) {
    return null;
  }
  // The AI's own follow-up (stored beside its note) opens under the AI note, under the same
  // language and numbers checks; the template note asks the core to append its bounded one.
  const aiFollowUp = list.find((n) => n.anchor === 'depthFollowUp' && isAiCoachNote(n));
  const storedFollowUp =
    useAi && aiFollowUp !== undefined && usableAi(aiFollowUp) ? aiFollowUp : null;

  const sure = async () => {
    let followUp: CoachNote | null;
    try {
      followUp =
        (await coachInteractions.record({ note, kind: 'sure' })).followedUpNote ?? storedFollowUp;
    } catch {
      followUp = null;
    }
    setPhase({ kind: 'depth', note, followUp });
  };
  // The one small step this note can offer, taken from the template pattern it is built on (an AI
  // note sits beside it). Only while no other step is active.
  const pattern =
    template === undefined
      ? null
      : parseCompositionPattern(template.questionKey.replace(/^post\.resolve\./, ''));
  const offer =
    activeStep === null && pattern !== null && template !== undefined
      ? stepOfferFor(pattern, slotOfPlate(plate), {
          food: splitQuestionKey(template.questionKey).params['food'],
        })
      : null;
  const tryIt = () => {
    if (offer === null) return;
    step.accept(offer, clock()).then(
      (accepted) => {
        if (accepted) askLater();
      },
      () => undefined,
    );
  };
  const askLater = () => {
    setGone(true);
    void coachInteractions.record({ note, kind: 'askLater' }).catch(() => undefined);
  };
  const close = (shown: CoachNote) => {
    setGone(true);
    void (async () => {
      try {
        await coachInteractions.record({ note: shown, kind: 'depthAnswer' });
        await coachInteractions.record({ note: shown, kind: 'dismiss' });
      } catch {
        // Closed for this session; the card may return after a reload at worst.
      }
    })();
  };

  return phase.kind === 'card' ? (
    <CoachCard
      question={useAi ? note.text : (templateText ?? noteQuestion(all, note, locale))}
      {...(useAi ? { aiMark: all.coach.aiMark } : {})}
      {...(offer !== null ? { tryLabel: all.coachStep.offer, onTry: tryIt } : {})}
      onSure={() => void sure()}
      onAskLater={askLater}
    />
  ) : (
    <DepthPanel
      followUp={phase.followUp === null ? null : noteQuestion(all, phase.followUp, locale)}
      {...(phase.followUp !== null && isAiCoachNote(phase.followUp)
        ? { aiMark: all.coach.aiMark }
        : {})}
      onClose={() => close(phase.note)}
    />
  );
}
