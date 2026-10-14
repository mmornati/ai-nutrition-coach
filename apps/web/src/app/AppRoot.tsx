// The composition root. It owns the one store bundle (the controller, its tab lock, the worker),
// starts it, and hands it to the Gate. The unlocked session (decrypted state, AI services, sync
// queue, caches) is built and torn down by the Gate/SessionBoundary, never here.
import { useEffect, useState, type ReactNode } from 'react';
import type { StoreBundle } from '../storage';
import { createAppStore } from '../storage/create-app-store';
import { Gate, type GateProps } from './Gate';
import { UpdatePrompt } from '../components/shell';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { resolveLocale } from '../i18n/locale';

export interface AppRootProps extends GateProps {
  /** Injectable for tests; production uses the encrypted store. */
  readonly createBundle?: () => Promise<StoreBundle>;
}

export function AppRoot({ createBundle = createAppStore, ...gate }: AppRootProps): ReactNode {
  const [bundle, setBundle] = useState<StoreBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: StoreBundle | null = null;
    void createBundle().then((b) => {
      if (cancelled) {
        b.dispose();
        return;
      }
      created = b;
      setBundle(b);
      void b.controller.initialize();
    });
    return () => {
      cancelled = true;
      created?.dispose();
      setBundle(null);
    };
  }, [createBundle]);

  // Phase B feeds the stored preference and localStorage hint in here, and re-resolves after unlock.
  const [initialLocale] = useState(() =>
    resolveLocale(null, null, navigator.languages, navigator.language),
  );

  return (
    <LocaleProvider initial={initialLocale}>
      <div className="flex min-h-dvh flex-col">
        {/* After the screen in the DOM (it reads after the page), pinned above it with CSS order. */}
        <div className="min-w-0 flex-1">{bundle && <Gate bundle={bundle} {...gate} />}</div>
        <div className="order-first">
          <UpdatePrompt />
        </div>
      </div>
    </LocaleProvider>
  );
}
