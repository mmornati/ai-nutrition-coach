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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StoreProvider, useStoreBundle, useStoreSnapshot } from './store-context';
import { AboutGate, AboutGateBeforeStore } from './AboutGate';
import { forgetAcknowledgedBeforeStore } from './about-ack';
import { ServerHandoffContext, type ServerHandoff } from './server-handoff';
import { SessionBoundary, type SessionOptions, type SyncOptions } from './session';
import { UnlockedApp, type UnlockedAppProps } from './UnlockedApp';
import { isPrivacyRoute, replaceRoute, TODAY_HASH, useRoute } from './router';
import { CreatePassphraseScreen } from '../screens/gate/CreatePassphraseScreen';
import {
  ServerRestoringScreen,
  type FindOnServerResult,
} from '../screens/gate/RestoreFromServerScreen';
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
import { browserKdf } from '../sync/vault';
import {
  browserRelayClient,
  browserSyncOffer,
  openServerCopy,
  restoreServerCopyIntoNewStore,
  summarisePlates,
  useSyncOffer,
  type OpenedServerCopy,
  type RestoreFromServerResult,
} from '../sync';

function Blank(): ReactNode {
  return <div data-gate="blank" className="min-h-dvh" />;
}

export interface GateProps extends UnlockedAppProps {
  readonly sessionOptions?: SessionOptions;
  /** Test seam: opens a backup on the create-passphrase screen (production: Argon2id in a worker). */
  readonly backup?: BackupService;
  /** Test seam: the relay client, the Argon2id step and the offer behind "Restore from this server". */
  readonly sync?: SyncOptions;
}

/** A copy found on the server and the passphrase that will become this device's: memory only, used once. */
interface ServerJob {
  readonly copy: OpenedServerCopy;
  readonly passphrase: string;
}

const wipeJob = (job: ServerJob | null): void => {
  job?.copy.vaultKey.fill(0);
};

/**
 * The create-passphrase screen, once the About notice has been dealt with. "Restore from this server"
 * is offered only when this server's `/sync/config.json` says it has a relay (read strictly; anything
 * else and the screen is exactly what it was). The file is read only when this screen is shown, so
 * the About notice (the very first thing a visitor sees) makes no request at all.
 */
function FirstRunCreate({
  controller,
  restoreBackup,
  serverRestore,
  offer,
  notice,
}: {
  readonly controller: StoreBundle['controller'];
  readonly restoreBackup: (file: File, passphrase: string) => Promise<RestoreNewStoreResult>;
  readonly serverRestore: {
    readonly find: (handle: string, passphrase: string) => Promise<FindOnServerResult>;
    readonly restore: () => Promise<RestoreFromServerResult>;
    readonly cancel: () => void;
  };
  readonly offer: ReturnType<typeof browserSyncOffer>;
  readonly notice: string | undefined;
}): ReactNode {
  const offered = useSyncOffer(offer).offered;
  return (
    <CreatePassphraseScreen
      onCreate={(p) => controller.createStore(p)}
      onRestore={restoreBackup}
      {...(offered ? { serverRestore } : {})}
      {...(notice === undefined ? {} : { notice })}
    />
  );
}

function FirstRun(props: {
  readonly controller: StoreBundle['controller'];
  readonly restoreBackup: (file: File, passphrase: string) => Promise<RestoreNewStoreResult>;
  readonly serverRestore: {
    readonly find: (handle: string, passphrase: string) => Promise<FindOnServerResult>;
    readonly restore: () => Promise<RestoreFromServerResult>;
    readonly cancel: () => void;
  };
  readonly offer: ReturnType<typeof browserSyncOffer>;
  readonly notice: string | undefined;
}): ReactNode {
  return (
    <AboutGateBeforeStore>
      <FirstRunCreate {...props} />
    </AboutGateBeforeStore>
  );
}

