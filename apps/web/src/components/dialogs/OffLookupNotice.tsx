import { useStrings } from '../../i18n';
import { Button } from '../primitives/Button';
import { Dialog } from './Dialog';

/**
 * The one-time Open Food Facts notice. Two equal choices; any other dismissal (Esc, scrim) means
 * "Don't look up online", so nothing is ever sent without a yes.
 */
export function OffLookupNotice({
  open,
  privacyHref = '#/privacy',
  onAllow,
  onOfflineOnly,
}: {
  readonly open: boolean;
  readonly privacyHref?: string;
  readonly onAllow: () => void;
  readonly onOfflineOnly: () => void;
}) {
  const s = useStrings().offNotice;
  return (
    <Dialog open={open} onClose={onOfflineOnly} title={s.title}>
      <div className="text-body flex flex-col gap-3">
        <p>{s.body}</p>
        <p>{s.alsoWeb}</p>
        <a
          href={privacyHref}
          className="text-porcelain inline-flex min-h-12 items-center underline underline-offset-4"
        >
          {s.privacyLink}
        </a>
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline-porcelain"
          className="flex-1"
          data-autofocus
          onClick={onOfflineOnly}
        >
          {s.offline}
        </Button>
        <Button variant="outline-porcelain" className="flex-1" onClick={onAllow}>
          {s.ok}
        </Button>
      </div>
    </Dialog>
  );
}
