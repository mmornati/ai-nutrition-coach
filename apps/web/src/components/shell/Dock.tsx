import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { PlusIcon } from '../primitives';

/**
 * Phone dock (< 1024px): the route slot (the week route) on the left, a square porcelain LOG
 * block on the right, padded for the home indicator. Fixed to the bottom on raised enamel.
 */
export function Dock({ route, onLog }: { readonly route: ReactNode; readonly onLog: () => void }) {
  const s = useStrings().shell;
  return (
    <section
      aria-label={s.dock}
      className="bg-enamel-raised border-rule fixed inset-x-0 bottom-0 z-20 grid grid-cols-[1fr_92px] items-stretch border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="min-w-0">{route}</div>
      <button
        type="button"
        aria-label={s.logAPlate}
        onClick={onLog}
        className="bg-porcelain text-enamel font-display text-button flex min-h-19 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-none tracking-[0.1em] uppercase"
      >
        <PlusIcon size={20} />
        {s.logShort}
      </button>
    </section>
  );
}
