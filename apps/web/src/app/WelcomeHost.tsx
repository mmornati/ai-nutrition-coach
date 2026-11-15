// Shows the first-run welcome in front of the routed screens, once, after the store was created
// here for the first time (not on a restore, a join or a later unlock), and never again once it was
// finished or set aside: that answer is a synced key, so a second device of the same person does not
// replay it. A welcome that was started and not finished resumes at its step (kept on this device).
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { WELCOME_STEPS, WelcomeScreen } from '../screens/welcome/WelcomeScreen';
import { clearFreshStore, isFreshStore } from './fresh-store';
import { useLog } from './log-context';
import { navigate, TODAY_HASH } from './router';
import { useSession } from './session';

export function WelcomeHost({ children }: { readonly children: ReactNode }): ReactNode {
  const { notices } = useSession();
  const log = useLog();
  const state = useSyncExternalStore(notices.subscribe, notices.snapshot);
  // Closed for this session whatever the write says: a failed write must not trap the person here.
  const [closed, setClosed] = useState(false);
  const running =
    !closed && state.welcome === null && (isFreshStore() || state.welcomeStep !== null);

  useEffect(() => {
    // Remember that the welcome began, so a reload or a lock resumes it.
    if (running && state.welcomeStep === null)
      void notices.setWelcomeStep(1).catch(() => undefined);
  }, [running, state.welcomeStep, notices]);

  if (!running) return children;

  const end = (answer: 'done' | 'skipped', logFirst: boolean, toToday = true): void => {
    clearFreshStore();
    setClosed(true);
    if (toToday) navigate(TODAY_HASH);
    void notices
      .finishWelcome(answer)
      .catch(() => undefined)
      .finally(() => {
        if (logFirst) log.open();
      });
  };
  return (
    <WelcomeScreen
      step={Math.min(state.welcomeStep ?? 1, WELCOME_STEPS)}
      onStep={(n) => void notices.setWelcomeStep(n).catch(() => undefined)}
      onSkip={(leaving) => end('skipped', false, leaving === undefined)}
      onFinish={(logFirst) => end('done', logFirst)}
    />
  );
}
