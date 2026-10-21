import { useSyncExternalStore } from 'react';
import { useSessionOptional } from '../../app/session';

const never = (): (() => void) => () => undefined;
const on = (): boolean => true;

/**
 * Whether nutrition numbers are drawn (Settings → Nutrition). Follows the switch live; true when
 * there is no session yet (the default is ON).
 */
export function useShowNumbers(): boolean {
  const session = useSessionOptional();
  return useSyncExternalStore(
    session === null ? never : session.numbers.subscribe,
    session === null ? on : session.numbers.current,
  );
}
