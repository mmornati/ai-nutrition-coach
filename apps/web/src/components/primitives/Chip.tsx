import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * A sewn label: a 4px-cornered ink tag with a dashed stitch inset and an optional 9px dot. It
 * states a fact (where data lives); it is not a filter and not a button.
 */
export function Chip({
  children,
  dot = false,
  dotClassName = 'bg-ink',
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  readonly children: ReactNode;
  readonly dot?: boolean;
  /** Replaces the dot's fill (the default is the on-device ink dot). */
  readonly dotClassName?: string;
}) {
  return (
    <span
      {...rest}
      className={cn(
        'font-display text-label stitched relative inline-flex min-h-9 items-center gap-1.75 rounded-tag border-2 border-ink bg-raised max-w-full px-3 py-1.5 font-bold',
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn('size-2.25 rounded-full', dotClassName)} />}
      {children}
    </span>
  );
}

/** The 1.5px thread-grey tag ("v2") beside an unavailable choice. */
export function VersionTag({ children, spoken }: { children: ReactNode; spoken?: string }) {
  return (
    <span className="font-display border-thread text-thread rounded-tag ml-2 border-[1.5px] px-1.5 py-px align-[3px] text-tag font-semibold">
      <span aria-hidden={spoken ? 'true' : undefined}>{children}</span>
      {spoken && <VisuallyHidden>{spoken}</VisuallyHidden>}
    </span>
  );
}
