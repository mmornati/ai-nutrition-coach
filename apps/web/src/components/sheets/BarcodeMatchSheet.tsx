import { useRef, useState } from 'react';
import type { FoodEntryDraft, FoodMatch } from '@anc/core';
import { useStrings } from '../../i18n';
import { Button } from '../primitives/Button';
import { GroupMarker } from '../primitives/GroupMarker';
import { effectivePresets, oneServing } from './foods';
import { QuantityPicker } from './QuantityPicker';
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
  const [chosen, setChosen] = useState(presets[0] ?? oneServing());
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // False while the Grams field holds text that is not a weight: Log stays off until it is.
  const [valid, setValid] = useState(true);
  const inFlight = useRef(false);

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onLog({ databaseFood: match.food, quantity: chosen });
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  const message = errorMessage ?? (failed ? s.common.logFailed : undefined);

  return (
    <>
      <QuantityPicker
        presets={presets}
        value={chosen}
        onChange={setChosen}
        onValidityChange={setValid}
        food={match.food}
      />
      {/* Always mounted: a live region is only announced reliably when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:-mt-4">
        {message}
      </p>
      <Button
        fullWidth
        disabled={!valid}
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
      focusTitle
      subtitle={<GroupMarker group={match.food.foodGroup} />}
    >
      <Body match={match} onLog={onLog} errorMessage={errorMessage} />
    </Sheet>
  );
}
