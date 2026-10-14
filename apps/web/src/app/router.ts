// A tiny hash router: no dependency, no history state. The hash is the whole route, so a reload,
// a link and the back button all behave, and nothing but a plate number rides in the address.
//
//   #/               Today
//   #/week           Week
//   #/plate/<id>     Plate detail
//   #/settings[/..]  Settings and its sub-screens (part B owns the sub-routes)
//   #/privacy        What this app stores and sends (reachable before the store is open)
import { useSyncExternalStore } from 'react';

export type Route =
  | { readonly name: 'today' }
  | { readonly name: 'week' }
  | { readonly name: 'plate'; readonly id: number }
  | {
      readonly name: 'settings';
      /** `null` is the Settings list; otherwise the sub-screen name (`ai`, `data`, `privacy`, ...). */
      readonly section: string | null;
    };

export const TODAY_HASH = '#/';

export const hrefs = {
  today: TODAY_HASH,
  week: '#/week',
  settings: '#/settings',
  privacy: '#/privacy',
  plate: (id: number): string => `#/plate/${id}`,
  section: (section: string): string => `#/settings/${section}`,
} as const;

/** Anything unknown is Today: a malformed address must never strand the person. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter((p) => p.length > 0);
  const [head, second] = parts;
  switch (head) {
    case 'week':
      return { name: 'week' };
    case 'plate': {
      const id = Number(second);
      return Number.isInteger(id) && id > 0 ? { name: 'plate', id } : { name: 'today' };
    }
    case 'settings':
      return { name: 'settings', section: second ?? null };
    case 'privacy':
      return { name: 'settings', section: 'privacy' };
    default:
      return { name: 'today' };
  }
}

/** True for the privacy page, which is public: it explains the app before anything is unlocked. */
export const isPrivacyRoute = (route: Route): boolean =>
  route.name === 'settings' && route.section === 'privacy';

function subscribe(notify: () => void): () => void {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}
const readHash = (): string => window.location.hash;

export function useHash(): string {
  return useSyncExternalStore(subscribe, readHash, () => '');
}

export function useRoute(): Route {
  const hash = useHash();
  return parseRoute(hash);
}

export function navigate(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash;
}

/**
 * Replace the current entry (no history step): used when a screen has nothing left to show and on
 * a lock, so the old `#/plate/<id>` entry is overwritten rather than left behind. `replaceState`
 * does not fire `hashchange`, so listeners are told by hand. Best effort: where the browser
 * refuses (a sandboxed frame), it falls back to `location.replace`.
 */
export function replaceRoute(hash: string): void {
  try {
    window.history.replaceState(window.history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch {
    window.location.replace(hash);
  }
}
