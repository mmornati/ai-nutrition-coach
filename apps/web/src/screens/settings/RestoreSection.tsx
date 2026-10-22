import { useState } from 'react';
import type { VaultStore } from '@anc/core';
import { Button, FileField, TextField } from '../../components/primitives';
import { useMessage, useStrings, type Message } from '../../i18n';
import {
  openFailureText,
  restoreIntoStore,
  type BackupService,
  type RestoreIntoStoreResult,
} from '../../sync/vault';
import { Prose, Section } from './SettingsPage';

function resultText(result: RestoreIntoStoreResult): Message {
  switch (result.kind) {
    case 'restored':
      return (a) => a.restore.restored;
    case 'failed':
      return (a) => openFailureText(result.failure, a.restore);
    case 'notApplied':
      return (a) =>
        result.reason === 'clockAhead' ? a.restore.clockAhead : a.restore.storeProblem;
  }
}

/**
 * Settings, Your data: restore from a backup into the store that is open. The file is opened and
 * validated completely before anything is written; a failure at any step changes nothing and says
 * so. A restore is a merge, and the screen says that. The passphrase field is emptied after every
 * attempt; the chosen file stays so a mistyped passphrase can be retried.
 */
export function RestoreSection({
  service,
  vault,
  live,
}: {
  readonly service: BackupService;
  readonly vault: VaultStore;
  /** False once the session was disposed: a late result must not touch the screen. */
  readonly live: () => boolean;
}) {
  const s = useStrings().restore;
  const [file, setFile] = useState<File | null>(null);
  // Remounts the picker after a restore, which is how a file input is emptied.
  const [pickerKey, setPickerKey] = useState(0);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();

  const submit = async () => {
    if (busy) return;
    if (file === null) {
      setMessage((a) => a.restore.noFile);
      return;
    }
    if (passphrase === '') {
      setMessage((a) => a.restore.noPassphrase);
      return;
    }
    setBusy(true);
    setMessage(null);
    let next: Message;
    try {
      const result = await restoreIntoStore({ service, vault, file, passphrase });
      next = resultText(result);
      if (result.kind === 'restored') {
        setFile(null);
        setPickerKey((k) => k + 1);
      }
    } catch {
      next = (a) => a.restore.unavailable;
    } finally {
      setPassphrase('');
    }
    if (!live()) return;
    setBusy(false);
    setMessage(next);
  };

  return (
    <Section title={s.heading}>
      <Prose>{s.explain}</Prose>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FileField
          key={pickerKey}
          label={s.fileLabel}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <TextField
          label={s.passphraseLabel}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          busy={busy}
          busyLabel={s.working}
        >
          {s.action}
        </Button>
      </form>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}
