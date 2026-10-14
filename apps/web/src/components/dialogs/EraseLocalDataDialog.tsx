import { useStrings } from '../../i18n';
import { ConfirmDialog } from './ConfirmDialog';

/** Shared by Your data, the lock screen and the lost-store screen. "Keep my data" is the default. */
export function EraseLocalDataDialog({
  open,
  onKeep,
  onErase,
  busy,
}: {
  readonly open: boolean;
  readonly onKeep: () => void;
  readonly onErase: () => void;
  readonly busy?: boolean;
}) {
  const s = useStrings().erase;
  return (
    <ConfirmDialog
      open={open}
      title={s.title}
      body={<p>{s.body}</p>}
      confirmLabel={s.confirm}
      dismissLabel={s.keep}
      onConfirm={onErase}
      onDismiss={onKeep}
      {...(busy === undefined ? {} : { busy })}
    />
  );
}
