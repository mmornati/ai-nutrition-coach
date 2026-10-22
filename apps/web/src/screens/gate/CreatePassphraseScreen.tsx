import { useState } from 'react';
import { validateNewPassphrase, type PassphraseIssue, type UnlockOutcome } from '../../storage';
import { useMessage, useStrings, type Message, type Strings } from '../../i18n';
import { Button, TextField } from '../../components/primitives';
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
    </GateFrame>
  );
}
