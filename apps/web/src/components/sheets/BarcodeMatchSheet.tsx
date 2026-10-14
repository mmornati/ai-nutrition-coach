import { useState } from 'react';
import type { FoodEntryDraft, FoodMatch } from '@anc/core';
import { useStrings } from '../../i18n';
import { Button } from '../primitives/Button';
import { GroupMarker } from '../primitives/GroupMarker';
import { effectivePresets, ONE_SERVING } from './foods';
import { PortionPresets } from './PortionPresets';
import { Sheet } from './Sheet';

export interface BarcodeMatchSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly match: FoodMatch;
  /** Commit one food. While the returned promise is pending the Log button is disabled. */
  readonly onLog: (draft: FoodEntryDraft) => void | Promise<void>;
  /** A calm line shown when the last attempt failed. */
  readonly errorMessage?: string | undefined;
}

function Body({ match, onLog, errorMessage }: Omit<BarcodeMatchSheetProps, 'open' | 'onClose'>) {
  const s = useStrings();
  const presets = effectivePresets(match.presets);
  const [chosen, setChosen] = useState(presets[0] ?? ONE_SERVING);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onLog({ databaseFood: match.food, quantity: chosen });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PortionPresets presets={presets} value={chosen} onChange={setChosen} />
      {errorMessage && (
        <p role="status" className="text-body-small text-porcelain-dim">
          {errorMessage}
        </p>
      )}
      <Button
        fullWidth
        busy={submitting}
        busyLabel={s.common.logging}
        onClick={() => void submit()}
      >
        {s.common.log}
      </Button>
    </>
  );
}

/** A scanned barcode matched a food: confirm the portion and log it as one plate. */
export function BarcodeMatchSheet({
  open,
  onClose,
  match,
  onLog,
  errorMessage,
}: BarcodeMatchSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={match.food.displayName}
      subtitle={<GroupMarker group={match.food.foodGroup} />}
    >
      <Body match={match} onLog={onLog} errorMessage={errorMessage} />
    </Sheet>
  );
}
