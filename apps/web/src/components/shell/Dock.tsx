import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { PlusIcon } from '../primitives';

/**
 * Phone dock (< 1024px): holds ONLY the week of folded towels, padded for the home indicator and
 * fixed to the bottom on a white plane under a 2px ink edge. "Log a plate" is an ink pill floating
 * bottom-right above the dock (clear of the home indicator). Its size and offset are the
 * `--spacing-fab-*` tokens; the page's bottom padding is derived from the same ones.
 */
export function Dock({ route, onLog }: { readonly route: ReactNode; readonly onLog: () => void }) {
  const s = useStrings().shell;
  return (
    <section
      aria-label={s.dock}
      data-testid="dock"
      className="bg-raised border-ink fixed inset-x-0 bottom-0 z-20 border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="min-w-0">{route}</div>
      <button
        type="button"
        aria-label={s.logAPlate}
        onClick={onLog}
        className="on-ink bg-ink text-cloth font-display text-button fixed right-4 bottom-[calc(var(--spacing-fab-offset)+env(safe-area-inset-bottom))] flex h-(--spacing-fab-size) min-w-(--spacing-fab-size) cursor-pointer items-center justify-center gap-2 rounded-full pr-5.5 pl-4.5 shadow-[0_10px_22px_-10px_rgb(38_36_33/0.7)] transition-transform duration-150 active:scale-[0.97]"
      >
        <PlusIcon size={22} />
        {s.logShort}
      </button>
    </section>
  );
}
