import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { Dialog } from '../dialogs/Dialog';
import { CloseIcon, IconButton } from '../primitives';

export interface SheetProps {
  readonly open: boolean;
  /** Esc, the scrim and the close button all call this. */
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Raised-enamel sheet with a 4px porcelain top rule: a bottom sheet on phones and a centred
 * 560px dialog from 1024px. Built on the native `<dialog>` (see Dialog).
 */
export function Sheet({ open, onClose, title, subtitle, children }: SheetProps) {
  const s = useStrings();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      titleClassName="text-headline"
      variant="sheet"
      headerAction={
        <IconButton label={s.common.close} raised onClick={onClose} className="-mt-1 -mr-1">
          <CloseIcon />
        </IconButton>
      }
    >
      {subtitle && <div className="text-body-small text-signal-muted -mt-3">{subtitle}</div>}
      {children}
    </Dialog>
  );
}
