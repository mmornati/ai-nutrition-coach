// The startup gate: what the app shows first, from the store's state.
//
//   (About this app, once, BEFORE the passphrase screen on a first run)
//   needsPassphraseCreation -> Create passphrase           (first run)
//   locked                  -> Unlock                      (returning)
//   needsReset              -> Lost store (confirmed erase)
//   unavailable             -> Store unavailable (try again; never erase, never "wrong passphrase")
//   checking / erasing      -> blank
//   unlocked                -> the session scope -> (About, if not yet acknowledged) -> Today
//
// The unlocked branch is the ONLY place decrypted state exists; leaving it (lock, idle, hidden,
// erase) unmounts it. See session.tsx.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { StoreProvider, useStoreBundle, useStoreSnapshot } from './store-context';
import { AboutGate, AboutGateBeforeStore } from './AboutGate';
import { forgetAcknowledgedBeforeStore } from './about-ack';
import { SessionBoundary, type SessionOptions } from './session';
import { UnlockedApp, type UnlockedAppProps } from './UnlockedApp';
import { isPrivacyRoute, replaceRoute, TODAY_HASH, useRoute } from './router';
import { CreatePassphraseScreen } from '../screens/gate/CreatePassphraseScreen';
import { LostStoreScreen } from '../screens/gate/LostStoreScreen';
import { StoreUnavailableScreen } from '../screens/gate/StoreUnavailableScreen';
import { UnlockScreen } from '../screens/gate/UnlockScreen';
import { setCurrentLocale } from '../i18n';
import { browserLocaleHint } from '../i18n/locale-hint';
import { resolveLocale } from '../i18n/locale';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import type { StoreBundle } from '../storage';

function Blank(): ReactNode {
  return <div data-gate="blank" className="min-h-dvh" />;
}

export interface GateProps extends UnlockedAppProps {
  readonly sessionOptions?: SessionOptions;
}

function GateContent({ sessionOptions, ...app }: GateProps): ReactNode {
  const bundle = useStoreBundle();
  const { controller, eraser } = bundle;
  const snapshot = useStoreSnapshot();
  const route = useRoute();
  const wasUnlocked = useRef(false);

  // Leaving the unlocked state: the address goes back to Today (a plate number or a settings
  // screen must not outlive the session it belonged to).
  const unlocked = snapshot.status === 'unlocked';
  useEffect(() => {
    if (wasUnlocked.current && !unlocked) replaceRoute(TODAY_HASH);
    wasUnlocked.current = unlocked;
  }, [unlocked]);

  const erase = () => {
    // The device is going back to a first run, where the notice is shown again. Forgotten BEFORE
    // the erase: its last step publishes the first-run state, which renders the notice from this
    // flag before any code after the `await` could run. If the erase fails, nothing is lost: the
    // answer is also in the store, which the next unlock reads.
    forgetAcknowledgedBeforeStore();
    return eraser.eraseAll();
  };

  // A first run (nothing stored, or back there after an erase from the gate or from Your data):
  // there is no choice to honour, so the screens follow the browser, and a stale hint (left by a
  // browser that evicted the store, or an erase that could not remove it) is cleared, not shown.
  // A layout effect, so the first-run screen never paints in the stale language.
  const firstRun = snapshot.status === 'needsPassphraseCreation';
  useLayoutEffect(() => {
    if (firstRun) {
      browserLocaleHint().write(null);
      setCurrentLocale(resolveLocale(null, null, navigator.languages, navigator.language));
    }
  }, [firstRun]);

  // The privacy page explains the app before anything is unlocked.
  if (!unlocked && isPrivacyRoute(route)) return <SettingsScreen section="privacy" />;

  switch (snapshot.status) {
    case 'checking':
    case 'erasing':
      return <Blank />;
    case 'unavailable':
      return (
        <StoreUnavailableScreen
          reason={snapshot.unavailableReason}
          onRetry={() => controller.retry()}
        />
      );
    case 'needsPassphraseCreation':
      return (
        <AboutGateBeforeStore>
          <CreatePassphraseScreen onCreate={(p) => controller.createStore(p)} />
        </AboutGateBeforeStore>
      );
    case 'locked':
      return <UnlockScreen onUnlock={(p) => controller.unlock(p)} onErase={erase} />;
    case 'needsReset':
      return <LostStoreScreen onErase={erase} />;
    case 'unlocked':
      return (
        <SessionBoundary bundle={bundle} {...(sessionOptions ? { options: sessionOptions } : {})}>
          <AboutGate>
            <UnlockedApp {...app} />
          </AboutGate>
        </SessionBoundary>
      );
  }
}

export function Gate({
  bundle,
  ...props
}: GateProps & { readonly bundle: StoreBundle }): ReactNode {
  return (
    <StoreProvider bundle={bundle}>
      <GateContent {...props} />
    </StoreProvider>
  );
}
