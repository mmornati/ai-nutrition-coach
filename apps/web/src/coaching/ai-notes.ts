import {
  AI_FOLLOW_UP_QUESTION_KEY,
  AI_NOTE_QUESTION_KEY,
  aiQuestionKey,
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
import { NO_AI_CONTEXT, type AiContextProvider } from './context';
import {
  completeBounded,
  reviewContext,
  reviewOutputText,
  ReviewGate,
  startDeadline,
} from './review';

/** Why an AI upgrade did or did not happen. Nothing here is ever shown to the person. */
export type AiNoteOutcome =
  | 'upgraded'
  | 'notReady'
  | 'noTemplateNote'
  | 'dismissed'
  | 'alreadyFollowedUp'
  | 'interacted'
  | 'plateGone'
  | 'aiFailed'
  | 'invalid'
  /** The second pass (the AI's own check of the text) said the text is not safe to show. */
  | 'reviewUnsafe'
  /** The second pass failed: an error, a timeout, a rate limit, an unreadable reply. */
  | 'reviewFailed'
  /** Too many upgrades waiting, or a recent rate limit: this plate keeps the built-in note. */
  | 'rateLimited'
  | 'timedOut'
  | 'appendFailed'
  | 'sessionEnded';

export interface AiNoteDeps {
  readonly coaching: Pick<CoachingAi, 'complete' | 'getSnapshot'> &
    Partial<Pick<CoachingAi, 'coolingDown'>>;
  readonly notes: CoachNoteStore;
  readonly clock?: Clock;
  /** Read at each note, so a switch change or a language change is picked up. */
  readonly numbersOn: () => boolean;
  readonly locale: () => CoachLocale;
  readonly targets: () => Required<Nutrients>;
  readonly profile: () => Profile | undefined;
  /** The goal, the step and the switches, read at each note (default: no weight talk). */
  readonly context?: AiContextProvider;
  readonly naming: PromptNaming;
  /** Whether the person already answered the template note (Sure, Ask later, Close) this session. */
  readonly hasInteracted?: (noteId: number) => boolean;
  /** Whether the plate still exists (it may have been removed while the AI thought). */
  readonly plateExists?: (plate: PlateLog) => Promise<boolean>;
  /** False once the session ended: a late answer must write nothing. */
  readonly live: () => boolean;
  /** The session's second-pass state: its abort signal reaches every call of an upgrade. */
  readonly reviews?: ReviewGate;
  /**
   * Test seam. Default `COACH_LIMITS.noteTimeoutMs`: the TOTAL for the coach call and its review.
   * The coach call gets five eighths of it (5 s of 8 s); the review gets what is left.
   */
  readonly timeoutMs?: number;
  /** Test seam. Default `STORE_GRACE_MS`: what the store reads may add to `timeoutMs`. */
  readonly storeGraceMs?: number;
}

/** Upgrades running or waiting at once; a further plate keeps the built-in note. */
const MAX_PENDING_UPGRADES = 3;

/**
 * What a whole upgrade may take beyond its call and review budget (`timeoutMs`): the store reads
 * around them. A store read that never answers must not hold one of the slots for the rest of the
 * session.
 */
const STORE_GRACE_MS = 4000;

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

  // One at a time: each upgrade is two calls (the note, then its review), and a burst of plates
  // would otherwise spend the instance proxy's per-client limit in a few seconds.
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  const gate = deps.reviews ?? new ReviewGate({ live: deps.live });

  type Args = {
    readonly plate: PlateLog;
    readonly dayPlates: readonly PlateLog[];
    readonly template: CoachNote;
  };

  async function doUpgrade(
    { plate, dayPlates, template }: Args,
    box: { readonly signal: AbortSignal },
  ): Promise<AiNoteOutcome> {
    // The session is live and this upgrade is still inside its time box: checked before every
    // call and every write.
    const alive = (): boolean => deps.live() && !gate.ended() && !box.signal.aborted;
    try {
      // A plate that waited in the queue across a lock sends nothing.
      if (!alive()) return 'sessionEnded';
      if (deps.coaching.getSnapshot().kind !== 'ready') return 'notReady';
      if (deps.coaching.coolingDown?.() === true) return 'rateLimited';
      // The person may already have answered or dismissed the template note, or asked to go
      // deeper: do not swap the question under them.
      const [dismissed, existing] = await Promise.all([
        readDismissals(deps.notes),
        deps.notes.forPlate(plate.id).catch((): readonly CoachNote[] => []),
      ]);
      if (dismissed.has(coachNoteDismissalKey(template.id))) return 'dismissed';
      if (existing.some((n) => n.anchor === 'depthFollowUp')) return 'alreadyFollowedUp';

      if (deps.hasInteracted?.(template.id) === true) return 'interacted';

      const numbersOn = deps.numbersOn();
      const locale = deps.locale();
      const context = deps.context?.() ?? NO_AI_CONTEXT;
      const messages = buildNoteMessages({
        ...deps.naming,
        locale,
        numbersOn,
        plate,
        earlierPlates: otherPlatesOfSameDay(plate, dayPlates),
        slot: slotOfPlate(plate),
        targets: deps.targets(),
        profile: deps.profile(),
        hint: parseCompositionPattern(template.questionKey.replace(/^post\.resolve\./, '')),
        weightHelp: context.weightHelp,
        step: context.step,
        weightTrend: context.weightTrend,
      });

      if (!alive()) return 'sessionEnded';
      const callStartedAt = Date.now();
      const result = await completeBounded(
        deps.coaching,
        messages,
        { maxTokens: 220, temperature: 0.4 },
        { timeoutMs: Math.round((timeoutMs * 5) / 8), signal: [box.signal, gate.signal] },
      );
      // The review gets what the call did not use of the total (only the wait on the network counts,
      // not the local checks).
      const callMs = Date.now() - callStartedAt;
      if (result.kind === 'timeout') return 'timedOut';
      if (result.kind === 'ended' || !alive()) return 'sessionEnded';
      if (result.kind !== 'text') return 'aiFailed';

      const parsed = parseAiCoachNote(result.text, numbersOn, locale, context.limits);
      if (parsed === null) return 'invalid';

      // The second pass: the same AI classifies the note (with its follow-up, as one text).
      // Anything but a clear "ok" keeps the built-in note.
      const reviewed = await reviewOutputText(
        deps.coaching,
        parsed.followUp === '' ? parsed.note : `${parsed.note}\n${parsed.followUp}`,
        reviewContext(locale, context.limits),
        { timeoutMs: timeoutMs - callMs, gate },
      );
      if (!alive()) return 'sessionEnded';
      if (reviewed.kind === 'unsafe') return 'reviewUnsafe';
      if (reviewed.kind !== 'ok') return 'reviewFailed';

      // Look again: a dismissal, a tap on Sure, a follow-up or the plate's removal may have
      // happened while the AI thought. Never swap the question under the person, never append a
      // second follow-up, never write a row for a plate that is gone.
      const [dismissedNow, rows] = await Promise.all([
        readDismissals(deps.notes),
        deps.notes.forPlate(plate.id),
      ]);
      if (dismissedNow.has(coachNoteDismissalKey(template.id))) return 'dismissed';
      if (rows.some((n) => n.anchor === 'depthFollowUp')) return 'alreadyFollowedUp';
      if (deps.hasInteracted?.(template.id) === true) return 'interacted';
      if (deps.plateExists !== undefined && !(await deps.plateExists(plate))) return 'plateGone';
      if (!alive()) return 'sessionEnded';
      const appended = await deps.notes.append({
        id: 0,
        plateLogId: plate.id,
        anchor: 'postResolve',
        questionKey: aiQuestionKey(AI_NOTE_QUESTION_KEY, locale),
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
            questionKey: aiQuestionKey(AI_FOLLOW_UP_QUESTION_KEY, locale),
            text: parsed.followUp,
            generatedAt: clock(),
          })
          .catch(() => undefined);
      }
      return 'upgraded';
    } catch {
      return 'aiFailed';
    }
  }

  /**
   * The whole upgrade inside one time box (the call and its review, plus a grace for the store
   * reads): a read that never answers ends as `timedOut`, writes nothing afterwards and frees the
   * slot, so the queue cannot stay full for the rest of the session.
   */
  async function boxed(args: Args): Promise<AiNoteOutcome> {
    if (!deps.live() || gate.ended()) return 'sessionEnded';
    const box = startDeadline(timeoutMs + (deps.storeGraceMs ?? STORE_GRACE_MS), gate.signal);
    try {
      return await Promise.race([
        doUpgrade(args, box),
        box.done.then((why): AiNoteOutcome => (why === 'timeout' ? 'timedOut' : 'sessionEnded')),
      ]);
    } catch {
      return 'aiFailed';
    } finally {
      box.stop();
      // Whatever is still running past the box sees it as over.
      box.abort();
    }
  }

  return {
    upgrade(args) {
      if (pending >= MAX_PENDING_UPGRADES) return Promise.resolve('rateLimited');
      pending++;
      const run = tail.then(() => boxed(args)).finally(() => void pending--);
      tail = run.catch(() => undefined);
      return run;
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
