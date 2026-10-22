import type { ReactNode } from 'react';
import { cn } from './cn';

interface Common {
  /** Required: an icon alone has no name. */
  readonly label: string;
  /** This is the current page (ink edge). */
  readonly current?: boolean;
  /** The button sits on a white label (sheet, dock): uses the raised control edge. */
  readonly raised?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export type IconButtonProps =
  | (Common & {
      readonly href?: undefined;
      readonly onClick?: () => void;
      readonly disabled?: boolean;
    })
  | (Common & {
      readonly href: string;
      readonly onClick?: undefined;
      readonly disabled?: undefined;
    });

/** 48x48 circle with a 2px control-edge border. Renders an anchor when `href` is given. */
export function IconButton(props: IconButtonProps) {
  const { label, current = false, raised = false, className, children } = props;
  const classes = cn(
    'grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-2 bg-transparent text-ink',
    current ? 'border-ink' : raised ? 'border-control-raised' : 'border-control',
    'disabled:cursor-not-allowed disabled:opacity-60',
    className,
  );
  if (props.href !== undefined) {
    return (
      <a
        href={props.href}
        aria-label={label}
        aria-current={current ? 'page' : undefined}
        className={classes}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      className={classes}
    >
      {children}
    </button>
  );
}
