import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdateBanner } from './UpdateBanner';

/** If the new worker never takes over, Reload must not stay a dead end. */
const RELOAD_REENABLE_MS = 12_000;

/**
 * Registers the service worker and, when a new version is waiting, shows the update line.
 * Updating is always the person's choice (registerType: 'prompt'); there is no auto-reload.
 * The live region is always mounted so assistive tech announces the line when it appears.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reload = () => {
    if (reloading) return;
    setReloading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReloading(false), RELOAD_REENABLE_MS);
    void updateServiceWorker(true);
  };

  return (
    <div role="status">
      {needRefresh && !dismissed && (
        <UpdateBanner onReload={reload} onLater={() => setDismissed(true)} reloading={reloading} />
      )}
    </div>
  );
}
