import { useState } from 'react';
import { normalizeHandle, type SyncOffer } from '@anc/core';
import { Button, TextField } from '../../components/primitives';
import { useMessage, useStrings, type Message } from '../../i18n';
import { useSession } from '../../app/session';
import { validateNewPassphrase } from '../../storage';
import { createFailureText, createServerVault } from '../../sync';
import { Prose, Section } from './SettingsPage';

/**
 * Settings, Your data (Case C): the first device creates the vault on this server. Handle and
 * passphrase together (the local passphrase is suggested, a different one is allowed), an invite
 * code only when the server asks for one, one request. Everything is emptied after every attempt;
 * "handle taken" is the only failure that names its cause.
 */
export function ServerBackupSection({
  offer,
  onDone,
}: {
  readonly offer: Extract<SyncOffer, { offered: true }>;
  /** The device is connected: what to say, in the status line that outlives this section. */
  readonly onDone: (message: Message) => void;
}) {
  const all = useStrings();
  const s = all.server;
  const session = useSession();
  const [handle, setHandle] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();

  if (offer.signup === 'closed') {
    return (
      <Section title={s.backupHeading}>
        <Prose>{s.backupExplain}</Prose>
        <Prose>{s.closedHelp}</Prose>
      </Section>
    );
  }

  const submit = async () => {
    if (busy) return;
    setMessage(null);
    if (handle.trim() === '') {
      setMessage((a) => a.server.missingHandle);
      return;
    }
    if (normalizeHandle(handle) === null) {
      setMessage((a) => a.server.invalidHandle);
      return;
    }
    const issue = validateNewPassphrase(passphrase);
    if (issue !== null) {
      setMessage((a) => (issue === 'tooShort' ? a.session.tooShort : a.session.tooRepetitive));
      return;
    }
    if (passphrase !== confirm) {
      setMessage((a) => a.session.mismatch);
      return;
    }
    setBusy(true);
    let next: Message | null;
    try {
      const result = await createServerVault({
        client: session.syncClient,
        kdf: session.syncKdf,
        vault: session.vault,
        kv: session.kv,
        handle,
        passphrase,
        invite: offer.signup === 'invite' ? invite.trim() : undefined,
        maxVaultBytes: offer.maxVaultMb * 1024 * 1024,
      });
      if (!session.live()) return;
      if (result.kind === 'created') {
        if (await session.sync.connect(result.connection, result.dirty)) {
          // Something logged while the key was made is sent now rather than after the usual wait.
          if (result.dirty) void session.sync.syncNow();
          onDone((a) => a.server.backedUp);
          return;
        }
        next = (a) => a.server.unavailable;
      } else {
        const failure = result.failure;
        next = (a) => createFailureText(failure, a);
      }
    } catch {
      next = (a) => a.server.unavailable;
    } finally {
      setPassphrase('');
      setConfirm('');
      if (session.live()) setBusy(false);
    }
    if (session.live()) setMessage(next);
  };

  return (
    <Section title={s.backupHeading}>
      <Prose>{s.backupExplain}</Prose>
      <Prose>{s.backupAuto}</Prose>
      <Prose>{s.backupHandleHelp}</Prose>
      <p className="text-body">{s.backupWarning}</p>
      <Prose>{s.backupSame}</Prose>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={s.handleLabel}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <TextField
          label={s.passphraseLabel}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <TextField
          label={s.confirmLabel}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {offer.signup === 'invite' && (
          <>
            <Prose>{s.inviteHelp}</Prose>
            <TextField
              label={s.inviteLabel}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
          </>
        )}
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          busy={busy}
          busyLabel={s.backupWorking}
        >
          {s.backupAction}
        </Button>
      </form>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}
