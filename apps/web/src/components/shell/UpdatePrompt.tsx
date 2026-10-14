import { useEffect, useRef, useState } from 'react';
import { useAppUpdate } from '../../pwa/useAppUpdate';
import { UpdateBanner } from './UpdateBanner';

/** If the new worker never takes over, Reload must not stay a dead end. */
const RELOAD_REENABLE_MS = 12_000;

/**
 * When a new version is waiting (src/pwa/app-update.ts), shows the update line.
 * Updating is always the person's choice; there is no auto-reload.
 * The live region is always mounted so assistive tech announces the line when it appears.
 */
export function UpdatePrompt() {
  const { updateReady, applyUpdate } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reload = () => {
    if (reloading) return;
    setReloading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReloading(false), RELOAD_REENABLE_MS);
    void applyUpdate();
  };

  return (
    <div role="status">
      {updateReady && !dismissed && (
        <UpdateBanner onReload={reload} onLater={() => setDismissed(true)} reloading={reloading} />
      )}
    </div>
  );
}
