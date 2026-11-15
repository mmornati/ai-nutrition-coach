import { useStrings } from '../../i18n';
import { IconButton, LockIcon } from '../primitives';

/** Manual lock, an icon button named "Lock". Renders nothing unless the store is unlocked. */
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
    <IconButton label={s.action} onClick={onLock}>
      <LockIcon size={20} />
    </IconButton>
  );
}
