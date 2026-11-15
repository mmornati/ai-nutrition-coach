import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  COACH_LIMITS,
  coachNoteDismissalKey,
  containsNumberWithUnit,
  isAiCoachNote,
  slotOfPlate,
  type CoachNote,
  type PlateLog,
  type SupportSignal,
} from '@anc/core';

import { useDay } from '../../app/day-context';
import { hrefs } from '../../app/router';
import { ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { stepLabel } from '../../app/step-copy';
import { useSessionCoachingStatus, type AskCoachNotice, type ChatEntry } from '../../coaching';
import { Button, QuietButton, TextField } from '../../components/primitives';
import { SupportLine, useShowNumbers, useTargets } from '../../components/nutrition';
import { formatWhole } from '../../components/nutrition/format';
import { fill, useLocale, useStrings, type Strings } from '../../i18n';
import { intlTag } from '../../i18n/locale';
import { SECTIONS } from '../settings/sections';
import { WeekReview } from '../week/WeekReview';
import { resolveNoteText, useDismissals } from '../today/coach';

/** The calm line for the reason the last question got no answer. */
function noticeText(s: Strings['askCoach'], notice: AskCoachNotice): string {
  switch (notice.kind) {
    case 'busy':
      return s.busy;
    case 'consent':
      return s.consent;
    case 'unavailable':
      return s.unavailable;
    case 'failure':
      return s.failure;
  }
}

const SUPPORT_COPY: Readonly<Record<SupportSignal, keyof Strings['askCoach']>> = {
  eatingWorry: 'supportEating',
  medicalSymptom: 'supportMedical',
  urgent: 'supportUrgent',
  selfHarm: 'supportSelfHarm',
  extremeDiet: 'supportExtreme',
};

const SUPPORT_LINE_SIGNALS: ReadonlySet<SupportSignal> = new Set(['eatingWorry', 'extremeDiet']);

function Entry({
  entry,
  s,
  showNumbers,
}: {
  readonly entry: ChatEntry;
  readonly s: Strings['askCoach'];
  readonly showNumbers: boolean;
}) {
  const who = entry.role === 'user' ? s.you : s.coach;
  return (
    <li className="border-seam border-b py-3 last:border-b-0">
      <p className="font-display text-label text-thread">{who}</p>
      {entry.role === 'user' ? (
        <p className="text-lead [overflow-wrap:anywhere]">{entry.text}</p>
      ) : entry.kind === 'answer' ? (
        <>
          {/* An answer that quotes amounts waits while numbers are turned off. */}
          <p className="text-lead [overflow-wrap:anywhere] whitespace-pre-line">
            {!showNumbers && containsNumberWithUnit(entry.text) ? s.hiddenByNumbers : entry.text}
          </p>
          <p className="text-body-small text-ink-soft mt-1">{s.aiMark}</p>
        </>
      ) : entry.kind === 'support' ? (
        <>
          <p className="text-lead">{s[SUPPORT_COPY[entry.signal]]}</p>
          {SUPPORT_LINE_SIGNALS.has(entry.signal) && <SupportLine className="mt-2" />}
        </>
      ) : (
        <>
          <p className="text-lead">{entry.weight === true ? s.unsureWeight : s.unsure}</p>
          {entry.weight === true && (
            <a
              href={hrefs.section(SECTIONS.profile)}
              className="text-ink inline-flex min-h-12 items-center underline underline-offset-4"
            >
              {s.openProfile}
            </a>
          )}
        </>
      )}
    </li>
  );
}

/** The newest notes of the plates in view: one per plate, newest plate first, at most five. */
function useRecentNotes(plates: readonly PlateLog[]): readonly {
  readonly plate: PlateLog;
  readonly notes: readonly CoachNote[];
}[] {
  const { notes } = useSession();
  const [rows, setRows] = useState<
    readonly { readonly plate: PlateLog; readonly notes: readonly CoachNote[] }[]
  >([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const recent = [...plates].sort((a, b) => b.loggedAtUtc - a.loggedAtUtc).slice(0, 30);
      const lists = await Promise.all(
        recent.map((plate) =>
          notes.forPlate(plate.id).then(
            (list) => ({ plate, notes: list }),
            () => ({ plate, notes: [] as readonly CoachNote[] }),
          ),
        ),
      );
      if (live) setRows(lists.filter((row) => row.notes.some((n) => n.anchor === 'postResolve')));
    })();
    return () => {
      live = false;
    };
  }, [notes, plates]);
  return rows;
}

