import { useSyncExternalStore } from 'react';
import type { CoachingStatus } from '../ai';
import { useSession } from '../app/session';

/** What the AI coach may do right now, read from the session's AI services; live. */
export function useSessionCoachingStatus(): CoachingStatus {
  const { ai } = useSession();
  return useSyncExternalStore(ai.coaching.subscribe, ai.coaching.getSnapshot);
}
