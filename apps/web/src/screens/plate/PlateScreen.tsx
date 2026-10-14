import { useEffect, useState } from 'react';
import { mealSlotForHour } from '@anc/core';
import { Button, groupsOfPlate } from '../../components/primitives';
import { LineBar, EntryList } from '../../components/sheets';
import { StatusChip } from '../../components/day';
import { formatTime } from '../../components/day/format';
import { RemovePlateDialog } from '../../components/dialogs';
import { foodName, quantityLabel } from '../../catalog';
import { useLocale, useStrings } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { useDay } from '../../app/day-context';
import { replaceRoute, TODAY_HASH } from '../../app/router';
import { BackToToday, ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { PlateCoach, useDismissals } from '../today/coach';
import { plateSummary } from './summary';

/**
 * One plate: which lines stopped, what is on it (portions as honest ranges), the coach
 * follow-up, and a calm, confirmed remove. Reached from Today; a plate that is not in the week
 * any more (or was just removed) sends the person back to Today.
 */
export function PlateScreen({ plateId }: { readonly plateId: number }) {
  const all = useStrings();
  const { locale } = useLocale();
  const { deletePlate, notes } = useSession();
  const day = useDay();
  const dismissed = useDismissals(notes);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const plate = day.plates.find((p) => p.id === plateId) ?? null;
  const settled = day.status !== 'loading';
  useEffect(() => {
    if (settled && plate === null) replaceRoute(TODAY_HASH);
  }, [settled, plate]);
  if (plate === null) return null;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    let removed = false;
    try {
      removed = (await deletePlate(plate.id)).kind === 'plateDeleted';
    } catch {
      removed = false;
    }
    setBusy(false);
    setConfirming(false);
    day.setNotice((a) => (removed ? a.today.plateRemoved : a.today.plateRemoveFailed));
    if (removed) replaceRoute(TODAY_HASH);
  };

  return (
    <ScreenFrame
      current="today"
      header={
        <ScreenHeader
          back={<BackToToday />}
          title={slotName(mealSlotForHour(new Date(plate.loggedAtUtc).getHours()))}
          sub={formatTime(plate.loggedAtUtc)}
        />
      }
    >
      <div className="flex max-w-2xl flex-col gap-5 px-5 pt-5 pb-6 lg:px-7">
        <LineBar present={groupsOfPlate(plate)} />
        <h2 className="font-display text-section text-signal-muted uppercase">
          {all.entries.label}
        </h2>
        <EntryList
          entries={plate.entries.map((e) => ({
            id: String(e.id),
            name: foodName(e.databaseFood, locale),
            quantity: quantityLabel(e.quantity, locale),
            group: e.databaseFood.foodGroup,
          }))}
        />
        <PlateCoach plate={plate} dismissed={dismissed} />
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip hasTransport={false} />
          <Button variant="outline-porcelain" onClick={() => setConfirming(true)}>
            {all.plate.removeAction}
          </Button>
        </div>
      </div>
      <RemovePlateDialog
        open={confirming}
        dish={plateSummary(plate)}
        busy={busy}
        onKeep={() => setConfirming(false)}
        onRemove={() => void remove()}
      />
    </ScreenFrame>
  );
}
