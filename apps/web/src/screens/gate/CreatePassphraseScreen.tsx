import { useState } from 'react';
import { validateNewPassphrase, type PassphraseIssue, type UnlockOutcome } from '../../storage';
import { useStrings, type Strings } from '../../i18n';
import { Button, TextField } from '../../components/primitives';
import { GateFrame } from './GateFrame';

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
    case 'wrongPassphrase':
    case 'throttled':
    case 'storeUnavailable':
    case 'dataMissing':
      return s.unavailable;
  }
}

/**
 * First run: choose a passphrase (enter + confirm, strength floor). The "cannot be recovered"
 * warning is on screen BEFORE it is set, and both fields are emptied after every attempt.
 */
export function CreatePassphraseScreen({
  onCreate,
}: {
  readonly onCreate: (passphrase: string) => Promise<UnlockOutcome>;
}) {
  const s = useStrings().session;
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const issue = validateNewPassphrase(passphrase);
    if (issue !== null) {
      setMessage(issueText(issue, s));
      return;
    }
    if (passphrase !== confirm) {
      setMessage(s.mismatch);
      return;
    }
    setBusy(true);
    setMessage(null);
    let next: string | null;
    try {
      next = outcomeText(await onCreate(passphrase), s);
    } catch {
      next = s.unavailable;
    } finally {
      setPassphrase('');
      setConfirm('');
    }
    setBusy(false);
    setMessage(next);
  };

  return (
    <GateFrame title={s.createTitle}>
      <p className="text-body text-porcelain-dim">{s.createExplain}</p>
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
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {message}
      </p>
    </GateFrame>
  );
}
