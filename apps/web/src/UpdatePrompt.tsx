import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and, when a new version is waiting, shows a quiet porcelain bar.
 * Updating is always the person's choice (registerType: 'prompt'); there is no auto-reload.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="bg-porcelain text-enamel fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <p className="font-display text-section uppercase">New version ready</p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="bg-enamel text-porcelain font-display text-button h-12 min-w-12 cursor-pointer px-[18px] uppercase"
      >
        Reload
      </button>
    </div>
  );
}
