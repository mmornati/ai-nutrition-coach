import { useState } from 'react';
import type { EraseLocalDataResult } from '@anc/core';
import { useMessage, useStrings, type Message } from '../../i18n';
import { Button } from '../../components/primitives';
import { EraseLocalDataDialog } from '../../components/dialogs';
import { GateFrame } from './GateFrame';

export interface LostStoreCopy {
  readonly title: string;
  readonly body: string;
  readonly action: string;
}

/**
 * The saved history cannot be found or opened. Calm, factual, never blaming; the only way
 * forward is the confirmed erase. Used for a missing store, a corrupt header and any open failure.
 */
export function LostStoreScreen({
  copy,
  onErase,
}: {
  readonly copy?: LostStoreCopy;
  readonly onErase: () => Promise<EraseLocalDataResult>;
}) {
  const all = useStrings();
  const text = copy ?? all.keyLost.unreadable;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();

  const erase = async () => {
    if (busy) return;
    setConfirming(false);
    setBusy(true);
    let next: Message | null = null;
    try {
      const result = await onErase();
      if (result.kind === 'eraseLocalDataFailure') next = (a) => a.erase.failed;
    } catch {
      next = (a) => a.erase.failed;
    }
    setBusy(false);
    setMessage(next);
  };

  return (
    <GateFrame title={text.title} diagram={false}>
      <p className="text-body text-ink-soft">{text.body}</p>
      <Button variant="secondary" fullWidth busy={busy} onClick={() => setConfirming(true)}>
        {text.action}
      </Button>
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
      <EraseLocalDataDialog
        open={confirming}
        onKeep={() => setConfirming(false)}
        onErase={() => void erase()}
      />
    </GateFrame>
  );
}
