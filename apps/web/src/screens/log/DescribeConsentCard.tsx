import { useEffect, useId, useRef } from 'react';
import type { CoachingDestination } from '../../ai';
import { hrefs } from '../../app/router';
import { Button } from '../../components/primitives';
import { fill, useStrings } from '../../i18n';

/**
 * The per-destination agreement to send what a person writes (a description, or a pasted recipe) to
 * their AI, asked in place. One card for both: the agreement is the same one (`ai.describeConsent`).
 * Focus lands on its first button when it opens.
 */
export function DescribeConsentCard({
  destination,
  onAllow,
  onDecline,
  onLearnMore,
}: {
  readonly destination: CoachingDestination;
  readonly onAllow: () => void;
  readonly onDecline: () => void;
  /** Called when "Learn more" is followed (the host sheet closes). */
  readonly onLearnMore: () => void;
}) {
  const all = useStrings();
  const d = all.describe;
  const ref = useRef<HTMLElement>(null);
  const headingId = useId();
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  const viaServer = destination.label !== null;
  const vars = { host: destination.host, label: destination.label ?? '' };
  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className="stitched bg-raised border-ink rounded-cloth flex flex-col gap-3 border-2 p-4"
    >
      <h3 id={headingId} className="font-display text-lead">
        {viaServer ? d.consentTitleInstance : fill(d.consentTitle, { host: destination.host })}
      </h3>
      <div className="text-body flex flex-col gap-3">
        <p>{fill(viaServer ? d.consentSentInstance : d.consentSent, vars)}</p>
        <p>{fill(viaServer ? d.consentVisibleInstance : d.consentVisible, vars)}</p>
        <p>{fill(viaServer ? d.consentRetentionInstance : d.consentRetention, vars)}</p>
        <p className="text-body-small text-ink-soft">{d.consentChange}</p>
        <a
          href={hrefs.privacy}
          onClick={onLearnMore}
          className="text-ink inline-flex min-h-12 items-center underline underline-offset-4"
        >
          {all.consent.learnMore}
        </a>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onDecline}>
          {d.consentDecline}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onAllow}>
          {viaServer ? d.consentAllowInstance : fill(d.consentAllow, { host: destination.host })}
        </Button>
      </div>
    </section>
  );
}
