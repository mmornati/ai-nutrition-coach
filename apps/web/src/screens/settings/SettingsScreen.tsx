// PLACEHOLDER for part B: Settings (the departures board) and its sub-screens (Your AI, Your
// data, Privacy, Install, About). Part A only guarantees the route, the shell around it and the
// header; `section` is the sub-route (`null` is the list, `privacy` is also reachable while the
// store is locked, in which case `useSessionOptional()` is null and there is no shell).
import { Header } from '../../components/shell';
import { useStrings } from '../../i18n';
import { ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { hrefs } from '../../app/router';
import { useSessionOptional } from '../../app/session';

export function SettingsScreen(props: { readonly section: string | null }) {
  const s = useStrings().shell;
  const session = useSessionOptional();
  // Part B: render `props.section` (null is the Settings list).
  void props.section;
  if (session === null) {
    return (
      <main className="mx-auto max-w-3xl">
        <Header
          title={s.settings}
          back={
            <a
              href={hrefs.today}
              className="font-display text-porcelain-dim inline-flex min-h-12 items-center text-nav font-semibold tracking-[0.1em] uppercase"
            >
              {s.today}
            </a>
          }
        />
      </main>
    );
  }
  return (
    <ScreenFrame current="settings" header={<ScreenHeader title={s.settings} />}>
      <div />
    </ScreenFrame>
  );
}
