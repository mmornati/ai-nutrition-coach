import type { ReactNode } from 'react';
import { Header } from '../../components/shell';
import { BackIcon } from '../../components/primitives';
import { useStrings } from '../../i18n';
import { ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { hrefs } from '../../app/router';
import { useSessionOptional } from '../../app/session';

function BackLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <a
      href={href}
      className="font-display text-ink-soft mb-2 inline-flex min-h-12 items-center gap-2 text-nav font-semibold"
    >
      <BackIcon size={18} />
      {label}
    </a>
  );
}

/**
 * The frame every settings screen shares. Unlocked it sits in the app shell (rail or dock,
 * header with the lock button); before the unlock, only the Privacy page is reachable and it
 * gets a bare header with a way back to Today (which is the unlock screen while locked).
 */
export function SettingsPage({
  title,
  sub,
  backTo = 'settings',
  children,
}: {
  readonly title: string;
  readonly sub?: ReactNode;
  /** `settings` goes up one level; `today` leaves Settings (the list itself, and a locked app). */
  readonly backTo?: 'settings' | 'today';
  readonly children: ReactNode;
}) {
  const all = useStrings();
  const session = useSessionOptional();
  const back =
    backTo === 'today' || session === null ? (
      // The board's way out is the rail on a desktop (as in the prototype): phone only.
      <span className={session === null ? undefined : 'lg:hidden'}>
        <BackLink href={hrefs.today} label={all.shell.today} />
      </span>
    ) : (
      <BackLink href={hrefs.settings} label={all.settings.backToSettings} />
    );
  const content = (
    <div className="flex max-w-3xl flex-col gap-7 px-5 pt-6 pb-8 lg:px-7">{children}</div>
  );
  if (session === null) {
    return (
      <main className="mx-auto max-w-3xl lg:pb-16">
        <Header title={title} back={back} {...(sub === undefined ? {} : { sub })} />
        {content}
      </main>
    );
  }
  return (
    <ScreenFrame
      current="settings"
      header={
        <ScreenHeader
          title={title}
          back={back}
          hideSettings
          {...(sub === undefined ? {} : { sub })}
        />
      }
    >
      {content}
    </ScreenFrame>
  );
}

/** A titled group inside a settings screen: an h2 over its content. */
export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-section text-thread">{title}</h2>
      {children}
    </section>
  );
}

/** Plain explanatory text. */
export function Prose({ children }: { readonly children: ReactNode }) {
  return <p className="text-body text-ink-soft">{children}</p>;
}
