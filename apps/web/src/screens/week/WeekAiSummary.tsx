import { useState } from 'react';
import type { WeeklyReview } from '@anc/core';

import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { useSessionCoachingStatus, type WeekSummaryResult } from '../../coaching';
import { Button } from '../../components/primitives';
import { fill, useStrings, type Strings } from '../../i18n';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'done'; readonly result: WeekSummaryResult };

function problemText(s: Strings['week']['review']['ai'], result: WeekSummaryResult): string {
  switch (result.kind) {
    case 'busy':
      return s.busy;
    case 'unsure':
      return s.unsure;
    case 'consent':
      return s.needsConsent;
    case 'unavailable':
      return s.needsSetup;
    case 'failure':
      return s.failure;
    case 'text':
      return '';
  }
}

/**
 * "Ask the coach about this week": an optional AI paragraph under the rule-based review. It never
 * replaces the review, only the person's tap sends anything, and with no AI (or no yes to AI
 * coaching) it says how to turn it on instead of doing nothing.
 */
export function WeekAiSummary({ review }: { readonly review: WeeklyReview }) {
  const s = useStrings().week.review.ai;
  const { summariseWeek } = useSession();
  const status = useSessionCoachingStatus();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const ask = () => {
    if (phase.kind === 'asking') return;
    setPhase({ kind: 'asking' });
    void summariseWeek(review).then((result) => setPhase({ kind: 'done', result }));
  };

  const ready = status.kind === 'ready';
  const result = phase.kind === 'done' ? phase.result : null;
  const text = result?.kind === 'text' ? result.text : '';

  return (
    <div className="mt-6">
      {ready ? (
        <>
          <Button
            variant="outline-porcelain"
            busy={phase.kind === 'asking'}
            busyLabel={s.reading}
            onClick={ask}
          >
            {s.button}
          </Button>
          <p className="text-body-small text-porcelain-dim mt-2">
            {fill(s.note, { host: status.destination.host })}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <p className="text-lead">{status.kind === 'noAi' ? s.needsSetup : s.needsConsent}</p>
          <a
            href={hrefs.section('ai')}
            className="text-porcelain inline-flex min-h-12 items-center underline underline-offset-4"
          >
            {s.open}
          </a>
        </div>
      )}
      <div role="status" className="mt-3 empty:hidden">
        {text !== '' ? (
          <>
            <h3 className="text-lead mb-1 font-semibold">{s.heading}</h3>
            <p className="text-lead [overflow-wrap:anywhere] whitespace-pre-line">{text}</p>
            <p className="text-body-small text-porcelain-dim mt-1">{s.mark}</p>
          </>
        ) : result !== null ? (
          <p className="text-body text-porcelain">{problemText(s, result)}</p>
        ) : null}
      </div>
    </div>
  );
}