function GateContent({ sessionOptions, backup, sync, ...app }: GateProps): ReactNode {
  const bundle = useStoreBundle();
  const { controller, eraser, vault: bundleVault } = bundle;
  const syncSeams = sync ?? sessionOptions?.sync ?? {};
  const syncOffer = syncSeams.offer ?? browserSyncOffer();
  // The same seams reach the session (a stable object: a new one would rebuild the session).
  const builtOptions = useMemo<SessionOptions | undefined>(
    () => (sync && !sessionOptions?.sync ? { ...sessionOptions, sync } : sessionOptions),
    [sessionOptions, sync],
  );
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

  // "Restore from this server": the copy is found and opened before any store exists (the person
  // sees what was found), then the store is created with the same passphrase and the copy applied.
  // The copy and passphrase wait here, in memory, between those two steps.
  const serverJob = useRef<ServerJob | null>(null);
  const [serverNotice, setServerNotice] = useState<string | undefined>(undefined);
  const [freshRestoring, setFreshRestoring] = useState(false);
  const findOnServer = useCallback(
    async (handle: string, passphrase: string): Promise<FindOnServerResult> => {
      wipeJob(serverJob.current);
      serverJob.current = null;
      const opened = await openServerCopy({
        client: syncSeams.client ?? browserRelayClient(),
        kdf: syncSeams.kdf ?? browserKdf(),
        handle,
        passphrase,
      });
      if (opened.kind === 'failed') {
        return {
          kind: 'failed',
          failure: opened.failure,
          ...(opened.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: opened.retryAfterSeconds }),
        };
      }
      serverJob.current = { copy: opened.copy, passphrase };
      return { kind: 'found', summary: summarisePlates(opened.copy.snapshot) };
    },
    [syncSeams.client, syncSeams.kdf],
  );
  const cancelServer = useCallback(() => {
    wipeJob(serverJob.current);
    serverJob.current = null;
  }, []);
  const runServerRestore = useCallback(
    async (job: ServerJob | null): Promise<RestoreFromServerResult> => {
      if (job === null) return { kind: 'storeProblem' };
      inFlight.current += 1;
      setRestoring(true);
      try {
        const result = await restoreServerCopyIntoNewStore({
          copy: job.copy,
          passphrase: job.passphrase,
          createStore: (p) => controller.createStore(p),
          vault: bundleVault,
          kv: bundle.kv,
          eraser,
          now: Date.now,
        });
        if (result.kind === 'storeProblemNotRemoved') {
          await controller.lock();
          setLeftover(true);
        }
        return result;
      } finally {
        inFlight.current -= 1;
        setRestoring(inFlight.current > 0);
      }
    },
    [bundle.kv, bundleVault, controller, eraser],
  );
  const restoreFromServer = useCallback(async (): Promise<RestoreFromServerResult> => {
    const result = await runServerRestore(serverJob.current);
    if (result.kind === 'restored') cancelServer();
    return result;
  }, [cancelServer, runServerRestore]);
  const serverRestore = useMemo(
    () => ({ find: findOnServer, restore: restoreFromServer, cancel: cancelServer }),
    [cancelServer, findOnServer, restoreFromServer],
  );

  // "Start fresh from the server copy" (Your data) erases this device, and the first-run state that
  // follows restores the copy the person had already opened: no second typing of the passphrase.
  // Its own job, so a copy found on the first-run screen is never restored by this path.
  const handoffJob = useRef<ServerJob | null>(null);
  const handoff = useMemo<ServerHandoff>(
    () => ({
      begin: (copy, passphrase) => {
        wipeJob(handoffJob.current);
        // Its own copy of the key: the screen that opened it goes away with the erase.
        handoffJob.current = {
          copy: { ...copy, vaultKey: new Uint8Array(copy.vaultKey) },
          passphrase,
        };
      },
      cancel: () => {
        wipeJob(handoffJob.current);
        handoffJob.current = null;
      },
    }),
    [],
  );
  const firstRunStatus = snapshot.status === 'needsPassphraseCreation';
  useEffect(() => {
    const job = handoffJob.current;
    if (!firstRunStatus || job === null) return;
    handoffJob.current = null;
    setServerNotice(undefined);
    setFreshRestoring(true);
    void runServerRestore(job)
      .then((result) => {
        if (result.kind !== 'restored' && result.kind !== 'storeProblemNotRemoved') {
          setServerNotice(strings().server.freshFailed);
        }
      })
      .catch(() => setServerNotice(strings().server.freshFailed))
      .finally(() => {
        wipeJob(job);
        setFreshRestoring(false);
      });
  }, [firstRunStatus, runServerRestore]);

  // The privacy page explains the app before anything is unlocked.
  if (!unlocked && isPrivacyRoute(route)) return <SettingsScreen section="privacy" />;

  if (freshRestoring) return <ServerRestoringScreen />;

  if (restoring) {
    return (
      <FirstRun
        controller={controller}
        restoreBackup={restoreBackup}
        serverRestore={serverRestore}
        offer={syncOffer}
        notice={serverNotice}
      />
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
        <FirstRun
          controller={controller}
          restoreBackup={restoreBackup}
          serverRestore={serverRestore}
          offer={syncOffer}
          notice={serverNotice}
        />
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
        <ServerHandoffContext.Provider value={handoff}>
          <SessionBoundary bundle={bundle} {...(builtOptions ? { options: builtOptions } : {})}>
            <AboutGate>
              <UnlockedApp {...app} />
            </AboutGate>
          </SessionBoundary>
        </ServerHandoffContext.Provider>
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
