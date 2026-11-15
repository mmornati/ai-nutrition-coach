import { useState, useSyncExternalStore, type RefObject } from 'react';
import { useMessage, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { ReloadNotice } from '../../components/shell';
import { useSyncOffer, useSyncSignInRequired, useSyncUnreachable } from '../../sync';
import { ServerBackupSection } from './ServerBackupSection';
import { ServerConnectedSection } from './ServerConnectedSection';
import { ServerJoinSection } from './ServerJoinSection';
import { RecoveryKeyPanel } from './ServerAccountSections';
import { Button } from '../../components/primitives';

/**
 * Settings, Your data: the relay backup, only when this server offers one (`/sync/config.json`,
 * read strictly; anything else and nothing about sync is shown, exactly as before). Not connected:
 * create a copy, or connect to one that exists. Connected: the status and the two actions. One
 * status line outlives the swap between them, so the result of a connect is announced.
 */
export function ServerSection({
  backupField,
}: {
  /** The encrypted-backup field, for the "save a backup first" step. */
  readonly backupField: RefObject<HTMLInputElement | null>;
}) {
  const session = useSession();
  const offer = useSyncOffer(session.syncOffer);
  const status = useSyncExternalStore(
    session.sync.subscribe,
    session.sync.getSnapshot,
    session.sync.getSnapshot,
  );
  const signIn = useSyncSignInRequired(session.syncOffer);
  const unreachable = useSyncUnreachable(session.syncOffer);
  const all = useStrings();
  const [notice, setNotice] = useMessage();
  // Made with the copy and shown once, before anything else in this section.
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  // The server's sign-in turned the offer read away: say so instead of hiding the section.
  if (!status.connected && !offer.offered) {
    if (signIn) {
      return <ReloadNotice text={all.server.signInRequired} action={all.server.reloadAction} />;
    }
    // A server that offered a copy before and cannot be reached now: say so, do not hide it.
    return unreachable ? (
      <div className="flex flex-col gap-3" data-sync-unreachable="">
        <p role="status" className="text-body text-ink">
          {all.server.unreachable}
        </p>
        <div>
          <Button variant="secondary" onClick={() => void session.syncOffer.refresh()}>
            {all.server.unreachableCheck}
          </Button>
        </div>
      </div>
    ) : null;
  }

  if (recoveryKey !== null) {
    return <RecoveryKeyPanel recoveryKey={recoveryKey} onDone={() => setRecoveryKey(null)} />;
  }

  return (
    <>
      {status.connected ? (
        <ServerConnectedSection onDone={setNotice} />
      ) : (
        offer.offered && (
          <>
            <ServerBackupSection offer={offer} onDone={setNotice} onRecoveryKey={setRecoveryKey} />
            <ServerJoinSection
              onDone={setNotice}
              onSaveBackup={() => backupField.current?.focus()}
            />
          </>
        )
      )}
      <p role="status" className="text-body text-ink empty:hidden">
        {notice}
      </p>
    </>
  );
}
