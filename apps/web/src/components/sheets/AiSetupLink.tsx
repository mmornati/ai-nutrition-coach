import { useStrings } from '../../i18n';

/**
 * "Set up AI": a real in-app link to Settings → Your AI (the caller passes the route, so the
 * components layer does not import the router). At least 48 px tall; `onNavigate` lets a sheet
 * close itself as the person leaves it.
 */
export function AiSetupLink({
  href,
  onNavigate,
}: {
  readonly href: string;
  readonly onNavigate?: () => void;
}) {
  const s = useStrings().recognized;
  return (
    <a
      href={href}
      onClick={onNavigate}
      className="text-ink inline-flex min-h-12 items-center self-start underline underline-offset-4"
    >
      {s.setUpAi}
    </a>
  );
}
