import { useState } from 'react';
import type { UnavailableReason } from '../../storage';
import { useStrings } from '../../i18n';
import { Button } from '../../components/primitives';
import { GateFrame } from './GateFrame';
import { unavailableText } from './unavailable-text';

/**
 * The browser cannot use (or right now cannot read) its storage. It says nothing about the data,
 * so the one way forward is "Try again": erasing is NOT offered here. Never reported as a wrong
 * passphrase. Plain http:// (`insecureContext`) shows only its HTTPS explanation: no retry button.
 */
export function StoreUnavailableScreen({
  reason,
  onRetry,
}: {
  readonly reason: UnavailableReason | null;
  readonly onRetry: () => Promise<void>;
}) {
  const s = useStrings();
  const [busy, setBusy] = useState(false);
  const body = unavailableText(reason, s.session);
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <GateFrame title={s.storeUnavailable.title} diagram={false}>
      <p className="text-body text-porcelain-dim">{body}</p>
      {/* Plain http:// cannot be fixed by trying again: the page has to be opened over https. */}
      {reason !== 'insecureContext' && (
        <Button fullWidth busy={busy} onClick={() => void retry()}>
          {s.storeUnavailable.retry}
        </Button>
      )}
    </GateFrame>
  );
}
