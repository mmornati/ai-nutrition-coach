// Shows the one-time "About this app" notice before its child (privacy audit PV1).
//
// Web first run: the notice comes BEFORE the passphrase screen, when there is no encrypted store
// yet to remember the answer in (`beforeStore`); the answer is kept for the page, and once the
// store is open this gate (in front of Today) writes the acknowledgement into it silently.
//
// Fail-safe: a stored answer that cannot be read means the notice is shown (never silently
// skipped); one that cannot be written still lets the person continue for this session and the
// notice returns next time.
import { useEffect, useState, type ReactNode } from 'react';
import { AboutNotice } from '../screens/about/AboutNotice';
import { rememberAcknowledgedBeforeStore, wasAcknowledgedBeforeStore } from './about-ack';
import { useSession } from './session';

export function AboutGateBeforeStore({ children }: { children: ReactNode }): ReactNode {
  const [acknowledged, setAcknowledged] = useState(wasAcknowledgedBeforeStore);
  if (acknowledged) return children;
  return (
    <AboutNotice
      onDismiss={() => {
        rememberAcknowledgedBeforeStore();
        setAcknowledged(true);
      }}
    />
  );
}

export function AboutGate({ children }: { children: ReactNode }): ReactNode {
  const { privacy, live } = useSession();
  // `null` while the stored answer is being read.
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      let done: boolean;
      try {
        done = await privacy.aboutAcknowledged();
        if (!done && wasAcknowledgedBeforeStore()) {
          // Shown before the passphrase screen: remember it now that there is somewhere to.
          done = true;
          try {
            await privacy.acknowledgeAbout();
          } catch {
            // Kept for the page; asked again next time at worst.
          }
        }
      } catch {
        done = wasAcknowledgedBeforeStore();
      }
      if (current && live()) setAcknowledged(done);
    })();
    return () => {
      current = false;
    };
  }, [privacy, live]);

  if (acknowledged === null) return null;
  if (acknowledged) return children;
  return (
    <AboutNotice
      onDismiss={() => {
        setAcknowledged(true);
        void privacy.acknowledgeAbout().catch(() => {
          // Dismissed for this session; the notice returns next time.
        });
      }}
    />
  );
}
