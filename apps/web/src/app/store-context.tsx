import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { StoreBundle, StoreSnapshot } from '../storage';

const BundleContext = createContext<StoreBundle | null>(null);

export function StoreProvider(props: { bundle: StoreBundle; children: ReactNode }): ReactNode {
  return <BundleContext.Provider value={props.bundle}>{props.children}</BundleContext.Provider>;
}

/** The store bundle: the controller and the ports built on it. Lives as long as the page. */
export function useStoreBundle(): StoreBundle {
  const bundle = useContext(BundleContext);
  if (bundle === null) throw new Error('useStoreBundle needs a <StoreProvider>');
  return bundle;
}

/** The controller's state, re-rendering on every change. */
export function useStoreSnapshot(): StoreSnapshot {
  const { controller } = useStoreBundle();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
