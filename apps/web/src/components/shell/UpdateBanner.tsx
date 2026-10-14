import { useStrings } from '../../i18n';
import { Button } from '../primitives';

/**
 * One dismissible line: what is ready, what reloading does to the session, Reload / Later.
 * No badge, no count, no repeat. Presentational: `UpdatePrompt` wires it to the service worker.
 */
export function UpdateBanner({
  onReload,
  onLater,
  reloading = false,
}: {
  readonly onReload: () => void;
  readonly onLater: () => void;
  /** Reload was pressed and the page has not gone yet: the button is inert. */
  readonly reloading?: boolean;
}) {
  const s = useStrings().update;
  return (
    <div className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 px-5 py-2 lg:px-7">
      <p className="text-body-small min-w-[16rem] flex-1">{s.message}</p>
      <div className="flex gap-2">
        <Button busy={reloading} onClick={onReload}>
          {s.reload}
        </Button>
        <Button variant="outline-porcelain" onClick={onLater}>
          {s.later}
        </Button>
      </div>
    </div>
  );
}
