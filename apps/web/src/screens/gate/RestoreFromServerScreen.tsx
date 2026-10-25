import { useState } from 'react';
import type { PlateSummary, OpenServerCopyFailure, RestoreFromServerResult } from '../../sync';
import { findFailureText, foundText } from '../../sync';
import { Button, TextField } from '../../components/primitives';
import { useLocale, useMessage, useStrings, type Message, type Strings } from '../../i18n';
import type { UnlockOutcome } from '../../storage';
import { GateFrame } from './GateFrame';
import { unavailableText } from './unavailable-text';

export type FindOnServerResult =
  | { readonly kind: 'found'; readonly summary: PlateSummary }
  | {
      readonly kind: 'failed';
      readonly failure: OpenServerCopyFailure;
      readonly retryAfterSeconds?: number;
    };

function outcomeText(outcome: UnlockOutcome, all: Strings): string {
  switch (outcome.kind) {
    case 'passphraseRejected':
      return outcome.issue === 'tooShort' ? all.session.tooShort : all.session.tooRepetitive;
    case 'inUseElsewhere':
      return all.session.inOtherTab;
    case 'newerVersion':
      return all.session.newerVersion;
    case 'storeUnavailable':
      return unavailableText(outcome.reason, all.session);
    default:
      return all.session.unavailable;
  }
}

/** One calm line per way restoring into a new store can end. */
function restoreText(result: RestoreFromServerResult, all: Strings): string | null {
  switch (result.kind) {
    case 'restored':
      return null;
    case 'passphraseRejected':
      return all.server.restoreWeak;
    case 'clockAhead':
      return all.server.clockAhead;
    case 'createFailed':
      return outcomeText(result.outcome, all);
    case 'storeProblem':
      return all.server.storeProblem;
    case 'storeProblemNotRemoved':
      return all.server.storeProblemNotRemoved;
  }
}

/**
 * First run, "Restore from this server" (plan §3.6, Case A). Handle and passphrase are asked
 * together, because the server never says whether a handle exists. The copy is found and opened
 * FIRST; the person sees what was found ("412 plates, from March 2026 to today") and only then is
 * the store created, with the same passphrase. Every failure is one calm line and leaves this
 * device exactly as it was. The fields are emptied after every attempt.
 */
export function RestoreFromServerScreen({
  onFind,
  onRestore,
  onCancel,
  onBack,
}: {
  readonly onFind: (handle: string, passphrase: string) => Promise<FindOnServerResult>;
  readonly onRestore: () => Promise<RestoreFromServerResult>;
  /** Drops the copy that was found (the person changed their mind). */
  readonly onCancel: () => void;
  readonly onBack: () => void;
}) {
  const all = useStrings();
  const s = all.server;
  const { locale } = useLocale();
  const [handle, setHandle] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [found, setFound] = useState<{
    readonly summary: PlateSummary;
    readonly at: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();

  const find = async () => {
    if (busy) return;
    setMessage(null);
    if (handle.trim() === '') {
      setMessage((a) => a.server.missingHandle);
      return;
    }
    if (passphrase === '') {
      setMessage((a) => a.server.missingPassphrase);
      return;
    }
    setBusy(true);
    let next: Message | null;
    try {
      const result = await onFind(handle, passphrase);
      if (result.kind === 'found') {
        setFound({ summary: result.summary, at: Date.now() });
        next = null;
      } else {
        const failure = result.failure;
        next = (a) => findFailureText(failure, a.server);
      }
    } catch {
      next = (a) => a.server.unavailable;
    } finally {
      setPassphrase('');
    }
    setBusy(false);
    setMessage(next);
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    let next: Message | null;
    try {
      const result = await onRestore();
      next = (a) => restoreText(result, a);
      if (result.kind === 'passphraseRejected') setFound(null);
    } catch {
      next = (a) => a.server.unavailable;
    }
    setBusy(false);
    setMessage(next);
  };

  return (
    <GateFrame title={s.restoreTitle}>
      <p className="text-body text-ink-soft">{s.restoreExplain}</p>
      <p className="text-body">{s.restoreSame}</p>
      {found === null ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
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
            label={s.joinPassphraseLabel}
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <Button type="submit" fullWidth busy={busy} busyLabel={s.joinWorking}>
            {s.restoreFind}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body" role="status">
            {foundText(found.summary, found.at, locale, s)}
          </p>
          <Button fullWidth busy={busy} busyLabel={s.restoreWorking} onClick={() => void restore()}>
            {s.restoreAction}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            aria-disabled={busy || undefined}
            onClick={() => {
              onCancel();
              setFound(null);
              setMessage(null);
            }}
          >
            {s.restoreChange}
          </Button>
        </div>
      )}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
      <Button
        variant="secondary"
        fullWidth
        aria-disabled={busy || undefined}
        onClick={() => {
          onCancel();
          onBack();
        }}
      >
        {s.restoreBack}
      </Button>
    </GateFrame>
  );
}

/** Shown while a copy is put into the new store after "Start fresh". Nothing to do but wait. */
export function ServerRestoringScreen() {
  const s = useStrings().server;
  return (
    <GateFrame title={s.restoringTitle}>
      <p role="status" className="text-body text-ink-soft">
        {s.restoringBody}
      </p>
    </GateFrame>
  );
}
