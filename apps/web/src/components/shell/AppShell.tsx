import type { ReactNode } from 'react';
import { DEFAULT_ROUTE_HREFS, Rail, type ShellRoute } from './Rail';
import { Dock } from './Dock';
import { SyncAnnouncer, type SyncAnnouncerProps } from './SyncAnnouncer';

export interface AppShellProps {
  /** A `<Header>`; sits above the main content. */
  readonly header?: ReactNode;
  /** The week route for the phone dock (provided by the day components). */
  readonly route?: ReactNode;
  readonly current?: ShellRoute;
  readonly hrefs?: Readonly<Record<ShellRoute, string>>;
  /** "Log a plate": opens the capture sheet. */
  readonly onLog: () => void;
  /**
   * The update line. Rendered AFTER `<main>` in the DOM so it reads after the page content for
   * screen readers, and pinned to the top visually with CSS `order`.
   */
  readonly banner?: ReactNode;
  /** Aggregate sync counts for the page-level announcer; omit when there is no sync transport. */
  readonly sync?: Pick<SyncAnnouncerProps, 'pending' | 'retryLater'>;
  readonly children: ReactNode;
}

/**
 * Responsive frame. Phone: header, main, fixed bottom dock. From 1024px: a 240px left rail
 * (brand, nav, Log a plate, storage status) and no dock.
 */
export function AppShell({
  header,
  route,
  current = 'today',
  hrefs = DEFAULT_ROUTE_HREFS,
  onLog,
  banner,
  sync,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh lg:flex">
      <Rail current={current} hrefs={hrefs} onLog={onLog} />
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="flex-1 pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-16">
          {children}
        </main>
        {banner && <div className="order-first">{banner}</div>}
      </div>
      <Dock route={route} onLog={onLog} />
      {sync && <SyncAnnouncer pending={sync.pending} retryLater={sync.retryLater} />}
    </div>
  );
}
