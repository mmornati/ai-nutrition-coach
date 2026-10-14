import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { GearIcon, IconButton } from '../primitives';

export interface HeaderProps {
  /** The screen name in display type: the day, "This week", "Settings". */
  readonly title: string;
  readonly sub?: ReactNode;
  /** A back link above the title (detail screens). */
  readonly back?: ReactNode;
  /** The status chip slot (the "On this device" chip), right of the title. */
  readonly chip?: ReactNode;
  /** Extra actions beside the chip (e.g. the lock button). */
  readonly actions?: ReactNode;
  /** Phone only: shows the gear IconButton linking here. Hidden from 1024px, where the rail has it. */
  readonly settingsHref?: string;
}

/** Screen header: display-type name over a 4px porcelain rule. */
export function Header({ title, sub, back, chip, actions, settingsHref }: HeaderProps) {
  const s = useStrings();
  return (
    <header className="border-porcelain flex items-end justify-between gap-3 border-b-4 px-5 pt-[max(env(safe-area-inset-top),28px)] pb-3 lg:px-7 lg:pt-7">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-display lg:text-display-desktop uppercase">{title}</h1>
        {sub && <div className="text-signal-muted mt-1.5 text-[15px] font-medium">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        {chip}
        {actions}
        {settingsHref && (
          <span className="lg:hidden">
            <IconButton label={s.shell.settings} href={settingsHref}>
              <GearIcon />
            </IconButton>
          </span>
        )}
      </div>
    </header>
  );
}
