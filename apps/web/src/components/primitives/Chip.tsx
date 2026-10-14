import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * A square 2px porcelain outline with an optional 9px dot. It states a fact (where data lives);
 * it is not a filter and not a button.
 */
export function Chip({
  children,
  dot = false,
  dotClassName = 'bg-line-veg',
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  readonly children: ReactNode;
  readonly dot?: boolean;
  /** Replaces the dot's fill (the default is the on-device green). */
  readonly dotClassName?: string;
}) {
  return (
    <span
      {...rest}
      className={cn(
        'font-display text-label inline-flex min-h-9 items-center gap-1.75 border-2 border-porcelain px-2.5 py-1.5 font-bold whitespace-nowrap uppercase',
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn('size-2.25 rounded-full', dotClassName)} />}
      {children}
    </span>
  );
}

/** The 1.5px muted outline tag ("v2") beside an unavailable choice. */
export function VersionTag({ children, spoken }: { children: ReactNode; spoken?: string }) {
  return (
    <span className="font-display border-signal-muted text-signal-muted ml-2 border-[1.5px] px-1.5 py-px align-[3px] text-tag font-semibold tracking-[0.1em] uppercase">
      <span aria-hidden={spoken ? 'true' : undefined}>{children}</span>
      {spoken && <VisuallyHidden>{spoken}</VisuallyHidden>}
    </span>
  );
}
