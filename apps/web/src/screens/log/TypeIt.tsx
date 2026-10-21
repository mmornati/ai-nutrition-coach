import { useEffect } from 'react';
import type { FoodEntryDraft, RecordPlateResult } from '@anc/core';
import { fill, useLocale, useMessage, useStrings } from '../../i18n';
import { Button, GroupMarker, TextField } from '../../components/primitives';
import { QuantityPicker, Sheet } from '../../components/sheets';
import { foodName, useManualEntry } from '../../catalog';
import type { LogOutcome } from '../../catalog';
import { useSession } from '../../app/session';

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
  const { locale } = useLocale();
  const { catalog, recordPlate } = useSession();
  const { session, state } = useManualEntry(catalog);
  const [note, setNote] = useMessage();

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
          void session.updateQuery(e.target.value);
        }}
      />
      {state.query.trim() === '' && !hasMatches && (
        <p className="text-body-small text-porcelain-dim">{c.typeHint}</p>
      )}
      {hasMatches && (
        <ul aria-label={c.results} className="border-porcelain border-t-2">
          {state.matches.map((match) => {
            const isSelected = selected === match;
            return (
              <li key={match.food.sourceRef} className="border-rule border-b">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={fill(c.matchLabel, {
                    name: foodName(match.food, locale),
                    group: s.groups[match.food.foodGroup],
                    presets: match.presets.length,
                  })}
                  onClick={() => session.selectMatch(match)}
                  className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-transparent py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-lead">{foodName(match.food, locale)}</span>
                    <GroupMarker group={match.food.foodGroup} className="mt-1" />
                  </span>
                  <span
                    aria-hidden="true"
                    className={`size-3 shrink-0 rounded-full border-2 ${isSelected ? 'bg-porcelain border-porcelain' : 'border-control-raised'}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
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
        <QuantityPicker
          key={selected.food.sourceRef}
          food={selected.food}
          presets={selected.presets}
          value={chosen}
          onChange={(preset) => session.selectPreset(preset)}
        />
      )}
      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {message}
      </p>
      {hasMatches && (
        <Button
          fullWidth
          disabled={selected === null}
          busy={state.submitting}
          busyLabel={s.common.logging}
          onClick={() => void session.logSelected(commit).then(finish)}
        >
          {s.common.log}
        </Button>
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
