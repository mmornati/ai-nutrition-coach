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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { setCurrentLocale, strings } from '../i18n';
import { browserLocaleHint } from '../i18n/locale-hint';
import { resolveLocale } from '../i18n/locale';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import type { StoreBundle } from '../storage';
import {
  browserBackupService,
  restoreIntoNewStore,
  type BackupService,
  type RestoreNewStoreResult,
} from '../sync/vault';

function Blank(): ReactNode {
  return <div data-gate="blank" className="min-h-dvh" />;
}

export interface GateProps extends UnlockedAppProps {
  readonly sessionOptions?: SessionOptions;
  /** Test seam: opens a backup on the create-passphrase screen (production: Argon2id in a worker). */
  readonly backup?: BackupService;
}

function GateContent({ sessionOptions, backup, ...app }: GateProps): ReactNode {
  const bundle = useStoreBundle();
  const { controller, eraser, vault: bundleVault } = bundle;
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

  // "Restore from a backup" on the create screen: the file is opened and validated before the store
  // is created, then the store is created with the backup's passphrase and the data is written into
  // it. While that runs the create screen stays up (the store becoming unlocked would otherwise
  // replace it before it could say what happened if the write fails); the app appears when it ends.
  // A count, not a flag: whichever restore finishes first must not let go of the screen while
  // another is still running.
  const inFlight = useRef(0);
  const [restoring, setRestoring] = useState(false);
  // An empty store the failed restore could not remove: the unlock screen says so.
  const [leftover, setLeftover] = useState(false);
  const restoreBackup = useCallback(
    async (file: File, passphrase: string): Promise<RestoreNewStoreResult> => {
      inFlight.current += 1;
      setRestoring(true);
      try {
        const result = await restoreIntoNewStore({
          service: backup ?? browserBackupService(),
          file,
          passphrase,
          createStore: (p) => controller.createStore(p),
          vault: bundleVault,
          eraser,
          now: Date.now,
        });
        if (result.kind === 'storeProblemNotRemoved') {
          // Do not drop the person into an empty app: lock it, and say why on the unlock screen.
          await controller.lock();
          setLeftover(true);
        }
        return result;
      } finally {
        inFlight.current -= 1;
        setRestoring(inFlight.current > 0);
      }
    },
    [backup, controller, bundleVault, eraser],
  );

  // The privacy page explains the app before anything is unlocked.
  if (!unlocked && isPrivacyRoute(route)) return <SettingsScreen section="privacy" />;

  if (restoring) {
    return (
      <AboutGateBeforeStore>
        <CreatePassphraseScreen
          onCreate={(p) => controller.createStore(p)}
          onRestore={restoreBackup}
        />
      </AboutGateBeforeStore>
    );
  }

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
          <CreatePassphraseScreen
            onCreate={(p) => controller.createStore(p)}
            onRestore={restoreBackup}
          />
        </AboutGateBeforeStore>
      );
    case 'locked':
      return (
        <UnlockScreen
          onUnlock={async (p) => {
            const outcome = await controller.unlock(p);
            if (outcome.kind === 'unlocked') setLeftover(false);
            return outcome;
          }}
          onErase={async () => {
            setLeftover(false);
            return erase();
          }}
          {...(leftover ? { notice: strings().restore.storeProblemNotRemoved } : {})}
        />
      );
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
