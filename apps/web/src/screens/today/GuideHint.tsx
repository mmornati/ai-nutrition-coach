import { useSyncExternalStore } from 'react';
import { useShowNumbers, useTargets, isPersonal } from '../../components/nutrition';
import { useStrings } from '../../i18n';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { SECTIONS } from '../settings/sections';

/**
 * One quiet, dismissible line on Today: shown only when the person set the first-run welcome aside
 * and there is still no guide of their own. It says what the day is shown against and where to add
 * a few details. Closing it is remembered (and synced); it is never shown again.
 */
export function GuideHint() {
  const s = useStrings().today;
  const { notices } = useSession();
  const state = useSyncExternalStore(notices.subscribe, notices.snapshot);
  const showNumbers = useShowNumbers();
  const personal = isPersonal(useTargets());
  if (!showNumbers || personal || state.welcome !== 'skipped' || state.guideHintDismissed) {
    return null;
  }
  return (
    <div className="mx-5 mt-3 flex flex-col items-start lg:mx-7">
      <p className="text-thread text-meta">{s.guideHint}</p>
      <div className="flex flex-wrap gap-x-4">
        <a
          href={hrefs.section(SECTIONS.profile)}
          className="text-ink-soft inline-flex min-h-12 items-center text-lead underline underline-offset-4"
        >
          {s.guideHintLink}
        </a>
        <button
          type="button"
          onClick={() => void notices.dismissGuideHint().catch(() => undefined)}
          className="text-ink-soft inline-flex min-h-12 cursor-pointer items-center bg-transparent text-lead underline underline-offset-4"
        >
          {s.guideHintDismiss}
        </button>
      </div>
    </div>
  );
}
