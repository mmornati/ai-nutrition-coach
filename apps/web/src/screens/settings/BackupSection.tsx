import { useState, type Ref } from 'react';
import { Button, TextField } from '../../components/primitives';
import { useMessage, useStrings, type Message, type Strings } from '../../i18n';
import { validateNewPassphrase } from '../../storage';
import type { RunBackupResult } from '../../export';
import { Prose, Section } from './SettingsPage';

type Outcome =
  | { readonly kind: 'saved'; readonly filename: string }
  | { readonly kind: 'text'; readonly text: Message };

function failureText(
  reason: (RunBackupResult & { kind: 'failed' })['reason'],
  s: Strings['backup'],
) {
  switch (reason) {
    case 'storeClosed':
      return s.failedLocked;
    case 'readFailed':
      return s.failedRead;
    case 'tooLarge':
      return s.failedTooLarge;
    case 'sealFailed':
      return s.failedSeal;
    case 'deliveryFailed':
      return s.failedDelivery;
  }
}

/**
 * Settings, Your data: save an encrypted backup. A passphrase typed twice (the same strength floor
 * as the app passphrase), the plain warning that a forgotten one cannot be recovered, one button,
 * one calm line. The fields are emptied after every attempt, and the passphrase is handed on once
 * and not kept.
 */
export function BackupSection({
  run,
  live,
  onSaved,
  fieldRef,
}: {
  readonly run: (passphrase: string) => Promise<RunBackupResult>;
  /** False once the session was disposed: a late result must not touch the screen. */
  readonly live: () => boolean;
  /** A file was delivered (the "last export" line is read again). */
  readonly onSaved: () => Promise<void>;
  /** The first field, so the reminder can move focus to it. */
  readonly fieldRef?: Ref<HTMLInputElement>;
}) {
  const all = useStrings();
  const s = all.backup;
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useMessage();

  const submit = async () => {
    if (busy) return;
    setOutcome(null);
    setMessage(null);
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
    try {
      const result = await run(passphrase);
      if (!live()) return;
      switch (result.kind) {
        case 'saved':
          setOutcome({ kind: 'saved', filename: result.filename });
          await onSaved();
          break;
        case 'cancelled':
          setOutcome({ kind: 'text', text: (a) => a.backup.cancelled });
          break;
        case 'failed':
          setOutcome({ kind: 'text', text: (a) => failureText(result.reason, a.backup) });
          break;
      }
    } catch {
      if (live()) setOutcome({ kind: 'text', text: (a) => a.backup.failedSeal });
    } finally {
      setPassphrase('');
      setConfirm('');
      if (live()) setBusy(false);
    }
  };

  return (
    <Section title={s.heading}>
      <Prose>{s.explain}</Prose>
      <Prose>{s.suggest}</Prose>
      <p className="text-body">{s.warning}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          ref={fieldRef}
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
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          busy={busy}
          busyLabel={s.working}
        >
          {s.action}
        </Button>
      </form>
      <p role="status" className="text-body text-ink empty:hidden">
        {outcome?.kind === 'saved' ? (
          <>
            {s.savedLine} <span className="[overflow-wrap:anywhere]">{outcome.filename}</span>
          </>
        ) : (
          (outcome?.text(all) ?? message)
        )}
      </p>
    </Section>
  );
}
