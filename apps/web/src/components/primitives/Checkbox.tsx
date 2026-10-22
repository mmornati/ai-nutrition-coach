import type { InputHTMLAttributes, ReactNode } from 'react';
import { CheckIcon } from './icons';
import { cn } from './cn';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className' | 'children'
> {
  readonly children: ReactNode;
}

/** A tick box with 4px corners in a 48px row. The tick is a shape, so state never relies on colour alone. */
export function Checkbox({ children, ...input }: CheckboxProps) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" className="peer sr-only" {...input} />
      <span
        aria-hidden="true"
        className={cn(
          'border-control-raised text-cloth rounded-tag mt-0.5 grid size-6 shrink-0 place-items-center border-2',
          'peer-checked:border-ink peer-checked:bg-ink',
          'peer-focus-visible:outline-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2',
          '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <CheckIcon size={16} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
