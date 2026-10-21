import type { MealSlot } from '@anc/core';
import { ConfirmDialog } from '../../components/dialogs';
import { fill, useStrings } from '../../i18n';
import { slotName } from '../../i18n/sentences';

/** One planned plate as the dialog lists it: "Lunch, 12:30: Rice, salmon". */
export interface CopyLine {
  readonly id: number;
  readonly slot: MealSlot;
  readonly time: string;
  readonly foods: string;
}

/**
 * "Copy this day to today": says exactly which plates will be added, at which times, then waits.
 * "Not now" is the safe choice and has the focus; nothing changes until "Copy to today".
 */
export function CopyDayDialog({
  open,
  lines,
  busy,
  onKeep,
  onCopy,
}: {
  readonly open: boolean;
  readonly lines: readonly CopyLine[];
  readonly busy: boolean;
  readonly onKeep: () => void;
  readonly onCopy: () => void;
}) {
  const t = useStrings().relog;
  return (
    <ConfirmDialog
      open={open}
      title={t.copyDay}
      body={
        <div className="flex flex-col gap-3">
          <p>{t.copyDayIntro}</p>
          <ul aria-label={t.copyDayList} className="border-porcelain border-t-2">
            {lines.map((line) => (
              <li key={line.id} className="border-rule text-body-small border-b py-2">
                {fill(t.copyDayLine, {
                  meal: slotName(line.slot),
                  time: line.time,
                  foods: line.foods,
                })}
              </li>
            ))}
          </ul>
        </div>
      }
      confirmLabel={t.copyDayConfirm}
      dismissLabel={t.copyDayKeep}
      onConfirm={onCopy}
      onDismiss={onKeep}
      busy={busy}
    />
  );
}
