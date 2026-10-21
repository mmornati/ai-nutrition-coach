import { useLocale, useStrings } from '../../i18n';
import { cn } from '../primitives/cn';
import { SUPPORT_URL } from './support';

/**
 * The always-available, calm support line (eating-disorder safety): one sentence and one link to a
 * well-known organisation for the current language. The link opens in a new tab and says so for
 * screen readers; the target is at least 48px tall.
 */
export function SupportLine({ className }: { readonly className?: string }) {
  const s = useStrings().support;
  const { locale } = useLocale();
  return (
    <p className={cn('text-body-small text-porcelain-dim', className)}>
      {s.line}{' '}
      <a
        href={SUPPORT_URL[locale]}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center underline underline-offset-4"
      >
        {s.linkLabel}
        <span className="sr-only"> {s.newTab}</span>
      </a>
    </p>
  );
}
