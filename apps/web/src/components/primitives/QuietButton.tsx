import type { ReactNode } from 'react';

/** A plain, underlined text button for quiet choices ("Done with this", "Drop it"). 48 px tall. */
export function QuietButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-soft inline-flex min-h-12 cursor-pointer items-center bg-transparent text-lead underline underline-offset-4"
    >
      {children}
    </button>
  );
}
