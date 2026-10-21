import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { COACH_LIMITS } from '@anc/core';

import { useDay } from '../../app/day-context';
import { hrefs } from '../../app/router';
import { BackToToday, ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { useSessionCoachingStatus, type AskCoachNotice, type ChatEntry } from '../../coaching';
import { Button, TextField } from '../../components/primitives';
import { SupportLine } from '../../components/nutrition';
import { fill, useStrings, type Strings } from '../../i18n';

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

function Entry({ entry, s }: { readonly entry: ChatEntry; readonly s: Strings['askCoach'] }) {
  const who = entry.role === 'user' ? s.you : s.coach;
  return (
    <li className="border-rule border-b py-3 last:border-b-0">
      <p className="font-display text-label text-signal-muted uppercase">{who}</p>
      {entry.role === 'user' ? (
        <p className="text-lead [overflow-wrap:anywhere]">{entry.text}</p>
      ) : entry.kind === 'answer' ? (
        <>
          <p className="text-lead [overflow-wrap:anywhere] whitespace-pre-line">{entry.text}</p>
          <p className="text-body-small text-porcelain-dim mt-1">{s.aiMark}</p>
        </>
      ) : entry.kind === 'support' ? (
        <>
          <p className="text-lead">
            {entry.signal === 'eatingWorry' ? s.supportEating : s.supportMedical}
          </p>
          {entry.signal === 'eatingWorry' && <SupportLine className="mt-2" />}
        </>
      ) : (
        <p className="text-lead">{s.unsure}</p>
      )}
    </li>
  );
}

/**
 * Ask the coach: a text-only conversation about the last seven days of meals, answered by the AI
 * the person chose and agreed to coaching for. It lives in memory for this unlocked session only.
 * Without an AI, or without the person's yes, it says how to turn it on (a link to Your AI)
 * instead of ending in a dead end. A worry about eating or a symptom is answered on the device
 * with the support line and is never sent.
 */
export function AskCoachScreen() {
  const all = useStrings();
  const s = all.askCoach;
  const { askCoach } = useSession();
  const { plates } = useDay();
  const status = useSessionCoachingStatus();
  const state = useSyncExternalStore(askCoach.subscribe, askCoach.getSnapshot);
  const [draft, setDraft] = useState('');

  const ready = status.kind === 'ready';
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
    <ScreenFrame current="today" header={<ScreenHeader back={<BackToToday />} title={s.title} />}>
      <div className="flex max-w-3xl flex-col gap-5 px-5 pt-6 pb-8 lg:px-7">
        <p className="text-lead">{s.intro}</p>
        <p className="text-body-small text-porcelain-dim">{s.memory}</p>

        {!ready ? (
          <section aria-labelledby="ask-coach-off" className="flex flex-col gap-3">
            <h2
              id="ask-coach-off"
              className="font-display text-section text-signal-muted uppercase"
            >
              {s.offTitle}
            </h2>
            <p className="text-lead">
              {status.kind === 'needsConsent'
                ? fill(s.offNeedsConsent, { host: status.destination.host })
                : s.offNoAi}
            </p>
            <a
              href={hrefs.section('ai')}
              className="text-porcelain inline-flex min-h-12 items-center self-start underline underline-offset-4"
            >
              {s.openYourAi}
            </a>
          </section>
        ) : (
          <>
            <section aria-labelledby="ask-coach-log">
              <h2 id="ask-coach-log" className="sr-only">
                {s.conversation}
              </h2>
              {/* Announced politely as answers arrive. */}
              <div role="log" aria-live="polite" aria-relevant="additions">
                <ol className="flex flex-col">
                  {state.entries.map((entry) => (
                    <Entry key={entry.id} entry={entry} s={s} />
                  ))}
                  {state.pending !== null && (
                    <Entry entry={{ id: 0, role: 'user', text: state.pending }} s={s} />
                  )}
                </ol>
              </div>
              <p role="status" className="text-body-small text-porcelain-dim mt-2 empty:hidden">
                {busy ? s.thinking : ''}
              </p>
            </section>

            {state.limitReached ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-lead">{fill(s.limit, { max: COACH_LIMITS.chatTurns })}</p>
                <Button
                  variant="outline-porcelain"
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
                  <Button
                    type="submit"
                    variant="solid-porcelain"
                    busy={busy}
                    busyLabel={s.thinking}
                  >
                    {s.send}
                  </Button>
                  <p className="text-body-small text-porcelain-dim">
                    {fill(s.asked, { count: state.asked, max: COACH_LIMITS.chatTurns })}
                  </p>
                </div>
              </form>
            )}
            <p role="status" className="text-body text-porcelain empty:hidden">
              {state.notice === null ? '' : noticeText(s, state.notice)}
            </p>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
