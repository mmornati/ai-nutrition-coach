// Wires the controller's auto-lock to the page: pointer and key activity reset the idle timer, and
// `visibilitychange` starts/stops the hidden timer. (The delays and the locking itself live in the
// controller, so they are unit-tested with fake timers.)

import type { StoreController } from './store-controller';

export interface AutoLockTarget {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/** Returns a function that detaches every listener. */
export function attachAutoLock(
  controller: Pick<StoreController, 'touch' | 'onHidden' | 'onVisible'>,
  target: AutoLockTarget = { window, document },
): () => void {
  const onActivity = () => controller.touch();
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') controller.onHidden();
    else controller.onVisible();
  };
  for (const name of ACTIVITY_EVENTS) {
    target.window.addEventListener(name, onActivity, { passive: true });
  }
  target.document.addEventListener('visibilitychange', onVisibility);
  return () => {
    for (const name of ACTIVITY_EVENTS) target.window.removeEventListener(name, onActivity);
    target.document.removeEventListener('visibilitychange', onVisibility);
  };
}
