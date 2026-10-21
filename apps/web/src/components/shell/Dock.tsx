import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { PlusIcon } from '../primitives';

/**
 * Phone dock (< 1024px): holds ONLY the seven-stop week route, padded for the home indicator and
 * fixed to the bottom on raised enamel. "Log a plate" is a square porcelain floating button
 * anchored bottom-right above the dock (clear of the home indicator). Its size and offset are the
 * `--spacing-fab-*` tokens; the page's bottom padding is derived from the same ones.
 */
export function Dock({ route, onLog }: { readonly route: ReactNode; readonly onLog: () => void }) {
  const s = useStrings().shell;
  return (
    <section
      aria-label={s.dock}
      data-testid="dock"
      className="bg-enamel-raised border-rule fixed inset-x-0 bottom-0 z-20 border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="min-w-0">{route}</div>
      <button
        type="button"
        aria-label={s.logAPlate}
        onClick={onLog}
        className="bg-porcelain text-enamel font-display text-button fixed right-4 bottom-[calc(var(--spacing-fab-offset)+env(safe-area-inset-bottom))] flex size-(--spacing-fab-size) cursor-pointer flex-col items-center justify-center gap-0.5 rounded-none tracking-[0.1em] uppercase shadow-[0_0_0_2px_var(--color-enamel)]"
      >
        <PlusIcon size={20} />
        {s.logShort}
      </button>
    </section>
  );
}
