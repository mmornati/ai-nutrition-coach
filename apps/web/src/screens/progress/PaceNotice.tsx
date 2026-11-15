import { useSyncExternalStore } from 'react';
import { cn } from '../../components/primitives';
import { useStrings } from '../../i18n';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { SECTIONS } from '../settings/sections';
import { usePaceNoticeVisible } from './use-weight-progress';

/**
 * The calm fixed line when the weight trend falls faster than about 1 % a week for a while
 * (docs/adr/0008, Safeguards): one sentence, a link to the pace choice in Profile, and a way to hide
 * it for 14 days. Plain text, the same ink as everything else, never coloured, and it asks for
 * nothing. Shown on Progress, next to the daily guide in Profile and on Today.
 */
export function PaceNotice({ className }: { readonly className?: string }) {
  const s = useStrings().progress;
  const { notices, clock } = useSession();
  useSyncExternalStore(notices.subscribe, notices.snapshot);
  const visible = usePaceNoticeVisible();
  if (!visible) return null;
  return (
    <div className={cn('border-ink flex flex-col items-start gap-1 border-l-2 pl-3', className)}>
      <p className="text-body-small text-ink-soft">{s.paceNotice}</p>
      <div className="flex flex-wrap gap-x-4">
        <a
          href={hrefs.section(SECTIONS.profile)}
          className="text-ink text-body-small inline-flex min-h-12 items-center underline underline-offset-4"
        >
          {s.paceNoticeLink}
        </a>
        <button
          type="button"
          onClick={() => {
            // A write that fails leaves the line where it is; it can be tried again.
            void notices.dismissPaceNotice(clock()).catch(() => undefined);
          }}
          className="text-ink-soft text-body-small inline-flex min-h-12 cursor-pointer items-center bg-transparent underline underline-offset-4"
        >
          {s.paceNoticeDismiss}
        </button>
      </div>
    </div>
  );
}
