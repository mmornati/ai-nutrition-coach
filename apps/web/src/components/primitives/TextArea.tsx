import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'id'
> {
  readonly label: string;
  /** A calm inline message (never red). */
  readonly message?: string | undefined;
}

/** The multi-line sibling of `TextField`: same square frame and label, a few lines tall. */
export function TextArea({ label, message, rows = 4, ...input }: TextAreaProps) {
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
        <textarea
          id={id}
          rows={rows}
          aria-describedby={message ? messageId : undefined}
          className="placeholder:text-thread min-w-0 flex-1 resize-none bg-transparent px-3.5 py-3 text-lead outline-none"
          {...input}
        />
      </div>
      {message && (
        <p id={messageId} className="text-body-small text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
