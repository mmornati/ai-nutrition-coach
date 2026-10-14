import type { ReactNode } from 'react';
import { AppShell, Header, LockButton, type ShellRoute } from '../components/shell';
import { StatusChip, WeekRoute } from '../components/day';
import { BackIcon } from '../components/primitives';
import { useStrings } from '../i18n';
import { useDay } from './day-context';
import { useLog } from './log-context';
import { hrefs, navigate, TODAY_HASH } from './router';
import { useSession } from './session';

/** The phone dock's seven-stop week route, wired to the selected day. Tapping a stop shows that day. */
export function DayRoute() {
  const day = useDay();
  return (
    <WeekRoute
      days={day.days}
      selected={day.selected}
      onSelectDay={(date) => {
        day.select(date);
        navigate(TODAY_HASH);
      }}
    />
  );
}

/** A link above the title that goes back to Today (detail screens). */
export function BackToToday() {
  const s = useStrings().shell;
  return (
    <a
      href={hrefs.today}
      className="font-display text-porcelain-dim mb-2 inline-flex min-h-12 items-center gap-2 text-nav font-semibold tracking-[0.1em] uppercase"
    >
      <BackIcon size={18} />
      {s.today}
    </a>
  );
}

export interface ScreenHeaderProps {
  readonly title: string;
  readonly sub?: ReactNode;
  readonly back?: ReactNode;
}

/**
 * The header every screen inside the shell uses: the "On this device" chip (no sync transport in
 * v1, so it never says synced), the manual Lock, and the Settings icon on a phone.
 */
export function ScreenHeader({ title, sub, back }: ScreenHeaderProps) {
  const { controller } = useSession();
  return (
    <Header
      title={title}
      {...(sub === undefined ? {} : { sub })}
      {...(back === undefined ? {} : { back })}
      chip={<StatusChip hasTransport={false} />}
      actions={<LockButton unlocked onLock={() => void controller.lock()} />}
      settingsHref={hrefs.settings}
    />
  );
}

/** The responsive frame (rail on desktop, dock on a phone) around one screen. */
export function ScreenFrame({
  current,
  header,
  children,
}: {
  readonly current: ShellRoute;
  readonly header: ReactNode;
  readonly children: ReactNode;
}) {
  const log = useLog();
  return (
    <AppShell header={header} route={<DayRoute />} current={current} onLog={log.open}>
      {children}
    </AppShell>
  );
}
