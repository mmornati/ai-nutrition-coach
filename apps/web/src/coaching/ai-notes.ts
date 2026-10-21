import {
  AI_FOLLOW_UP_QUESTION_KEY,
  AI_NOTE_QUESTION_KEY,
  buildNoteMessages,
  COACH_LIMITS,
  coachNoteDismissalKey,
  otherPlatesOfSameDay,
  parseAiCoachNote,
  parseCompositionPattern,
  slotOfPlate,
  systemClock,
  type Clock,
  type CoachLocale,
  type CoachNote,
  type CoachNoteGenerator,
  type CoachNoteStore,
  type Nutrients,
  type PlateLog,
  type Profile,
  type PromptNaming,
} from '@anc/core';
import type { CoachingAi } from '../ai';

/** Why an AI upgrade did or did not happen. Nothing here is ever shown to the person. */
export type AiNoteOutcome =
  | 'upgraded'
  | 'notReady'
  | 'noTemplateNote'
  | 'dismissed'
  | 'alreadyFollowedUp'
  | 'aiFailed'
  | 'invalid'
  | 'timedOut'
  | 'appendFailed'
  | 'sessionEnded';

export interface AiNoteDeps {
  readonly coaching: Pick<CoachingAi, 'complete' | 'getSnapshot'>;
  readonly notes: CoachNoteStore;
  readonly clock?: Clock;
  /** Read at each note, so a switch change or a language change is picked up. */
  readonly numbersOn: () => boolean;
  readonly locale: () => CoachLocale;
  readonly targets: () => Required<Nutrients>;
  readonly profile: () => Profile | undefined;
  readonly naming: PromptNaming;
  /** False once the session ended: a late answer must write nothing. */
  readonly live: () => boolean;
  /** Test seam. Default `COACH_LIMITS.noteTimeoutMs`. */
  readonly timeoutMs?: number;
}

/** The current dismissal markers, read once through the store's observer API. */
function readDismissals(notes: CoachNoteStore): Promise<ReadonlySet<string>> {
  return new Promise((resolve) => {
    let stop: (() => void) | undefined;
    let settled = false;
    const settle = (value: ReadonlySet<string>): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (stop === undefined) queueMicrotask(() => stop?.());
      else stop();
    };
    try {
      stop = notes.watchDismissals({ next: settle, error: () => settle(new Set()) });
      if (settled) stop();
    } catch {
      settle(new Set());
    }
  });
}

/**
 * Upgrades the template note of a plate to an AI-written one, in place. The template note is
 * ALREADY stored when this runs (the log never waits for the AI); if the AI answers in time with a
 * valid text, a second note row is appended and the card (which watches the plate's notes) shows
 * it instead of the template one. Any other outcome leaves the template note untouched.
 *
 * Stored without a schema change: a `CoachNote` row with `questionKey` `post.resolve.ai` and the
 * validated text in `text` (the optional follow-up is a `depthFollowUp` row with key
 * `depth.followUp.ai`). Never throws.
 */
export function createAiNoteUpgrader(deps: AiNoteDeps): {
  upgrade(args: {
    readonly plate: PlateLog;
    readonly dayPlates: readonly PlateLog[];
    readonly template: CoachNote;
  }): Promise<AiNoteOutcome>;
} {
  const clock = deps.clock ?? systemClock;
  const timeoutMs = deps.timeoutMs ?? COACH_LIMITS.noteTimeoutMs;

  return {
    async upgrade({ plate, dayPlates, template }) {
      try {
        if (deps.coaching.getSnapshot().kind !== 'ready') return 'notReady';
        // The person may already have answered or dismissed the template note, or asked to go
        // deeper: do not swap the question under them.
        const [dismissed, existing] = await Promise.all([
          readDismissals(deps.notes),
          deps.notes.forPlate(plate.id).catch((): readonly CoachNote[] => []),
        ]);
        if (dismissed.has(coachNoteDismissalKey(template.id))) return 'dismissed';
        if (existing.some((n) => n.anchor === 'depthFollowUp')) return 'alreadyFollowedUp';

        const numbersOn = deps.numbersOn();
        const messages = buildNoteMessages({
          ...deps.naming,
          locale: deps.locale(),
          numbersOn,
          plate,
          earlierPlates: otherPlatesOfSameDay(plate, dayPlates),
          slot: slotOfPlate(plate),
          targets: deps.targets(),
          profile: deps.profile(),
          hint: parseCompositionPattern(template.questionKey.replace(/^post\.resolve\./, '')),
        });

        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => {
            abort.abort();
            resolve('timeout');
          }, timeoutMs);
        });
        let result;
        try {
          result = await Promise.race([
            deps.coaching.complete(messages, {
              maxTokens: 220,
              temperature: 0.4,
              signal: abort.signal,
            }),
            timedOut,
          ]);
        } finally {
          clearTimeout(timer);
        }
        if (result === 'timeout') return 'timedOut';
        if (!deps.live()) return 'sessionEnded';
        if (result.kind !== 'text') return 'aiFailed';

        const parsed = parseAiCoachNote(result.text, numbersOn);
        if (parsed === null) return 'invalid';

        // Look again: a lock, a dismissal or a follow-up may have happened while the AI thought.
        if ((await readDismissals(deps.notes)).has(coachNoteDismissalKey(template.id))) {
          return 'dismissed';
        }
        const appended = await deps.notes.append({
          id: 0,
          plateLogId: plate.id,
          anchor: 'postResolve',
          questionKey: AI_NOTE_QUESTION_KEY,
          text: parsed.note,
          generatedAt: clock(),
        });
        if (appended.kind !== 'coachNoteAppended') return 'appendFailed';
        if (parsed.followUp !== '') {
          // Best effort: a missing follow-up only means "Sure" opens a panel with Close alone.
          await deps.notes
            .append({
              id: 0,
              plateLogId: plate.id,
              anchor: 'depthFollowUp',
              questionKey: AI_FOLLOW_UP_QUESTION_KEY,
              text: parsed.followUp,
              generatedAt: clock(),
            })
            .catch(() => undefined);
        }
        return 'upgraded';
      } catch {
        return 'aiFailed';
      }
    },
  };
}

/**
 * Wraps the template generator: the template note is written and returned first (so the log and
 * the card never wait for an AI), then, if AI coaching is on and ready, the upgrade runs in the
 * background and lands on its own.
 */
export function withAiNotes(
  base: CoachNoteGenerator,
  upgrader: ReturnType<typeof createAiNoteUpgrader>,
  onSettled?: (outcome: AiNoteOutcome) => void,
): CoachNoteGenerator {
  return {
    async generateFor(plate, context) {
      const result = await base.generateFor(plate, context);
      if (result.kind === 'coachNoteGenerated') {
        void upgrader
          .upgrade({
            plate,
            dayPlates: context?.dayPlates ?? [],
            template: result.note,
          })
          .then((outcome) => onSettled?.(outcome))
          .catch(() => undefined);
      }
      return result;
    },
  };
}
