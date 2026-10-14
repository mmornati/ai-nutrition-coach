/**
 * The scan flow's logic, free of the camera and React (port of the flow in
 * `capture_barcode_screen.dart`): decoded code -> `FoodCatalog.lookupByBarcode` ->
 *
 *  - a single match opens the match sheet;
 *  - not found shows "Not found, type it manually" with the scanned code prefilled;
 *  - a catalog failure shows "Search isn't available right now" (manual entry still works);
 *
 * and the scanner pauses while a match / not-found result is shown and resumes after
 * (`dismissResult`). Two results never stack: a code that arrives while one is being processed is
 * dropped.
 *
 * Open Food Facts rules (PV7): the first time a barcode is about to leave the device the one-time
 * notice is asked; nothing is sent until the answer is OK. The answer lives in the encrypted store
 * (see `PrivacyPrefs`); the catalog ITSELF refuses to send unless it is `allowed`, so a failed
 * write here only means we ask again next time, never that a barcode went out unasked.
 */
import type { CatalogResult, FoodCatalog, FoodMatch } from '@anc/core';
import type { OffLookupChoice, PrivacyPrefs } from '../catalog/privacy-prefs';

export type LookupState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'lookingUp'; readonly code: string }
  /** A single match: open the match sheet. The scanner is paused until `dismissResult`. */
  | { readonly kind: 'match'; readonly code: string; readonly match: FoodMatch }
  /** The catalog does not know it: offer manual entry with `code` prefilled. Paused until dismissed. */
  | { readonly kind: 'notFound'; readonly code: string }
  /** The catalog failed: the calm line + manual entry. The scanner keeps going. */
  | { readonly kind: 'failure'; readonly code: string };

export interface ScanFlowDeps {
  readonly catalog: FoodCatalog;
  /** Read the stored answer; `null` (no prefs wired) means "do not ask". */
  readonly prefs?: Pick<PrivacyPrefs, 'offLookupChoice' | 'setOffLookupChoice'> | null;
  /** Show the one-time notice; resolve `allowed` or `offlineOnly` (any other dismissal is the latter). */
  readonly askOffNotice?: () => Promise<Exclude<OffLookupChoice, 'unasked'>>;
  readonly onChange?: (state: LookupState) => void;
}

export class ScanFlow {
  private current: LookupState = { kind: 'idle' };
  private processing = false;
  private disposed = false;

  constructor(private readonly deps: ScanFlowDeps) {}

  get state(): LookupState {
    return this.current;
  }

  /** True while a lookup runs or a match / not-found result is up: the decode loop should idle. */
  get paused(): boolean {
    return this.processing;
  }

  /** The scanner produced `raw`. Resolves when the code has been fully handled (or dropped). */
  async onCode(raw: string): Promise<void> {
    if (this.processing || this.disposed) return;
    const code = raw.trim();
    if (code.length === 0) return;

    this.processing = true;
    this.set({ kind: 'lookingUp', code });

    await this.ensureOffNotice();

    let result: CatalogResult;
    try {
      result = await this.deps.catalog.lookupByBarcode(code);
    } catch {
      // An adapter that throws is the calm failure line, never a crash of the camera surface.
      result = { kind: 'catalogFailure', reason: 'unknown' };
    }
    if (this.disposed) return;

    const first = result.kind === 'rankedMatches' ? result.matches[0] : undefined;
    if (first !== undefined) {
      this.set({ kind: 'match', code, match: first });
    } else if (result.kind === 'catalogFailure') {
      this.set({ kind: 'failure', code });
      this.processing = false; // the scanner keeps going; manual entry still works
    } else {
      // `notFound`, and an EMPTY match list, both hand off to manual entry.
      this.set({ kind: 'notFound', code });
    }
  }

  /** The match sheet / not-found block was dismissed: clear the result and re-arm the scanner. */
  dismissResult(): void {
    if (this.disposed) return;
    this.processing = false;
    this.set({ kind: 'idle' });
  }

  dispose(): void {
    this.disposed = true;
  }

  private set(state: LookupState): void {
    this.current = state;
    if (!this.disposed) this.deps.onChange?.(state);
  }

  /**
   * The one-time Open Food Facts notice, asked only while there is no stored answer. A store that
   * cannot be read means "cannot tell": nothing is asked and the catalog gate stays closed.
   */
  private async ensureOffNotice(): Promise<void> {
    const { prefs, askOffNotice } = this.deps;
    if (!prefs || !askOffNotice) return;
    try {
      if ((await prefs.offLookupChoice()) !== 'unasked') return;
    } catch {
      return;
    }
    if (this.disposed) return;
    let answer: Exclude<OffLookupChoice, 'unasked'>;
    try {
      answer = await askOffNotice();
    } catch {
      answer = 'offlineOnly'; // nothing is sent without a yes
    }
    try {
      await prefs.setOffLookupChoice(answer);
    } catch {
      // Not kept (store locked): asked again next time.
    }
  }
}
