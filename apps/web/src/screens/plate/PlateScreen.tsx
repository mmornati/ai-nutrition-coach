import { useEffect, useState } from 'react';
import {
  copyDrafts,
  mealSlotForHour,
  type MealSlot,
  plateNutrients,
  startOfLocalDay,
  type FoodEntryDraft,
  type PlateLog,
  type RecordPlateResult,
} from '@anc/core';
import { Button, groupsOfPlate } from '../../components/primitives';
import { LineBar, EntryList } from '../../components/sheets';
import { StatusChip } from '../../components/day';
import { formatTime } from '../../components/day/format';
import { RemovePlateDialog } from '../../components/dialogs';
import { foodName } from '../../catalog';
import { entryQuantityText, NutritionSection } from '../../components/nutrition';
import { useLocale, useStrings } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { useDay, useNoticeTimeout } from '../../app/day-context';
import { hrefs, replaceRoute, TODAY_HASH } from '../../app/router';
import { BackToToday, ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { usePlateSyncStatuses } from '../../app/sync-status';
import { PlateCoach, useDismissals } from '../today/coach';
import { CopyPlateSheet } from './CopyPlateSheet';
import { EditPlateSheet } from './EditPlateSheet';
import { SaveMealSheet } from './SaveMealSheet';
import { sameDrafts } from './same-drafts';
import { plateSummary } from './summary';

/**
 * One plate: which food groups are on it, what is on it (portions as honest ranges), the coach
 * follow-up, and a calm, confirmed remove. Reached from Today; a plate that is not in the week
 * any more (or was just removed) sends the person back to Today.
 */
export function PlateScreen({
  plateId,
  editing = false,
}: {
  readonly plateId: number;
  /** The route asked for the edit sheet (`#/plate/<id>/edit`, the "complete this food" links). */
  readonly editing?: boolean;
}) {
  const all = useStrings();
  const { locale } = useLocale();
  const { deletePlate, notes, replacePlate } = useSession();
  const day = useDay();
  const dismissed = useDismissals(notes);
  const sync = usePlateSyncStatuses();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(editing);
  // The route can ask for the sheet while this screen is already showing (a "complete this food"
  // link): adjusted during render, not in an effect.
  const [seenEditing, setSeenEditing] = useState(editing);
  if (editing !== seenEditing) {
    setSeenEditing(editing);
    if (editing) setEditOpen(true);
  }

  useNoticeTimeout(day.notice, () => day.setNotice(null));

  const found = day.plates.find((p) => p.id === plateId) ?? null;
  // The plate this screen last showed, and the id of the plate being edited away from (set from
  // the moment the edit starts until the edited plate is on screen): an edit gives the plate a new
  // id, the old one leaves the week a moment before the new one is known, and in between the
  // screen keeps showing the old one. That must not read as "this plate is gone" (a redirect), nor
  // unmount the screen (which would drop focus to the page).
  const [shown, setShown] = useState<PlateLog | null>(found);
  if (found !== null && shown !== found) setShown(found);
  const [swappedFrom, setSwappedFrom] = useState<number | null>(null);
  if (swappedFrom !== null && found !== null && found.id !== swappedFrom) setSwappedFrom(null);
  const plate = found ?? (swappedFrom !== null ? shown : null);
  const settled = day.status !== 'loading';
  useEffect(() => {
    if (settled && plate === null) replaceRoute(TODAY_HASH);
  }, [settled, plate]);
  if (plate === null) return null;

  const closeEdit = () => {
    setEditOpen(false);
    if (editing) replaceRoute(hrefs.plate(plate.id));
  };

  const saveEdit = async (
    drafts: readonly FoodEntryDraft[],
    loggedAtUtc: number,
    slot: MealSlot | null,
  ) => {
    // Nothing changed: nothing to write. A replace would wipe the plate's coach interactions,
    // bring back a dismissed note, ask the AI for a new one and leave tombstones for no reason.
    if (
      loggedAtUtc === plate.loggedAtUtc &&
      slot === (plate.slot ?? null) &&
      sameDrafts(drafts, copyDrafts(plate.entries))
    ) {
      closeEdit();
      return true;
    }
    setSwappedFrom(plate.id);
    let result: RecordPlateResult | null;
    try {
      result = await replacePlate(plate.id, drafts, loggedAtUtc, slot);
    } catch {
      result = null;
    }
    if (result?.kind === 'storeFailure' && result.reason === 'notFound') {
      // Removed meanwhile (here or on another device): the edit must not bring it back.
      day.setNotice((a) => a.plate.editFailed);
      replaceRoute(TODAY_HASH);
      return false;
    }
    if (result?.kind !== 'recordPlateSuccess') {
      setSwappedFrom(null);
      return false;
    }
    day.select(startOfLocalDay(loggedAtUtc));
    day.setNotice((a) => a.plate.editSaved);
    setEditOpen(false);
    replaceRoute(hrefs.plate(result.plateLog.id));
    return true;
  };

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
          title={slotName(plate.slot ?? mealSlotForHour(new Date(plate.loggedAtUtc).getHours()))}
          sub={formatTime(plate.loggedAtUtc)}
        />
      }
    >
      <div className="flex max-w-2xl flex-col gap-5 px-5 pt-5 pb-6 lg:px-7">
        <LineBar present={groupsOfPlate(plate)} />
        <h2 className="font-display text-section text-thread">{all.entries.label}</h2>
        <EntryList
          entries={plate.entries.map((e) => ({
            id: String(e.id),
            name: foodName(e.databaseFood, locale),
            quantity: entryQuantityText(e.quantity, locale),
            group: e.databaseFood.foodGroup,
          }))}
        />
        <NutritionSection
          title={all.nutrition.sectionTitle}
          nutrition={plateNutrients(plate)}
          fixHref={(entry) => hrefs.plateEdit(entry.plateLogId)}
        />
        <PlateCoach plate={plate} dismissed={dismissed} />
        <p role="status" className="text-thread text-meta empty:hidden">
          {day.notice}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip hasTransport={sync.hasTransport} status={sync.statusOf(plate.id)} />
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            {all.plate.editAction}
          </Button>
          <Button variant="secondary" onClick={() => setCopying(true)}>
            {all.relog.again}
          </Button>
          <Button variant="secondary" onClick={() => setSaving(true)}>
            {all.relog.saveMeal}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {all.plate.removeAction}
          </Button>
        </div>
      </div>
      <EditPlateSheet
        key={plate.id}
        open={editOpen}
        plate={plate}
        onClose={closeEdit}
        onSave={saveEdit}
      />
      <CopyPlateSheet open={copying} plate={plate} onClose={() => setCopying(false)} />
      <SaveMealSheet open={saving} plate={plate} onClose={() => setSaving(false)} />
      <RemovePlateDialog
        elsewhere={sync.hasTransport}
        open={confirming}
        dish={plateSummary(plate)}
        busy={busy}
        onKeep={() => setConfirming(false)}
        onRemove={() => void remove()}
      />
    </ScreenFrame>
  );
}
