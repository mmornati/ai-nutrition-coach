import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant =
  | 'solid-porcelain' // primary on enamel
  | 'outline-porcelain' // secondary on enamel
  | 'solid-enamel' // primary inside a porcelain card
  | 'ghost-enamel' // secondary inside a porcelain card
  | 'framed-enamel'; // enamel-filled with a porcelain frame (a control floating over the map)

const VARIANT: Record<ButtonVariant, string> = {
  'solid-porcelain': 'bg-porcelain text-enamel border-porcelain',
  'outline-porcelain': 'bg-transparent text-porcelain border-porcelain',
  'solid-enamel': 'bg-enamel text-porcelain border-enamel',
  'ghost-enamel': 'bg-transparent text-enamel border-enamel',
  'framed-enamel': 'bg-enamel text-porcelain border-porcelain',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  /** Work is in flight: the button is inert and says so to assistive tech. No spinner, ever. */
  readonly busy?: boolean;
  /** Replaces the label while `busy` (e.g. "Logging…"). */
  readonly busyLabel?: string;
  readonly icon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
}

/** Signage button: square, 2px frame, 48px minimum, condensed uppercase label. */
export function Button({
  variant = 'solid-porcelain',
  busy = false,
  busyLabel,
  icon,
  fullWidth = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'font-display text-button inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-2.5 rounded-none border-2 px-[18px] uppercase',
        'disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60',
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
