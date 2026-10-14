import { useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id'
> {
  readonly label: string;
  /** A calm inline message (never red). */
  readonly message?: string | undefined;
}

/** Square 2px porcelain frame, 56px tall; the frame takes the amber focus outline. */
export function TextField({ label, message, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-label text-signal-muted uppercase">
        {label}
      </label>
      <div
        className={cn(
          'border-porcelain flex min-h-14 border-2',
          'focus-within:outline-line-starch focus-within:outline-3 focus-within:outline-offset-2',
        )}
      >
        <input
          id={id}
          type="text"
          aria-describedby={message ? messageId : undefined}
          className="placeholder:text-signal-muted min-w-0 flex-1 bg-transparent px-3.5 text-lead outline-none"
          {...input}
        />
      </div>
      {message && (
        <p id={messageId} role="status" className="text-body-small text-porcelain-dim">
          {message}
        </p>
      )}
    </div>
  );
}
