import { useStrings } from '../../i18n';
import { Button, LockIcon } from '../primitives';

/** Manual lock. Renders nothing unless the store is unlocked. */
export function LockButton({
  unlocked,
  onLock,
}: {
  readonly unlocked: boolean;
  readonly onLock: () => void;
}) {
  const s = useStrings().lock;
  if (!unlocked) return null;
  return (
    <Button variant="outline-porcelain" icon={<LockIcon size={20} />} onClick={onLock}>
      {s.action}
    </Button>
  );
}
