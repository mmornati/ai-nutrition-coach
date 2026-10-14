import { useEffect, useRef, useState } from 'react';
import { syncAnnouncement } from '../../i18n/sentences';

export interface SyncAnnouncerProps {
  /** Plates waiting to sync. */
  readonly pending: number;
  /** Plates that will retry later. */
  readonly retryLater: number;
  /** Quiet period before a change is announced; a burst of changes becomes one message. */
  readonly debounceMs?: number;
}

/**
 * The one polite live region for sync state, mounted once per page. It announces the aggregate
 * ("2 plates waiting to sync", "All plates synced"), never per plate, never on first render, and
 * waits out bursts so a flurry of changes is a single message. Without a sync transport, do not
 * mount it: there is nothing to announce.
 */
export function SyncAnnouncer({ pending, retryLater, debounceMs = 800 }: SyncAnnouncerProps) {
  const message = syncAnnouncement(pending, retryLater);
  const [announced, setAnnounced] = useState('');
  // What the page already conveyed: the state at mount, then each message that was announced.
  const settled = useRef(message);

  useEffect(() => {
    if (message === settled.current) return undefined;
    const timer = setTimeout(() => {
      settled.current = message;
      setAnnounced(message);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [message, debounceMs]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announced}
    </div>
  );
}
