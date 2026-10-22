import { useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface FileFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id' | 'type'
> {
  readonly label: string;
}

/**
 * A file picker in the same frame as a text field: the label above, the browser's own chooser
 * inside (it names the chosen file and is operable by keyboard and screen reader as it comes).
 * No `accept` filter by default: a file type the system does not know can be greyed out by a
 * picker (iOS), and the app checks what it is given anyway.
 */
export function FileField({ label, ...input }: FileFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-label text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type="file"
        className={cn(
          'border-control bg-raised rounded-cloth min-h-14 w-full min-w-0 border-2 px-3.5 py-3.5 text-body',
          'focus-visible:outline-ink focus-visible:outline-3 focus-visible:outline-offset-2',
          'file:font-display file:text-label file:text-ink file:mr-3 file:cursor-pointer file:border-0 file:bg-transparent file:p-0 file:font-semibold file:underline',
        )}
        {...input}
      />
    </div>
  );
}
