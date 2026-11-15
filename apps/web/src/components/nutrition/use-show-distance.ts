import { useSyncExternalStore } from 'react';
import { useSessionOptional } from '../../app/session';

const never = (): (() => void) => () => undefined;
const off = (): boolean => false;

/**
 * Whether the opt-in text line with the distance to the daily guide is wanted (Settings, Nutrition;
 * off by default). Follows the switch live; false when there is no session yet. The line is also
 * never drawn while numbers are off (`NutrientBars` is not drawn at all then).
 */
export function useShowDistance(): boolean {
  const session = useSessionOptional();
  return useSyncExternalStore(
    session === null ? never : session.distance.subscribe,
    session === null ? off : session.distance.current,
  );
}
