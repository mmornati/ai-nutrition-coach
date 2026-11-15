import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FoodEntryDraft, FoodMatch } from '@anc/core';
import {
  EMPTY_CUSTOM_FOOD,
  parseCustomFood,
  useManualEntry,
  type CustomFoodInput,
} from '../../catalog';
import { QuantityPicker } from '../../components/sheets';
import { TextField } from '../../components/primitives';
import { fill, useLocale, useStrings } from '../../i18n';
import { foodName } from '../../catalog';
import { useSession } from '../../app/session';
import { CustomFoodForm } from './CustomFoodForm';
import { MatchList } from './MatchList';

/**
 * Search a food, set its amount: the part of Type it that is shared with the plate editor. It
 * reports the food as a draft (`null` while nothing is chosen or the amount is not a weight) and
 * logs nothing itself.
 *
 * Ergonomics (375 px, one hand): the search field has focus when the sheet opens; choosing a
 * result folds the list down to that food (with "Show other results" to go back) and brings the
 * amount into view, so the portions and the weight are not buried under ten rows.
 */
export function FoodPicker({
  prefill,
  resetKey,
  onDraftChange,
  onIdleChange,
  recents,
  focusOnMount = false,
}: {
  readonly prefill?: string | undefined;
  /** Bump to forget the search and the chosen food (after one was added to the plate). */
  readonly resetKey: number;
  readonly onDraftChange: (draft: FoodEntryDraft | null) => void;
  /** True while nothing is typed, chosen or listed: the caller may show its shortcuts. */
  readonly onIdleChange?: ((idle: boolean) => void) | undefined;
  /** Shortcuts shown while idle; `select` opens a food in the picker. */
  readonly recents?: ((api: { select: (match: FoodMatch) => void }) => ReactNode) | undefined;
  /** Focus the search field when mounted (a picker revealed inside an open dialog). */
  readonly focusOnMount?: boolean;
}) {
  const s = useStrings();
  const c = s.catalog;
  const { locale } = useLocale();
  const { catalog } = useSession();
  const { session, state } = useManualEntry(catalog);
  // False while the Grams field holds text that is not a weight.
  const [weightValid, setWeightValid] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [custom, setCustom] = useState<CustomFoodInput>(EMPTY_CUSTOM_FOOD);
  const searchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLDivElement>(null);
  // A food opened from "Change" (a recent food) puts the cursor in the weight, not on a portion.
  const [toWeight, setToWeight] = useState(false);

  useEffect(() => {
    if (prefill) void session.prefill(prefill);
  }, [session, prefill]);

  useEffect(() => {
    if (focusOnMount) searchRef.current?.focus();
  }, [focusOnMount]);

  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    session.resetSearch();
    setCustom(EMPTY_CUSTOM_FOOD);
    setExpanded(false);
    setWeightValid(true);
    searchRef.current?.focus();
  }, [resetKey, session]);

  const selectFromRecent = useCallback(
    (match: FoodMatch) => {
      setToWeight(true);
      session.selectMatch(match);
    },
    [session],
  );

  const hasMatches = state.matches.length > 0;
  const selected = state.selected;
  const chosen = state.chosenPreset ?? selected?.presets[0] ?? null;
  const showCustom =
    !hasMatches &&
    state.query.trim() !== '' &&
    (state.catalogStatus === 'notFound' || state.catalogStatus === 'catalogFailure');

  const customInput = useMemo<CustomFoodInput>(
    () => ({ ...custom, name: state.customName }),
    [custom, state.customName],
  );
  const customResult = useMemo(() => parseCustomFood(customInput), [customInput]);

  const draft = useMemo<FoodEntryDraft | null>(() => {
    if (showCustom) return customResult.kind === 'ok' ? customResult.draft : null;
    if (selected === null || chosen === null || !weightValid) return null;
    return { databaseFood: selected.food, quantity: chosen };
  }, [showCustom, customResult, selected, chosen, weightValid]);

  const onDraft = useRef(onDraftChange);
  useEffect(() => {
    onDraft.current = onDraftChange;
  });
  useEffect(() => {
    onDraft.current(draft);
  }, [draft]);

  const idle = state.query.trim() === '' && !hasMatches && selected === null;
  const onIdle = useRef(onIdleChange);
  useEffect(() => {
    onIdle.current = onIdleChange;
  });
  useEffect(() => {
    onIdle.current?.(idle);
  }, [idle]);

  // A chosen food folds the list and takes the person to its amount.
  const selectedRef = selected?.food.sourceRef;
  useEffect(() => {
    if (selectedRef === undefined) return;
    const target = amountRef.current;
    if (typeof target?.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
    const wanted = toWeight ? 'input' : 'button';
    target?.querySelector<HTMLElement>(wanted)?.focus({ preventScroll: true });
  }, [selectedRef, toWeight]);

  // The live region says what was chosen, so a screen reader hears where the amount is (the list
  // folds down to that food and focus moves to the amount).
  const message =
    state.lastError === 'searchUnavailable'
      ? c.searchUnavailable
      : selected !== null
        ? fill(c.chosenFood, { name: foodName(selected.food, locale) })
        : null;
  const issue = showCustom && customResult.kind === 'invalid' ? customResult.issue : null;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        ref={searchRef}
        data-autofocus
        label={c.searchLabel}
        value={state.query}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          setExpanded(false);
          void session.updateQuery(e.target.value);
        }}
      />
      {state.query.trim() === '' && !hasMatches && (
        <p className="text-body-small text-ink-soft">{c.typeHint}</p>
      )}
      {hasMatches && (
        <>
          <MatchList
            matches={state.matches}
            selected={selected}
            onlySelected={selected !== null && !expanded}
            onSelect={(match) => {
              setExpanded(false);
              setToWeight(false);
              session.selectMatch(match);
            }}
          />
          {selected !== null && !expanded && state.matches.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-ink-soft inline-flex min-h-12 w-fit cursor-pointer items-center bg-transparent text-lead underline underline-offset-4"
            >
              {c.otherResults}
            </button>
          )}
        </>
      )}
      {showCustom && (
        <CustomFoodForm
          value={customInput}
          onChange={(next) => {
            session.setCustomName(next.name);
            setCustom({ ...next, name: '' });
          }}
          issue={issue}
        />
      )}
      {selected && chosen && (
        <div
          ref={amountRef}
          role="group"
          aria-label={fill(c.amountFor, { name: foodName(selected.food, locale) })}
        >
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
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
      {idle && recents?.({ select: selectFromRecent })}
    </div>
  );
}
