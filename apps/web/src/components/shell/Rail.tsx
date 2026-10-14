import type { ReactNode } from 'react';
import { useStrings } from '../../i18n';
import { Button, PlusIcon, TodayIcon, WeekIcon, GearIcon, cn } from '../primitives';
import { BrandMark } from './BrandMark';

export type ShellRoute = 'today' | 'week' | 'settings';

export const DEFAULT_ROUTE_HREFS: Readonly<Record<ShellRoute, string>> = {
  today: '#/',
  week: '#/week',
  settings: '#/settings',
};

const ITEMS: readonly { route: ShellRoute; icon: ReactNode }[] = [
  { route: 'today', icon: <TodayIcon /> },
  { route: 'week', icon: <WeekIcon /> },
  { route: 'settings', icon: <GearIcon /> },
];

export interface RailProps {
  readonly current: ShellRoute;
  readonly hrefs: Readonly<Record<ShellRoute, string>>;
  readonly onLog: () => void;
}

/** Desktop navigation (>= 1024px): brand, nav, Log button, storage status pinned to the bottom. */
export function Rail({ current, hrefs, onLog }: RailProps) {
  const s = useStrings().shell;
  return (
    <aside className="border-rule hidden w-60 shrink-0 flex-col border-r-2 px-4.5 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto">
      <div className="font-display text-title border-rule flex items-center gap-2.5 border-b-2 pb-5 tracking-[0.06em] uppercase">
        <BrandMark />
        {s.brand}
      </div>
      <nav aria-label={s.mainNav} className="mt-4.5 flex flex-col gap-0.5">
        {ITEMS.map(({ route, icon }) => (
          <a
            key={route}
            href={hrefs[route]}
            aria-current={route === current ? 'page' : undefined}
            className={cn(
              'font-display relative flex min-h-13 items-center gap-3 px-2.5 text-nav font-semibold tracking-[0.1em] uppercase',
              route === current
                ? 'text-porcelain after:bg-line-starch after:absolute after:bottom-1.5 after:left-2.5 after:h-1 after:w-16'
                : 'text-porcelain-dim',
            )}
          >
            {icon}
            {s[route]}
          </a>
        ))}
      </nav>
      <Button className="mt-5.5" fullWidth icon={<PlusIcon size={20} />} onClick={onLog}>
        {s.logAPlate}
      </Button>
      <div className="border-rule text-porcelain-dim mt-auto border-t-2 pt-4 text-meta">
        <p className="font-display text-porcelain mb-1 flex items-center gap-2 font-bold tracking-[0.1em] uppercase">
          <span aria-hidden="true" className="bg-line-veg size-2.25 rounded-full" />
          {s.storage}
        </p>
        <p>{s.storageNote}</p>
        <p className="font-display text-signal-muted mt-3.5 text-small tracking-[0.1em] uppercase">
          {s.footmark}
        </p>
      </div>
    </aside>
  );
}
