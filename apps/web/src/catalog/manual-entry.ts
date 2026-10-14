/**
 * The manual-entry session: text field -> ranked matches -> honest quantity preset chips (the first
 * preset is the default) -> Log through `RecordPlate`; a no-match path shows a custom food form
 * (`source: manual`). Port of the earlier client and the logic of
 * the earlier client, free of React so it is unit-tested directly; `useManualEntry` binds it
 * to a component.
 *
 * Ephemeral: the session is UI-local and forgets everything on `clear()`. It never throws across
 * its boundary: a failing or throwing catalog is the calm `searchUnavailable` line and the custom
 * food form (manual entry still works), a failing commit is a typed outcome.
 */
import {
  storeFailure,
  type FoodEntryDraft,
  type FoodCatalog,
  type FoodMatch,
  type QuantityRange,
  type RecordPlateResult,
  type StoreFailure,
} from '@anc/core';
import { manualFood, oneServing } from '../components/sheets/foods';

/** Coarse status of the catalog call; the screen renders a different affordance per status. */
export type ManualEntryCatalogStatus = 'idle' | 'matched' | 'notFound' | 'catalogFailure';

/** A calm, typed reason shown above the form. The copy is looked up by the screen, never held here. */
export type ManualEntryError = 'searchUnavailable';

export interface ManualEntryState {
  /** The raw text typed (whitespace preserved; the catalog trims for its cache key). */
  readonly query: string;
  /** The current ranked list. Empty when the query is empty, nothing matches or the catalog failed. */
  readonly matches: readonly FoodMatch[];
  readonly selected: FoodMatch | null;
  /** The chosen preset for `selected`; defaults to the food's first preset. */
  readonly chosenPreset: QuantityRange | null;
  readonly lastError: ManualEntryError | null;
  readonly catalogStatus: ManualEntryCatalogStatus;
  /** The "custom food name" field (seeded with a scanned barcode that was not found). */
  readonly customName: string;
  readonly submitting: boolean;
}

export const INITIAL_MANUAL_ENTRY: ManualEntryState = Object.freeze({
  query: '',
  matches: [],
  selected: null,
  chosenPreset: null,
  lastError: null,
  catalogStatus: 'idle',
  customName: '',
  submitting: false,
});

export type LogOutcome =
  | { readonly kind: 'logged' }
  | { readonly kind: 'failed'; readonly failure: StoreFailure }
  /** Nothing selected, or the selected food has no quantity preset. */
  | { readonly kind: 'needsQuantity' }
  | { readonly kind: 'needsName' }
  /** A log is already in flight; this call did nothing. */
  | { readonly kind: 'busy' };

export type CommitPlate = (drafts: readonly FoodEntryDraft[]) => Promise<RecordPlateResult>;

export class ManualEntrySession {
  private current: ManualEntryState = INITIAL_MANUAL_ENTRY;
  private readonly listeners = new Set<() => void>();
  /** Bumped by every query, so a slow older search can never overwrite a newer one. */
  private generation = 0;

  constructor(private readonly catalog: FoodCatalog) {}

  get state(): ManualEntryState {
    return this.current;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ManualEntryState>): void {
    this.current = { ...this.current, ...patch };
    for (const l of this.listeners) l();
  }

  /** Seed the screen with a scanned barcode the catalog did not know. */
  async prefill(code: string): Promise<void> {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    this.set({ customName: trimmed });
    await this.updateQuery(trimmed);
  }

  setCustomName(name: string): void {
    this.set({ customName: name });
  }

  /** Update the query and re-fetch the ranked list. The screen calls this on every change. */
  async updateQuery(rawQuery: string): Promise<void> {
    const generation = ++this.generation;
    const trimmed = rawQuery.trim();
    if (trimmed.length === 0) {
      this.current = { ...INITIAL_MANUAL_ENTRY, customName: this.current.customName };
      this.set({});
      return;
    }

    this.set({ query: rawQuery, selected: null, chosenPreset: null, lastError: null });

    let result: Awaited<ReturnType<FoodCatalog['search']>>;
    try {
      result = await this.catalog.search(trimmed);
    } catch {
      // The adapter threw: surface the calm failure line, never rethrow.
      if (generation === this.generation) this.failed();
      return;
    }
    if (generation !== this.generation) return;

    switch (result.kind) {
      case 'rankedMatches':
        this.set({
          matches: result.matches,
          catalogStatus: result.matches.length === 0 ? 'notFound' : 'matched',
          lastError: null,
        });
        break;
      case 'notFound':
        this.set({
          matches: [],
          catalogStatus: 'notFound',
          lastError: null,
          selected: null,
          chosenPreset: null,
        });
        break;
      case 'catalogFailure':
        this.failed();
        break;
    }
  }

  private failed(): void {
    this.set({
      matches: [],
      catalogStatus: 'catalogFailure',
      lastError: 'searchUnavailable',
      selected: null,
      chosenPreset: null,
    });
  }

  /** Mark `match` as the selected food. Its first preset becomes the default chosen preset. */
  selectMatch(match: FoodMatch): void {
    this.set({ selected: match, chosenPreset: match.presets[0] ?? null });
  }

  /** Swap the chosen quantity preset for the selected match. */
  selectPreset(preset: QuantityRange): void {
    this.set({ chosenPreset: preset });
  }

  /** Reset every field (the screen calls this after a successful commit). */
  clear(): void {
    this.generation++;
    this.current = INITIAL_MANUAL_ENTRY;
    this.set({});
  }

  /** Log the selected match with the chosen preset through `commit` (`RecordPlate`). */
  async logSelected(commit: CommitPlate): Promise<LogOutcome> {
    const { selected, chosenPreset, submitting } = this.current;
    if (submitting) return { kind: 'busy' };
    if (selected === null || chosenPreset === null) return { kind: 'needsQuantity' };
    return this.submit(commit, [{ databaseFood: selected.food, quantity: chosenPreset }]);
  }

  /** Log the custom food form: `source: manual`, group `other`, `~1 serving`. */
  async logCustom(commit: CommitPlate): Promise<LogOutcome> {
    if (this.current.submitting) return { kind: 'busy' };
    const name = this.current.customName.trim();
    if (name.length === 0) return { kind: 'needsName' };
    return this.submit(commit, [{ databaseFood: manualFood(name), quantity: oneServing() }]);
  }

  private async submit(
    commit: CommitPlate,
    drafts: readonly FoodEntryDraft[],
  ): Promise<LogOutcome> {
    this.set({ submitting: true });
    let result: RecordPlateResult;
    try {
      result = await commit(drafts);
    } catch {
      result = storeFailure('storeOperation');
    } finally {
      // Reset on EVERY outcome: the button must never stay stuck on "Logging…".
      this.set({ submitting: false });
    }
    if (result.kind === 'recordPlateSuccess') {
      this.clear();
      return { kind: 'logged' };
    }
    return { kind: 'failed', failure: result };
  }
}
