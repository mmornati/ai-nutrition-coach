import { useEffect, useRef, useState } from 'react';
import type { FoodEntryDraft, FoodUse, RecordPlateResult } from '@anc/core';
import { useMessage, useStrings } from '../../i18n';
import { Button, TextField } from '../../components/primitives';
import { QuantityPicker, Sheet } from '../../components/sheets';
import { useManualEntry } from '../../catalog';
import type { LogOutcome } from '../../catalog';
import { useSession } from '../../app/session';
import { MatchList } from './MatchList';
import { RecentFoods } from './RecentFoods';

/**
 * Type it: ranked matches as you type, honest portion presets (the first is the default), Log. A
 * name that matches nothing (or a catalog that cannot answer) opens the custom food form, which
 * logs `~1 serving` with an unknown group. A scanned barcode the catalog did not know arrives
 * prefilled. Works fully offline: the search never touches the network.
 */
export function TypeIt({
  prefill,
  onLogged,
}: {
  readonly prefill?: string | undefined;
  readonly onLogged: () => void;
}) {
  const s = useStrings();
  const c = s.catalog;
  const { catalog, recordPlate } = useSession();
  const { session, state } = useManualEntry(catalog);
  const [note, setNote] = useMessage();
  // False while the Grams field holds text that is not a weight: Log stays off until it is.
  const [weightValid, setWeightValid] = useState(true);
  // A one-tap log from the recent lists is in flight: a second tap must not make a second plate.
  const [rowBusy, setRowBusy] = useState(false);
  // The selection came from a recent food's "Change": the lists step aside and focus goes to the
  // amount, so the person lands where the editing is.
  const [fromRecent, setFromRecent] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefill) void session.prefill(prefill);
  }, [session, prefill]);

  const commit = (drafts: readonly FoodEntryDraft[]): Promise<RecordPlateResult> =>
    recordPlate(drafts);

  const finish = (outcome: LogOutcome) => {
    switch (outcome.kind) {
      case 'logged':
        setNote(null);
        onLogged();
        return;
      case 'needsQuantity':
        setNote((a) => a.catalog.pickQuantity);
        return;
      case 'needsName':
        setNote((a) => a.catalog.typeNameFirst);
        return;
      case 'failed':
        setNote((a) => a.common.logFailed);
        return;
      case 'busy':
        return;
    }
  };

  // One tap on a recent or frequent food: the same food snapshot with the quantity it last had.
  const logRecent = async (use: FoodUse) => {
    if (state.submitting || rowBusy) return;
    setRowBusy(true);
    try {
      const result = await commit([{ databaseFood: use.food, quantity: use.quantity }]);
      if (result.kind === 'recordPlateSuccess') onLogged();
      else setNote((a) => a.common.logFailed);
    } catch {
      setNote((a) => a.common.logFailed);
    } finally {
      setRowBusy(false);
    }
  };

  const selectedRef = state.selected?.food.sourceRef;
  useEffect(() => {
    if (fromRecent && selectedRef !== undefined) {
      pickerRef.current?.querySelector<HTMLElement>('input')?.focus();
    }
  }, [fromRecent, selectedRef]);

  const hasMatches = state.matches.length > 0;
  const showCustom =
    !hasMatches &&
    state.query.trim() !== '' &&
    (state.catalogStatus === 'notFound' || state.catalogStatus === 'catalogFailure');
  const selected = state.selected;
  const chosen = state.chosenPreset ?? selected?.presets[0] ?? null;
  const message = state.lastError === 'searchUnavailable' ? c.searchUnavailable : note;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={c.searchLabel}
        value={state.query}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          setNote(null);
          setFromRecent(false);
          void session.updateQuery(e.target.value);
        }}
      />
      {state.query.trim() === '' && !hasMatches && (
        <p className="text-body-small text-porcelain-dim">{c.typeHint}</p>
      )}
      {hasMatches && (
        <MatchList
          matches={state.matches}
          selected={selected}
          onSelect={(match) => session.selectMatch(match)}
        />
      )}
      {showCustom && (
        <div className="flex flex-col gap-3">
          <p className="text-body-small text-porcelain-dim">{c.customHint}</p>
          <TextField
            label={c.customFoodName}
            value={state.customName}
            onChange={(e) => session.setCustomName(e.target.value)}
          />
          <Button
            variant="outline-porcelain"
            fullWidth
            busy={state.submitting}
            busyLabel={s.common.logging}
            onClick={() => void session.logCustom(commit).then(finish)}
          >
            {c.logCustomFood}
          </Button>
        </div>
      )}
      {selected && chosen && (
        <div ref={pickerRef}>
          <QuantityPicker
            key={selected.food.sourceRef}
            food={selected.food}
            presets={selected.presets}
            value={chosen}
            onChange={(preset) => session.selectPreset(preset)}
            onValidityChange={setWeightValid}
          />
        </div>
      )}
      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {message}
      </p>
      {(hasMatches || selected !== null) && (
        <Button
          fullWidth
          disabled={selected === null || !weightValid}
          busy={state.submitting}
          busyLabel={s.common.logging}
          onClick={() => void session.logSelected(commit).then(finish)}
        >
          {s.common.log}
        </Button>
      )}
      {!hasMatches && state.query.trim() === '' && selected === null && (
        <RecentFoods
          busy={state.submitting || rowBusy}
          onLog={(use) => void logRecent(use)}
          onEdit={(match) => {
            setFromRecent(true);
            session.selectMatch(match);
          }}
        />
      )}
    </div>
  );
}

/** The Type it sheet: a bottom sheet on a phone, a centred dialog on desktop. */
export function TypeItSheet({
  open,
  prefill,
  onClose,
  onLogged,
}: {
  readonly open: boolean;
  readonly prefill?: string | undefined;
  readonly onClose: () => void;
  readonly onLogged: () => void;
}) {
  const s = useStrings().catalog;
  return (
    <Sheet open={open} onClose={onClose} title={s.title}>
      <TypeIt prefill={prefill} onLogged={onLogged} />
    </Sheet>
  );
}
