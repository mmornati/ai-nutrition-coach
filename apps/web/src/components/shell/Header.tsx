import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { GearIcon, IconButton } from '../primitives';

export interface HeaderProps {
  /** The screen name in display type: the day, "This week", "Settings". */
  readonly title: string;
  readonly sub?: ReactNode;
  /** A back link above the title (detail screens). */
  readonly back?: ReactNode;
  /** The storage status ("On this device"), set as a quiet word beside the sub line. */
  readonly chip?: ReactNode;
  /** Icon actions at the right of the title row (e.g. the lock button). */
  readonly actions?: ReactNode;
  /** Phone only: shows the gear IconButton linking here. Hidden from 1024px, where the rail has it. */
  readonly settingsHref?: string;
}

/** Screen header: the screen name in heavy display type, the storage tag beside it. */
export function Header({ title, sub, back, chip, actions, settingsHref }: HeaderProps) {
  const s = useStrings();
  const icons = (
    <div className="flex shrink-0 items-center justify-end gap-2">
      {actions}
      {settingsHref && (
        <span className="lg:hidden">
          <IconButton label={s.shell.settings} href={settingsHref}>
            <GearIcon />
          </IconButton>
        </span>
      )}
    </div>
  );
  // The icon buttons sit on the line below the title, at the right of the date and the storage
  // word, so a long title (French at 336px) never pushes them onto a line of their own. A screen
  // with a back link puts them on that link's line instead: no line is spent on them alone.
  return (
    <header className="px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-2 lg:px-7 lg:pt-9 lg:pb-4">
      {back && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">{back}</div>
          {icons}
        </div>
      )}
      <h1 className="font-display text-display lg:text-display-desktop [overflow-wrap:anywhere]">
        {title}
      </h1>
      {/* One quiet line under the title: the date (or a screen's sub line) and where the data lives. */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="text-thread flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-lead font-medium">
          {sub}
          {chip}
        </div>
        {!back && icons}
      </div>
    </header>
  );
}
