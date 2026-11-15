import { useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/primitives';
import { fill, useLocale, useMessage, useStrings, type Message } from '../../i18n';
import { useSession } from '../../app/session';
import { signInAgain } from '../../net/sign-in';
import { statusText } from '../../sync';
import { Prose, Section } from './SettingsPage';
import {
  ServerDeleteSection,
  ServerDevicesSection,
  ServerPassphraseSection,
  ServerPreviousSection,
  ServerRecoverySection,
} from './ServerAccountSections';

/**
 * Settings, Your data: this device is connected to a copy on this server. What it says is only ever
 * what happened: backed up (after the server acknowledged it), waiting, offline, or stopped and why.
 * "Back up now" tries at once, whatever stopped the automatic backup; stopping only makes this device
 * forget the connection, and the copy on the server is not touched.
 */
export function ServerConnectedSection({
  onDone,
}: {
  readonly onDone: (message: Message) => void;
}) {
  const all = useStrings();
  const s = all.server;
  const { locale } = useLocale();
  const session = useSession();
  const status = useSyncExternalStore(
    session.sync.subscribe,
    session.sync.getSnapshot,
    session.sync.getSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useMessage();

  if (!status.connected) return null;

  const now = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await session.sync.syncNow();
      if (!session.live()) return;
      // Anything but success is already said by the status line.
      if (outcome.kind === 'backedUp') setMessage((a) => a.server.nowDone);
    } finally {
      if (session.live()) setBusy(false);
    }
  };

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const ok = await session.sync.disconnect();
      if (!session.live()) return;
      if (ok) onDone((a) => a.server.stopped);
      else setMessage((a) => a.server.stopFailed);
    } finally {
      if (session.live()) setStopping(false);
    }
  };

  const signedOut = status.phase === 'signedOut';
  return (
    <>
      <Section title={s.connectedHeading}>
        <Prose>{fill(s.connectedAs, { handle: status.handle })}</Prose>
        <p className="text-body text-ink" data-sync-phase={status.phase}>
          {statusText(status, s, locale)}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" busy={busy} busyLabel={s.nowWorking} onClick={() => void now()}>
            {s.nowAction}
          </Button>
          {signedOut ? (
            // The server no longer accepts this device's token: forgetting it brings back the connect form.
            <Button variant="primary" busy={stopping} onClick={() => void stop()}>
              {s.reconnectAction}
            </Button>
          ) : (
            <Button variant="secondary" busy={stopping} onClick={() => void stop()}>
              {s.stopAction}
            </Button>
          )}
        </div>
        {status.phase === 'signInRequired' && (
          <div>
            <Button variant="secondary" onClick={() => signInAgain()}>
              {s.reloadAction}
            </Button>
          </div>
        )}
        <Prose>{s.stopExplain}</Prose>
        <p role="status" className="text-body text-ink empty:hidden">
          {message}
        </p>
      </Section>
      {!signedOut && (
        <>
          <ServerDevicesSection />
          <ServerPassphraseSection />
          <ServerRecoverySection />
          <ServerPreviousSection />
          <ServerDeleteSection onDone={onDone} />
        </>
      )}
    </>
  );
}
