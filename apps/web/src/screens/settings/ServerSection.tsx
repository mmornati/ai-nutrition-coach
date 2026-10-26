import { useSyncExternalStore, type RefObject } from 'react';
import { useMessage } from '../../i18n';
import { useSession } from '../../app/session';
import { useSyncOffer } from '../../sync';
import { ServerBackupSection } from './ServerBackupSection';
import { ServerConnectedSection } from './ServerConnectedSection';
import { ServerJoinSection } from './ServerJoinSection';

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
  const [notice, setNotice] = useMessage();

  if (!status.connected && !offer.offered) return null;

  return (
    <>
      {status.connected ? (
        <ServerConnectedSection onDone={setNotice} />
      ) : (
        offer.offered && (
          <>
            <ServerBackupSection offer={offer} onDone={setNotice} />
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
