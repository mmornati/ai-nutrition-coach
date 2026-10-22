import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant =
  | 'primary' // ink-filled pill: the one action that moves the task on
  | 'secondary' // ink-outlined pill on cloth or a white label
  | 'floating'; // white pill with an ink edge, for a control that floats over content

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'on-ink bg-ink text-cloth border-ink',
  secondary: 'bg-transparent text-ink border-ink',
  floating: 'bg-raised text-ink border-ink',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  /** Work is in flight: the button ignores clicks, keeps focus and says so to assistive tech. No spinner, ever. */
  readonly busy?: boolean;
  /** Replaces the label while `busy` (e.g. "Logging…"). */
  readonly busyLabel?: string;
  readonly icon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
}

/** A pill: 2px ink edge, 48px minimum, bold sentence-case label. */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  icon,
  fullWidth = false,
  disabled,
  className,
  type = 'button',
  children,
  onClick,
  'aria-disabled': ariaDisabled,
  ...rest
}: ButtonProps) {
  // Busy (and "inert while another action runs") keeps the button focusable: aria-disabled and
  // swallowed clicks, never `disabled`, so focus is not thrown away when work starts.
  const inert = busy || ariaDisabled === true || ariaDisabled === 'true';
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (inert) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(
        'font-display text-button inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-2.5 rounded-full border-2 px-5 py-1.5 text-center transition-[background-color,transform] duration-150 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60 disabled:active:scale-100',
        'aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:opacity-60',
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
