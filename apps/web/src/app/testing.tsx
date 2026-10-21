// Test support for the app layer. Test-only: nothing in the app imports this, so it is never in a
// bundle. It assembles the REAL controller, store, coach-note store and key/value store over the
// in-memory engine (the one the dev store uses), so a screen test exercises the same code paths
// as production without a worker or WebCrypto.
import type { ComponentType, ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import {
  databaseFood,
  type FoodGroup,
  type FoodEntryDraft,
  type Nutrients,
  type PlateLog,
  type QuantityRange,
} from '@anc/core';
import type { OpenRequest, StoreBackend } from '../storage/backend';
import { StoreOpenError } from '../storage/errors';
import { InMemoryStoreLock } from '../storage/locks';
import { MemoryBackend } from '../storage/memory-backend';
import { InMemoryMetaStorage } from '../storage/meta-storage';
import type { StoreDb } from '../storage/ops';
import { assembleStoreBundle, type StoreBundle } from '../storage';
import { DayProvider } from './day-context';
import { SessionBoundary, type SessionOptions } from './session';
import { StoreProvider } from './store-context';
import { UnlockedApp } from './UnlockedApp';
import { LogHost } from '../screens/log/LogHost';
import type { UseBarcodeScannerOptions } from '../barcode';
import type { UsePhotoFlowDeps } from '../capture';

export const PASSPHRASE = 'a long enough passphrase';

/** A memory backend that refuses a passphrase other than the one it was created with. */
export class GuardedMemoryBackend implements StoreBackend {
  private readonly inner = new MemoryBackend();
  private key: string | null = null;
  exists = () => this.inner.exists();
  readHeaderCopy = () => this.inner.readHeaderCopy();
  writeHeaderCopy = (header: string) => this.inner.writeHeaderCopy(header);
  async open(request: OpenRequest): Promise<StoreDb> {
    const given = new TextDecoder().decode(request.passphrase);
    if (this.key !== null && this.key !== given) throw new StoreOpenError('keyRejected');
    this.key = given;
    return this.inner.open();
  }
  async erase(): Promise<void> {
    this.key = null;
    await this.inner.erase();
  }
}

export interface TestBundleOptions {
  readonly backend?: StoreBackend;
  readonly requestDurable?: () => Promise<'persisted' | 'notPersisted' | 'unsupported'>;
}

export function memoryBundle(options: TestBundleOptions = {}): StoreBundle {
  return assembleStoreBundle({
    storage: new InMemoryMetaStorage(),
    backend: options.backend ?? new GuardedMemoryBackend(),
    lock: new InMemoryStoreLock(),
    isSecureContext: () => true,
    probe: () => Promise.resolve('ok'),
    requestDurable: options.requestDurable ?? (() => Promise.resolve('notPersisted')),
    autoLock: false,
  });
}

/** A bundle that already has a store, unlocked. */
export async function unlockedBundle(options: TestBundleOptions = {}): Promise<StoreBundle> {
  const bundle = memoryBundle(options);
  await bundle.controller.initialize();
  await bundle.controller.createStore(PASSPHRASE);
  return bundle;
}

/** A bundle with a store that is locked (created, then locked). */
export async function lockedBundle(options: TestBundleOptions = {}): Promise<StoreBundle> {
  const bundle = await unlockedBundle(options);
  await bundle.controller.lock();
  return bundle;
}

const oneFist: QuantityRange = { low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist' };

export function draft(
  name: string,
  group: FoodGroup,
  quantity: QuantityRange = oneFist,
): FoodEntryDraft {
  return {
    databaseFood: databaseFood({
      sourceRef: `test:${name.toLowerCase()}`,
      displayName: name,
      source: 'seed',
      foodGroup: group,
    }),
    quantity,
  };
}

/** A plate of seed foods, as the type-it flow logs them: their frozen `seed:` ref and their text. */
export async function seedFoodPlate(
  bundle: StoreBundle,
  when: number,
  foods: readonly (readonly [string, string, FoodGroup, QuantityRange])[],
): Promise<PlateLog> {
  const result = await bundle.store.recordPlate({
    entries: foods.map(([sourceRef, displayName, foodGroup, quantity]) => ({
      databaseFood: databaseFood({ sourceRef, displayName, source: 'seed', foodGroup }),
      quantity,
    })),
    loggedAtUtc: when,
  });
  if (result.kind !== 'recordPlateSuccess') throw new Error('could not seed a plate');
  return result.plateLog;
}

/** Today at `hour:minute` local, plus `dayOffset` days. */
export function at(hour: number, minute = 0, dayOffset = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export async function seedPlate(
  bundle: StoreBundle,
  when: number,
  foods: readonly (readonly [string, FoodGroup])[],
): Promise<PlateLog> {
  const result = await bundle.store.recordPlate({
    entries: foods.map(([name, group]) => draft(name, group)),
    loggedAtUtc: when,
  });
  if (result.kind !== 'recordPlateSuccess') throw new Error('could not seed a plate');
  return result.plateLog;
}

/** A food logged with a weight (and, optionally, per-100 g nutrients) for the nutrition screens. */
export interface MeasuredFood {
  readonly name: string;
  readonly group: FoodGroup;
  readonly grams?: number;
  readonly estimated?: boolean;
  readonly per100g?: Nutrients;
}

export async function seedMeasuredPlate(
  bundle: StoreBundle,
  when: number,
  foods: readonly MeasuredFood[],
): Promise<PlateLog> {
  const result = await bundle.store.recordPlate({
    entries: foods.map((f) => ({
      databaseFood: databaseFood({
        sourceRef: `test:${f.name.toLowerCase()}`,
        displayName: f.name,
        source: 'seed',
        foodGroup: f.group,
        nutrientsPer100g: f.per100g,
      }),
      quantity:
        f.grams === undefined
          ? oneFist
          : { ...oneFist, grams: f.grams, gramsEstimated: f.estimated ?? false },
    })),
    loggedAtUtc: when,
  });
  if (result.kind !== 'recordPlateSuccess') throw new Error('could not seed a plate');
  return result.plateLog;
}

/**
 * Renders `ui` inside the unlocked session (store, session, day data, log flows), after waiting
 * for the session to be built. The bundle must already be unlocked.
 */
export async function renderInSession(
  ui: ReactNode,
  options: {
    readonly bundle: StoreBundle;
    readonly session?: SessionOptions;
    readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
    readonly createCapture?: UsePhotoFlowDeps['createCapture'];
    /** Wraps the whole tree (e.g. a `LocaleProvider`, which sits above the session at the app root). */
    readonly wrapper?: ComponentType<{ children: ReactNode }>;
  },
) {
  const view = render(
    <StoreProvider bundle={options.bundle}>
      <SessionBoundary
        bundle={options.bundle}
        {...(options.session ? { options: options.session } : {})}
      >
        <DayProvider>
          <LogHost
            {...(options.scannerOptions ? { scannerOptions: options.scannerOptions } : {})}
            {...(options.createCapture ? { createCapture: options.createCapture } : {})}
          >
            {ui}
          </LogHost>
        </DayProvider>
      </SessionBoundary>
    </StoreProvider>,
    options.wrapper ? { wrapper: options.wrapper } : {},
  );
  await waitFor(() => {
    if (view.container.childElementCount === 0) throw new Error('session not built yet');
  });
  return view;
}

/** The whole unlocked app (routed screens, day data, log flows) over an unlocked bundle. */
export async function renderUnlockedApp(
  bundle: StoreBundle,
  options: {
    readonly session?: SessionOptions;
    readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
    readonly createCapture?: UsePhotoFlowDeps['createCapture'];
    /** Wraps the whole tree (e.g. a `LocaleProvider`, which sits above the session at the app root). */
    readonly wrapper?: ComponentType<{ children: ReactNode }>;
  } = {},
) {
  const view = render(
    <StoreProvider bundle={bundle}>
      <SessionBoundary bundle={bundle} {...(options.session ? { options: options.session } : {})}>
        <UnlockedApp
          {...(options.scannerOptions ? { scannerOptions: options.scannerOptions } : {})}
          {...(options.createCapture ? { createCapture: options.createCapture } : {})}
        />
      </SessionBoundary>
    </StoreProvider>,
    options.wrapper ? { wrapper: options.wrapper } : {},
  );
  await waitFor(() => {
    if (view.container.childElementCount === 0) throw new Error('session not built yet');
  });
  return view;
}
