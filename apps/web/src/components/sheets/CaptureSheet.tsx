import type { ReactNode } from 'react';
import { fill, useStrings } from '../../i18n';
import { BarcodeIcon, CameraIcon, TypeIcon } from '../primitives/icons';
import { cn } from '../primitives/cn';
import { Sheet } from './Sheet';

export interface CaptureSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSnapshot: () => void;
  readonly onBarcode: () => void;
  readonly onType: () => void;
  /** Saved meals and recipes: shown as a quiet link under the tiles when given. */
  readonly onSaved?: () => void;
  /** Name of the next meal slot, shown as "Next meal: <meal>". */
  readonly nextMeal?: string;
}

function Tile({
  main = false,
  icon,
  title,
  hint,
  onClick,
  initialFocus = false,
}: {
  main?: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  initialFocus?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(initialFocus ? { 'data-autofocus': true } : {})}
      className={cn(
        'border-ink rounded-cloth flex cursor-pointer flex-col justify-between gap-2.5 border-2 p-4 text-left transition-transform duration-150 active:scale-[0.99]',
        main ? 'on-ink bg-ink text-cloth col-span-2 min-h-33' : 'text-ink min-h-24',
      )}
    >
      <span className="font-display text-title flex w-full items-center justify-between">
        {title}
        {icon}
      </span>
      <span className={cn('text-body-small', !main && 'text-ink-soft')}>{hint}</span>
    </button>
  );
}

/**
 * The three ways to log: Snapshot dominant, Barcode and Type it secondary. Choosing one closes
 * the sheet and then reports the choice. No monetisation, no pressure copy.
 */
export function CaptureSheet({
  open,
  onClose,
  onSnapshot,
  onBarcode,
  onType,
  onSaved,
  nextMeal,
}: CaptureSheetProps) {
  const all = useStrings();
  const s = all.capture;
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={s.title}
      subtitle={nextMeal ? fill(s.nextStation, { meal: nextMeal }) : undefined}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          main
          initialFocus
          icon={<CameraIcon size={30} />}
          title={s.snapshot}
          hint={s.snapshotHint}
          onClick={choose(onSnapshot)}
        />
        <Tile
          icon={<BarcodeIcon size={24} />}
          title={s.barcode}
          hint={s.barcodeHint}
          onClick={choose(onBarcode)}
        />
        <Tile
          icon={<TypeIcon size={24} />}
          title={s.type}
          hint={s.typeHint}
          onClick={choose(onType)}
        />
      </div>
      {onSaved && (
        <button
          type="button"
          onClick={choose(onSaved)}
          className="text-ink-soft inline-flex min-h-12 w-fit cursor-pointer items-center bg-transparent text-lead underline underline-offset-4"
        >
          {all.relog.savedEntry}
        </button>
      )}
    </Sheet>
  );
}
