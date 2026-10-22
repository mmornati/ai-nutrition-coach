import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id'
> {
  readonly label: string;
  /** A calm inline message (never red). */
  readonly message?: string | undefined;
  /** The input element, for a caller that moves focus to it. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

/** A white field in a 2px control edge, 56px tall, 8px corners; the frame takes the ink focus ring. */
export function TextField({ label, message, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-label text-ink-soft">
        {label}
      </label>
      <div
        className={cn(
          'border-control bg-raised rounded-cloth flex min-h-14 border-2',
          'focus-within:border-ink focus-within:outline-ink focus-within:outline-3 focus-within:outline-offset-2',
        )}
      >
        <input
          id={id}
          type="text"
          aria-describedby={message ? messageId : undefined}
          className="placeholder:text-thread min-w-0 flex-1 bg-transparent px-3.5 text-lead outline-none"
          {...input}
        />
      </div>
      {message && (
        <p id={messageId} role="status" className="text-body-small text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
