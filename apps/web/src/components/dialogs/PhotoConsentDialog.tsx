import { useId } from 'react';
import { fill, useStrings } from '../../i18n';
import { Button } from '../primitives/Button';
import { Dialog } from './Dialog';

export interface PhotoConsentDialogProps {
  readonly open: boolean;
  /** The AI host, named verbatim (e.g. "api.example.com"). */
  readonly host: string;
  /** The question is about this one photo ("Ask before every photo upload"). */
  readonly perPhoto?: boolean;
  /** Web wording: the host also sees the page's address. Defaults to true (this is the web app). */
  readonly onWeb?: boolean;
  /** In-app privacy route. Never an external URL: that would itself be an unrequested trip. */
  readonly privacyHref?: string;
  readonly onAllow: () => void;
  /** "Not now", Esc: the photo is dropped and the no-AI core is there. */
  readonly onDecline: () => void;
}

/**
 * Consent before a photo goes to a third-party host. Nothing is pre-ticked (there is no control
 * to tick); "Not now" is the same size and weight as "Allow" and has initial focus because
 * declining costs nothing. A scrim click does NOT answer: only a button or Esc does.
 */
export function PhotoConsentDialog({
  open,
  host,
  perPhoto = false,
  onWeb = true,
  privacyHref = '#/privacy',
  onAllow,
  onDecline,
}: PhotoConsentDialogProps) {
  const s = useStrings().consent;
  const vars = { host };
  const bodyId = useId();
  return (
    <Dialog
      open={open}
      onClose={onDecline}
      title={fill(s.title, vars)}
      scrimDismiss={false}
      role="alertdialog"
      describedBy={bodyId}
    >
      <div id={bodyId} className="text-body flex flex-col gap-3">
        <p>{s.whatIsSent}</p>
        <p>{fill(onWeb ? s.alsoVisibleWeb : s.alsoVisible, vars)}</p>
        <p>{fill(s.retention, vars)}</p>
        <p>{s.notSent}</p>
        <p className="text-body-small text-porcelain-dim">
          {perPhoto ? s.askEveryHint : s.revokeHint}
        </p>
        <a
          href={privacyHref}
          className="text-porcelain inline-flex min-h-12 items-center underline underline-offset-4"
        >
          {s.learnMore}
        </a>
      </div>
      <div className="flex gap-3">
        <Button variant="outline-porcelain" className="flex-1" data-autofocus onClick={onDecline}>
          {s.decline}
        </Button>
        <Button variant="outline-porcelain" className="flex-1" onClick={onAllow}>
          {perPhoto ? s.allowOnce : fill(s.allow, vars)}
        </Button>
      </div>
    </Dialog>
  );
}
