import { useState } from 'react';
import { validateNewPassphrase, type PassphraseIssue, type UnlockOutcome } from '../../storage';
import { useMessage, useStrings, type Message, type Strings } from '../../i18n';
import { Button, FileField, TextField } from '../../components/primitives';
import { openFailureText, type RestoreNewStoreResult } from '../../sync/vault';
import { GateFrame } from './GateFrame';
import { unavailableText } from './unavailable-text';

const issueText = (issue: PassphraseIssue, s: Strings['session']): string =>
  issue === 'tooShort' ? s.tooShort : s.tooRepetitive;

/** One calm line per outcome of a create attempt. `null` means it worked. */
function outcomeText(outcome: UnlockOutcome, s: Strings['session']): string | null {
  switch (outcome.kind) {
    case 'unlocked':
      return null;
    case 'passphraseRejected':
      return issueText(outcome.issue, s);
    case 'inUseElsewhere':
      return s.inOtherTab;
    case 'newerVersion':
      return s.newerVersion;
    case 'storeUnavailable':
      return unavailableText(outcome.reason, s);
    case 'wrongPassphrase':
    case 'throttled':
    case 'dataMissing':
      return s.unavailable;
  }
}

/** One calm line per way restoring into a new store can end. `null` means it worked. */
function restoreText(result: RestoreNewStoreResult, all: Strings): string | null {
  switch (result.kind) {
    case 'restored':
      return null;
    case 'passphraseRejected':
      return all.restore.createWeak;
    case 'failed':
      return openFailureText(result.failure, all.restore);
    case 'clockAhead':
      return all.restore.clockAhead;
    case 'createFailed':
      return outcomeText(result.outcome, all.session);
    case 'storeProblem':
      return all.restore.storeProblem;
    case 'storeProblemNotRemoved':
      return all.restore.storeProblemNotRemoved;
  }
}

/**
 * "I have a backup": choose the file and enter its passphrase. The file is opened and validated
 * BEFORE any store exists (the owner of `onRestore` guarantees it), so a wrong passphrase or a bad
 * file leaves this device untouched. The backup's passphrase becomes this device's, and the screen
 * says so. The passphrase field is emptied after every attempt.
 */
function RestoreFromBackup({
  onRestore,
  onBack,
}: {
  readonly onRestore: (file: File, passphrase: string) => Promise<RestoreNewStoreResult>;
  readonly onBack: () => void;
}) {
  const all = useStrings();
  const s = all.restore;
  const [file, setFile] = useState<File | null>(null);
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
      const result = await onRestore(file, passphrase);
      next = (a) => restoreText(result, a);
    } catch {
      next = (a) => a.restore.unavailable;
    } finally {
      setPassphrase('');
    }
    setBusy(false);
    setMessage(next);
  };

  return (
    <GateFrame title={s.createTitle}>
      <p className="text-body text-ink-soft">{s.createExplain}</p>
      <p className="text-body">{s.createSame}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FileField label={s.fileLabel} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <TextField
          label={s.passphraseLabel}
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <Button type="submit" fullWidth busy={busy} busyLabel={s.working}>
          {s.createAction}
        </Button>
      </form>
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
      <Button variant="secondary" fullWidth aria-disabled={busy || undefined} onClick={onBack}>
        {s.createBack}
      </Button>
    </GateFrame>
  );
}

/**
 * First run: choose a passphrase (enter + confirm, strength floor). The "cannot be recovered"
 * warning is on screen BEFORE it is set, and both fields are emptied after every attempt. With
 * `onRestore` a second, quieter path starts from a backup file instead.
 */
export function CreatePassphraseScreen({
  onCreate,
  onRestore,
}: {
  readonly onCreate: (passphrase: string) => Promise<UnlockOutcome>;
  /** Present when restoring from a backup is offered on this screen. */
  readonly onRestore?: (file: File, passphrase: string) => Promise<RestoreNewStoreResult>;
}) {
  const all = useStrings();
  const s = all.session;
  const [restoring, setRestoring] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();

  const submit = async () => {
    if (busy) return;
    const issue = validateNewPassphrase(passphrase);
    if (issue !== null) {
      setMessage((a) => issueText(issue, a.session));
      return;
    }
    if (passphrase !== confirm) {
      setMessage((a) => a.session.mismatch);
      return;
    }
    setBusy(true);
    setMessage(null);
    let next: Message | null;
    try {
      const outcome = await onCreate(passphrase);
      next = (a) => outcomeText(outcome, a.session);
    } catch {
      next = (a) => a.session.unavailable;
    } finally {
      setPassphrase('');
      setConfirm('');
    }
    setBusy(false);
    setMessage(next);
  };

  if (restoring && onRestore) {
    return <RestoreFromBackup onRestore={onRestore} onBack={() => setRestoring(false)} />;
  }

  return (
    <GateFrame title={s.createTitle}>
      <p className="text-body text-ink-soft">{s.createExplain}</p>
      <p className="text-body">{s.createWarning}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={s.createPassphraseLabel}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <TextField
          label={s.createConfirmLabel}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" fullWidth busy={busy}>
          {s.createAction}
        </Button>
      </form>
      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
      {onRestore && (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            // The two passphrases typed so far are not carried into the other path.
            setPassphrase('');
            setConfirm('');
            setMessage(null);
            setRestoring(true);
          }}
        >
          {all.restore.createLink}
        </Button>
      )}
    </GateFrame>
  );
}