/** The one step: what it is, with "Done with this" and "Drop it", or a line saying there is none. */
function StepSection() {
  const all = useStrings();
  const { step } = useSession();
  const current = useSyncExternalStore(step.subscribe, step.current);
  const [failed, setFailed] = useState(false);
  const end = () => {
    step.clear().then(
      () => setFailed(false),
      () => setFailed(true),
    );
  };
  return (
    <section aria-labelledby="coach-step" className="flex flex-col gap-1">
      <h2 id="coach-step" className="font-display text-section text-thread">
        {all.coachPage.stepTitle}
      </h2>
      {current === null ? (
        <p className="text-lead">{all.coachPage.stepNone}</p>
      ) : (
        <>
          <p className="text-lead">
            {fill(all.coachStep.thisWeek, { step: stepLabel(all, current) })}
          </p>
          <div className="flex flex-wrap gap-x-4">
            <QuietButton onClick={end}>{all.coachStep.done}</QuietButton>
            <QuietButton onClick={end}>{all.coachStep.drop}</QuietButton>
          </div>
        </>
      )}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {failed ? all.coachStep.saveFailed : ''}
      </p>
    </section>
  );
}

/** The latest notes of the last days, as the plates showed them. */
function NotesSection({ plates }: { readonly plates: readonly PlateLog[] }) {
  const all = useStrings();
  const { locale } = useLocale();
  const showNumbers = useShowNumbers();
  const { notes } = useSession();
  const dismissed = useDismissals(notes);
  const rows = useRecentNotes(plates);
  const day = new Intl.DateTimeFormat(intlTag(locale), { weekday: 'long' });
  const shown = rows
    .flatMap((row) => {
      // A note the person dismissed under the plate stays dismissed here: the one question is gone
      // for good when either of its versions (the template's or the AI's) was dismissed.
      const versions = [
        row.notes.find((n) => n.anchor === 'postResolve' && !isAiCoachNote(n)),
        row.notes.find((n) => n.anchor === 'postResolve' && isAiCoachNote(n)),
      ];
      if (versions.some((n) => n !== undefined && dismissed.has(coachNoteDismissalKey(n.id)))) {
        return [];
      }
      const text = resolveNoteText(all, locale, row.notes, showNumbers);
      return text === null ? [] : [{ plate: row.plate, text }];
    })
    .slice(0, 5);
  return (
    <section aria-labelledby="coach-notes" className="flex flex-col gap-2">
      <h2 id="coach-notes" className="font-display text-section text-thread">
        {all.coachPage.notesTitle}
      </h2>
      {shown.length === 0 ? (
        <p className="text-lead">{all.coachPage.notesNone}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map(({ plate, text }) => (
            <li key={plate.id}>
              <p className="text-body-small text-ink-soft">
                {fill(all.coachPage.notesFor, {
                  day: day.format(new Date(plate.loggedAtUtc)),
                  meal: all.slots[slotOfPlate(plate)],
                })}
              </p>
              <p className="text-lead [overflow-wrap:anywhere]">{text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The daily guide, with a link to Profile; without figures while numbers are turned off. */
function GuideSection() {
  const all = useStrings();
  const { locale } = useLocale();
  const { profile } = useSession();
  const targets = useTargets();
  const showNumbers = useShowNumbers();
  const personal = useSyncExternalStore(profile.subscribe, profile.personal);
  const p = all.coachPage;
  return (
    <section aria-labelledby="coach-guide" className="flex flex-col gap-1">
      <h2 id="coach-guide" className="font-display text-section text-thread">
        {p.guideTitle}
      </h2>
      <p className="text-lead">
        {!showNumbers
          ? p.guideNoNumbers
          : personal
            ? fill(p.guidePersonal, {
                kcal: formatWhole(targets.energyKcal, locale),
                protein: formatWhole(targets.protein, locale),
              })
            : p.guideReference}
      </p>
      <a
        href={hrefs.section(SECTIONS.profile)}
        className="text-ink inline-flex min-h-12 items-center self-start underline underline-offset-4"
      >
        {p.profileLink}
      </a>
    </section>
  );
}

/** The conversation: only with an AI the person chose and agreed to coaching for. */
function Conversation() {
  const all = useStrings();
  const s = all.askCoach;
  const { askCoach } = useSession();
  const { plates } = useDay();
  const state = useSyncExternalStore(askCoach.subscribe, askCoach.getSnapshot);
  const showNumbers = useShowNumbers();
  const [draft, setDraft] = useState('');
  const busy = state.pending !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || state.limitReached || draft.trim() === '') return;
    const question = draft;
    void askCoach.send(question, plates).then((outcome) => {
      // The question leaves the box once it was taken (answered, routed to support, or not
      // understood); on a busy server or a failure it stays so it can be sent again.
      if (outcome === 'answered' || outcome === 'support' || outcome === 'unsure') {
        setDraft((now) => (now === question ? '' : now));
      }
    });
  };

  return (
    <section aria-labelledby="coach-chat" className="flex flex-col gap-3">
      <h2 id="coach-chat" className="font-display text-section text-thread">
        {all.coachPage.chatTitle}
      </h2>
      <p className="text-lead">{s.intro}</p>
      <p className="text-body-small text-ink-soft">{s.memory}</p>
      <div>
        <h3 className="sr-only">{s.conversation}</h3>
        {/* Announced politely as answers arrive. */}
        <div role="log" aria-live="polite" aria-relevant="additions">
          <ol className="flex flex-col">
            {state.entries.map((entry) => (
              <Entry key={entry.id} entry={entry} s={s} showNumbers={showNumbers} />
            ))}
          </ol>
        </div>
        {/* The question being answered: shown, but not announced twice (it joins the log above
            once it has its answer). */}
        {state.pending !== null && (
          <p aria-hidden="true" className="text-ink-soft py-3 text-lead [overflow-wrap:anywhere]">
            {s.you}: {state.pending}
          </p>
        )}
        <p role="status" className="text-body-small text-ink-soft mt-2 empty:hidden">
          {busy ? s.thinking : ''}
        </p>
      </div>

      {state.limitReached ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-lead">{fill(s.limit, { max: COACH_LIMITS.chatTurns })}</p>
          <Button
            variant="secondary"
            onClick={() => {
              askCoach.reset();
              setDraft('');
            }}
          >
            {s.newConversation}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <TextField
            label={s.inputLabel}
            placeholder={s.inputHint}
            autoComplete="off"
            enterKeyHint="send"
            maxLength={COACH_LIMITS.inputChars}
            value={draft}
            message={fill(s.counter, { count: draft.length, max: COACH_LIMITS.inputChars })}
            onChange={(e) => {
              setDraft(e.target.value);
              askCoach.clearNotice();
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" busy={busy} busyLabel={s.thinking}>
              {s.send}
            </Button>
            {state.entries.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  askCoach.reset();
                  setDraft('');
                }}
              >
                {s.newConversation}
              </Button>
            )}
            <p className="text-body-small text-ink-soft">
              {fill(s.asked, { count: state.asked, max: COACH_LIMITS.chatTurns })}
            </p>
          </div>
        </form>
      )}
      <p role="status" className="text-body text-ink empty:hidden">
        {state.notice === null ? '' : noticeText(s, state.notice)}
      </p>
    </section>
  );
}

/**
 * The coach page, useful with or without an AI: the one step the person chose, the latest notes of
 * the last days, the week in short (energy against the guide, the food itself, the step looked
 * back on), the daily guide with a link to Profile and, only when an AI is chosen and agreed to,
 * the conversation. Without one, a single line says so, with the link, and the page is otherwise
 * the same: nothing here is greyed out or locked.
 */
export function AskCoachScreen() {
  const all = useStrings();
  const p = all.coachPage;
  const { plates } = useDay();
  const status = useSessionCoachingStatus();
  const ready = status.kind === 'ready';

  return (
    <ScreenFrame current="coach" header={<ScreenHeader title={p.title} />}>
      <div className="flex max-w-3xl flex-col gap-6 px-5 pt-6 pb-8 lg:px-7">
        <p className="text-lead">{p.intro}</p>
        <StepSection />
        <NotesSection plates={plates} />
        <WeekReview />
        <GuideSection />
        {ready ? (
          <Conversation />
        ) : (
          <section aria-labelledby="coach-ai" className="flex flex-col gap-1">
            <h2 id="coach-ai" className="sr-only">
              {all.askCoach.title}
            </h2>
            <p className="text-body-small text-ink-soft">
              {status.kind === 'needsConsent' ? p.aiNeedsConsent : p.aiNone}
            </p>
            <a
              href={hrefs.section('ai')}
              className="text-ink inline-flex min-h-12 items-center self-start underline underline-offset-4"
            >
              {status.kind === 'needsConsent' ? p.aiLinkConsent : p.aiLink}
            </a>
          </section>
        )}
      </div>
    </ScreenFrame>
  );
}
