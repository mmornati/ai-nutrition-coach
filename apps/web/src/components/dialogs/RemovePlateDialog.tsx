import { fill, useStrings } from '../../i18n';
import { ConfirmDialog } from './ConfirmDialog';

/** Calm confirm before a plate is removed. "Keep it" is the safe, default choice. */
export function RemovePlateDialog({
  open,
  dish,
  onKeep,
  onRemove,
  busy,
}: {
  readonly open: boolean;
  /** The plate's food summary, e.g. "Rice, salmon". */
  readonly dish: string;
  readonly onKeep: () => void;
  readonly onRemove: () => void;
  readonly busy?: boolean;
}) {
  const s = useStrings().removePlate;
  return (
    <ConfirmDialog
      open={open}
      title={s.title}
      body={<p>{fill(s.body, { dish })}</p>}
      confirmLabel={s.confirm}
      dismissLabel={s.keep}
      onConfirm={onRemove}
      onDismiss={onKeep}
      {...(busy === undefined ? {} : { busy })}
    />
  );
}
