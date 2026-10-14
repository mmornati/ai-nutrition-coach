import { useState } from 'react';
import type { EraseLocalDataResult } from '@anc/core';
import type { UnlockOutcome } from '../../storage';
import { useStrings, type Strings } from '../../i18n';
import { Button, TextField } from '../../components/primitives';
import { EraseLocalDataDialog } from '../../components/dialogs';
import { GateFrame } from './GateFrame';

function outcomeText(outcome: UnlockOutcome, s: Strings['session']): string | null {
  switch (outcome.kind) {
    case 'unlocked':
    case 'dataMissing':
      return null;
    case 'wrongPassphrase':
    case 'passphraseRejected':
      return s.wrongPassphrase;
    case 'throttled':
      return s.throttled;
    case 'storeUnavailable':
      return s.unavailable;
    case 'inUseElsewhere':
      return s.inOtherTab;
    case 'newerVersion':
      return s.newerVersion;
  }
}

/**
 * A returning person: the passphrase on the line diagram. One calm line per failure, the busy
 * state is reset on EVERY outcome, the field is emptied after every attempt, and "Forgot your
 * passphrase?" says it cannot be recovered and offers the confirmed erase.
 */
export function UnlockScreen({
  onUnlock,
  onErase,
}: {
  readonly onUnlock: (passphrase: string) => Promise<UnlockOutcome>;
  /** The confirmed erase. Omit to hide the "forgot" disclosure. */
  readonly onErase?: () => Promise<EraseLocalDataResult>;
}) {
  const all = useStrings();
  const s = all.session;
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (passphrase === '') {
      setMessage(s.wrongPassphrase);
      return;
    }
    setBusy(true);
    setMessage(null);
    let next: string | null;
    try {
      next = outcomeText(await onUnlock(passphrase), s);
    } catch {
      next = s.unavailable;
    } finally {
      setPassphrase('');
    }
    setBusy(false);
    setMessage(next);
  };

  const erase = async () => {
    if (!onErase || busy) return;
    setConfirming(false);
    setBusy(true);
    let next: string | null = null;
    try {
      const result = await onErase();
      if (result.kind === 'eraseLocalDataFailure') next = all.erase.failed;
    } catch {
      next = all.erase.failed;
    }
    setBusy(false);
    setMessage(next);
  };

  return (
    <GateFrame title={s.label}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={s.placeholder}
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <Button type="submit" fullWidth busy={busy}>
          {s.unlock}
        </Button>
      </form>
      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {message}
      </p>
      {onErase && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={forgotOpen}
            onClick={() => setForgotOpen((open) => !open)}
            className="text-porcelain-dim min-h-12 cursor-pointer self-start bg-transparent text-left underline underline-offset-4"
          >
            {s.forgot}
          </button>
          {forgotOpen && (
            <>
              <p className="text-body-small text-porcelain-dim">{s.forgotBody}</p>
              <Button
                variant="outline-porcelain"
                fullWidth
                aria-disabled={busy || undefined}
                onClick={() => setConfirming(true)}
              >
                {s.forgotAction}
              </Button>
            </>
          )}
        </div>
      )}
      <EraseLocalDataDialog
        open={confirming}
        onKeep={() => setConfirming(false)}
        onErase={() => void erase()}
      />
    </GateFrame>
  );
}
