import { useId, type ReactNode } from 'react';
import { Button } from '../primitives/Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: ReactNode;
  /** The destructive or committing action. */
  readonly confirmLabel: string;
  /** The safe choice. Esc, the scrim and initial focus all mean this. */
  readonly dismissLabel: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly busy?: boolean;
}

/**
 * A calm confirmation. The safe choice is the dismiss action and has initial focus; the two
 * buttons are the same size and no countdown or pressure copy is ever shown.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  dismissLabel,
  onConfirm,
  onDismiss,
  busy = false,
}: ConfirmDialogProps) {
  const bodyId = useId();
  return (
    <Dialog open={open} onClose={onDismiss} title={title} role="alertdialog" describedBy={bodyId}>
      <div id={bodyId} className="text-body">
        {body}
      </div>
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" data-autofocus onClick={onDismiss}>
          {dismissLabel}
        </Button>
        <Button variant="secondary" className="flex-1" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
