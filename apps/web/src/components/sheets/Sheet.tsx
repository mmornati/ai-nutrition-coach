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
  /** Initial focus on the title so it is read first (match sheets). */
  readonly focusTitle?: boolean;
  readonly children: ReactNode;
}

/**
 * A white sheet with a 2px ink top edge and 16px top corners: a bottom sheet on phones and a centred
 * 560px dialog from 1024px. Built on the native `<dialog>` (see Dialog).
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  focusTitle = false,
  children,
}: SheetProps) {
  const s = useStrings();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      titleClassName="text-headline"
      variant="sheet"
      focusTitle={focusTitle}
      headerAction={
        <IconButton label={s.common.close} raised onClick={onClose} className="-mt-1 -mr-1">
          <CloseIcon />
        </IconButton>
      }
    >
      {subtitle && <div className="text-body-small text-thread -mt-3">{subtitle}</div>}
      {children}
    </Dialog>
  );
}
