import { useSyncExternalStore } from 'react';
import { dailyTargetsFor, EU_REFERENCE_INTAKES, type DailyTargets } from '@anc/core';
import { useSessionOptional } from '../../app/session';

const never = (): (() => void) => () => undefined;
const eu = (): DailyTargets => dailyTargetsFor();

/**
 * The daily guide drawn against the bars: the profile's targets when one is set, otherwise the EU
 * reference intakes. Follows the profile live; the EU values when there is no session.
 */
export function useTargets(): DailyTargets {
  const session = useSessionOptional();
  return useSyncExternalStore(
    session === null ? never : session.profile.subscribe,
    session === null ? eu : session.profile.targets,
  );
}

/** Whether a profile (not the EU reference intakes) drives the targets. */
export const isPersonal = (targets: DailyTargets): boolean => targets !== EU_REFERENCE_INTAKES;
