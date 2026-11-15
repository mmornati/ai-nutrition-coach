import { useStrings } from '../../i18n';
import { cn } from '../primitives';
import { TAB_ROUTES, type ShellRoute } from './Rail';

/**
 * Phone wayfinding (< 1024px): one text row under the header with the four places a person goes
 * between (Today, Week, Trends, Coach), the same on every screen. Settings is the gear in the
 * header and "Log" stays the thumb-side pill, so the bottom dock keeps only the week route. The
 * tabs wrap onto a second line at large text sizes instead of shrinking or truncating.
 */
export function PhoneTabs({
  current,
  hrefs,
}: {
  readonly current: ShellRoute;
  readonly hrefs: Readonly<Record<ShellRoute, string>>;
}) {
  const s = useStrings().shell;
  return (
    <nav aria-label={s.tabNav} className="border-seam mx-5 flex flex-wrap border-b-2 lg:hidden">
      {TAB_ROUTES.map((route) => (
        <a
          key={route}
          href={hrefs[route]}
          aria-current={route === current ? 'page' : undefined}
          className={cn(
            'font-display -mb-0.5 flex min-h-12 flex-auto items-center justify-center border-b-2 px-1.5 text-center text-small font-bold',
            route === current ? 'text-ink border-ink' : 'text-ink-soft border-transparent',
          )}
        >
          {s[route]}
        </a>
      ))}
    </nav>
  );
}
