import { useState, useSyncExternalStore } from 'react';
import { stepLabel } from '../../app/step-copy';
import { useSession } from '../../app/session';
import { QuietButton } from '../../components/primitives';
import { fill, useStrings } from '../../i18n';

/**
 * The one step the person accepted from the coach, shown quietly on Today: "This week: a portion of
 * vegetables at lunch", with "Done with this" and "Drop it". No count, no streak, no ticking off
 * days: both choices simply remove it. Nothing renders without an active step.
 */
export function StepLine() {
  const all = useStrings();
  const s = all.coachStep;
  const { step } = useSession();
  const current = useSyncExternalStore(step.subscribe, step.current);
  const [failed, setFailed] = useState(false);
  if (current === null) return null;

  const end = () => {
    step.clear().then(
      () => setFailed(false),
      () => setFailed(true),
    );
  };
  return (
    <div className="mx-5 mt-3 flex flex-col items-start lg:mx-7">
      <p className="text-thread text-meta">{fill(s.thisWeek, { step: stepLabel(all, current) })}</p>
      <div className="flex flex-wrap gap-x-4">
        <QuietButton onClick={end}>{s.done}</QuietButton>
        <QuietButton onClick={end}>{s.drop}</QuietButton>
      </div>
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {failed ? s.saveFailed : ''}
      </p>
    </div>
  );
}
