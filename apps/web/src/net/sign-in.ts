/**
 * "Sign in again" for an instance behind a single-sign-on proxy. A plain reload is not enough:
 * the service worker answers every navigation from the cached shell, so the proxy never sees it.
 * The worker lets a navigation carrying this search parameter go to the network (and only that),
 * where the proxy can ask for a fresh session. Keep the name in step with tools/pwa/sw.template.js.
 */
export const SIGN_IN_PARAM = 'signin';

interface PageLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  assign(url: string): void;
}

/**
 * This page's path, always same-origin: a path that starts with two slashes (or a backslash) would
 * read as another host once it is handed back to `assign` or `replaceState`, so those collapse to one.
 */
function ownPath(pathname: string): string {
  return `/${pathname.replace(/^[/\\]+/, '')}`;
}

/** The address to open: this page, plus the parameter; the hash route is kept. */
export function signInUrl(loc: Pick<PageLocation, 'pathname' | 'search' | 'hash'>): string {
  const params = new URLSearchParams(loc.search);
  params.set(SIGN_IN_PARAM, '1');
  return `${ownPath(loc.pathname)}?${params.toString()}${loc.hash}`;
}

/** Navigates to the sign-in address (a real navigation, which the proxy sees). */
export function signInAgain(loc: PageLocation = globalThis.location): void {
  loc.assign(signInUrl(loc));
}

/** After boot: drop the parameter so it does not linger in the address bar or a bookmark. */
export function stripSignInParam(
  loc: Pick<PageLocation, 'pathname' | 'search' | 'hash'> = globalThis.location,
  history: Pick<History, 'replaceState' | 'state'> = globalThis.history,
): void {
  const params = new URLSearchParams(loc.search);
  if (!params.has(SIGN_IN_PARAM)) return;
  params.delete(SIGN_IN_PARAM);
  const rest = params.toString();
  history.replaceState(
    history.state,
    '',
    `${ownPath(loc.pathname)}${rest ? `?${rest}` : ''}${loc.hash}`,
  );
}
