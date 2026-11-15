import type { ReactNode } from 'react';
import { cn } from '../primitives/cn';

/**
 * The action row of a sheet: it sticks to the bottom edge of the sheet while the content above
 * scrolls, so the primary action is never below the fold (a phone with a long form, a large text
 * size). It spans the sheet's side padding, sticks past the sheet's own padding (a sticky box is held inside its scroller's padding), brings its own bottom padding with the home-indicator
 * clearance, and sits on the white of the sheet so nothing shows through. Put it last, inside the
 * sheet.
 */
export function SheetFooter({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-raised border-seam sticky -bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-10 -mx-5 flex flex-col gap-2 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:-bottom-7 lg:-mx-7 lg:px-7 lg:pb-7',
        className,
      )}
    >
      {children}
    </div>
  );
}
