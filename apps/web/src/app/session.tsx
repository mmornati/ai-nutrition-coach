// The unlocked session: everything that holds or derives from decrypted data, built from the
// freshly opened database and thrown away on EVERY unlocked -> locked transition (manual lock,
// idle, page hidden, a dead worker) and on erase.
//
// How the scope is torn down: <SessionBoundary> is mounted only while the store is `unlocked`
// (see Gate). The moment the status leaves `unlocked` React unmounts it, which
//   - drops every component's state (day plates, coach notes, open sheets, typed text, the photo
//     flow, the camera) because they all live beneath it;
//   - runs `session.dispose()`: the sync outbox is cleared, the catalog caches are emptied, any
//     photo-upload permit is dropped, every request in flight (Open Food Facts, a BYOK endpoint)
//     is aborted through the session's AbortController, and every late async result is ignored
//     (`session.live` is false).
// The next unlock builds a NEW session from the newly opened database, so AI settings, the BYOK
// key and the notice answers are read again from the encrypted store. Nothing is cached across.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createCoachNoteGenerator,
  createDeletePlate,
  createRecordCoachInteraction,
  createRecordPlate,
  createRecordSyncOp,
  createTemplateCoach,
  EU_REFERENCE_INTAKES,
  systemClock,
  type Clock,
  type CoachParams,
  type Coach,
  type CoachNoteStore,
  type DeletePlate,
  type EncryptedStore,
  type FoodCatalog,
  type FoodEntryDraft,
  type LocalDataEraser,
  type Nutrients,
  type RecordCoachInteraction,
  type RecordPlateResult,
} from '@anc/core';
import { createAiServices, type AiServices } from '../ai';
import { photoDigest, sanitizePhotoForUpload } from '../capture';
import {
  classifyFoodByName,
  createCiqualFetchLoader,
  createOffBarcodeSource,
  foodGroupsOfFood,
  offLookupGate,
  OfflineFirstFoodCatalog,
  PrivacyPrefs,
} from '../catalog';
import { strings } from '../i18n';
import { applyLocalePreference, LocalePrefs } from '../i18n/locale-prefs';
import type { FetchLike } from '../net/capped-fetch';
import type { KeyValueStore, StoreBundle, StoreController } from '../storage';
import { coachCopy } from './coach-copy';
import { NumbersPref } from './numbers-pref';
import { InMemorySyncQueue, scopeSyncQueueToSession } from '../sync';

export interface Session {
  readonly controller: StoreController;
  readonly store: EncryptedStore;
  readonly notes: CoachNoteStore;
  readonly kv: KeyValueStore;
  readonly eraser: LocalDataEraser;
  readonly clock: Clock;
  readonly catalog: FoodCatalog;
  readonly privacy: PrivacyPrefs;
  readonly localePrefs: LocalePrefs;
  /** "Show nutrition numbers": read once at the unlock, live afterwards. */
  readonly numbers: NumbersPref;
  readonly syncQueue: InMemorySyncQueue;
  readonly ai: AiServices;
  readonly coach: Coach;
  /**
   * The daily reference amounts the nutrient-aware coach and the weekly review compare against
   * (`coachTargets()` below). A function so a profile change is picked up on the next read.
   */
  readonly targets: () => Required<Nutrients>;
  readonly coachInteractions: RecordCoachInteraction;
  /** Records one plate (coach note and outbox op are best-effort post-commit steps). */
  readonly recordPlate: (drafts: readonly FoodEntryDraft[]) => Promise<RecordPlateResult>;
  readonly deletePlate: DeletePlate;
  /** False once the session was disposed: late async results must not touch the UI. */
  readonly live: () => boolean;
  dispose(): void;
}

export interface SessionOptions {
  readonly clock?: Clock;
  /** Injectable for tests; defaults to the browser's `fetch`. */
  readonly fetch?: FetchLike;
}

/** The v1 template coach reads its questions from the typed copy catalogue by key. */
const coachLookup = (key: string, params: CoachParams): string | undefined =>
  coachCopy(strings(), key, params);

/**
 * THE seam for the coach's reference amounts. Replaced by the profile's daily targets
 * (`dailyTargetsFor(profile)`) once the optional profile lands; until then everyone is compared
 * with the EU Reference Intakes (docs/adr/0006).
 */
export const coachTargets = (): Required<Nutrients> => EU_REFERENCE_INTAKES;

export async function createSession(
  bundle: StoreBundle,
  options: SessionOptions = {},
): Promise<Session> {
  const clock = options.clock ?? systemClock;
  const { controller, store, notes, kv, eraser } = bundle;

  const syncQueue = new InMemorySyncQueue();
  const stopScoping = scopeSyncQueueToSession(controller, syncQueue);

  // Aborted on dispose: any request still in flight (Open Food Facts, a BYOK endpoint) is cut and
  // can land nothing after the lock.
  const abort = new AbortController();

  const privacy = new PrivacyPrefs(kv);
  // The catalog may only send a barcode while the stored answer to the one-time notice is `allowed`.
  const catalog = new OfflineFirstFoodCatalog({
    onlineLookupAllowed: offLookupGate(privacy),
    // The CIQUAL table is a same-origin, precached asset, read on the first search.
    ciqual: createCiqualFetchLoader(),
    offSource: createOffBarcodeSource({
      ...(options.fetch ? { fetchImpl: options.fetch } : {}),
      signal: abort.signal,
    }),
  });

  const ai = await createAiServices({
    kv,
    sanitizePhoto: sanitizePhotoForUpload,
    classifyFoodGroup: classifyFoodByName,
    photoDigest,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    signal: abort.signal,
  });

  const numbers = new NumbersPref(kv);
  await numbers.load();

  const coach = createTemplateCoach(coachLookup);
  const generator = createCoachNoteGenerator({
    coach,
    store: notes,
    clock,
    groupsOf: foodGroupsOfFood,
    // No numbers in a note while the person has numbers turned off.
    targets: () => (numbers.current() ? coachTargets() : undefined),
  });
  const record = createRecordPlate({
    generator,
    syncOpEnqueue: createRecordSyncOp(syncQueue),
  });

  let live = true;
  return {
    controller,
    store,
    notes,
    kv,
    eraser,
    clock,
    catalog,
    privacy,
    localePrefs: new LocalePrefs(kv),
    numbers,
    syncQueue,
    ai,
    coach,
    targets: coachTargets,
    coachInteractions: createRecordCoachInteraction({ coach, store: notes, clock }),
    recordPlate: (entries) => record({ entries, store }),
    deletePlate: createDeletePlate({ store, coachNotes: notes }),
    live: () => live,
    dispose() {
      if (!live) return;
      live = false;
      abort.abort();
      catalog.clearCaches();
      ai.permit.close();
      stopScoping();
      syncQueue.clear();
      syncQueue.dispose();
    },
  };
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider(props: { session: Session; children: ReactNode }): ReactNode {
  return <SessionContext.Provider value={props.session}>{props.children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error('useSession needs a <SessionBoundary>');
  return session;
}

/** For screens that also render before anything is unlocked (the privacy page). */
export function useSessionOptional(): Session | null {
  return useContext(SessionContext);
}

/**
 * Builds a session from the open store and provides it. Renders nothing while it is being built
 * (a few milliseconds: the AI settings are read from the encrypted store).
 */
export function SessionBoundary(props: {
  bundle: StoreBundle;
  options?: SessionOptions;
  children: ReactNode;
}): ReactNode {
  const { bundle, options } = props;
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let cancelled = false;
    let built: Session | null = null;
    void createSession(bundle, options).then(async (s) => {
      // The stored language is read before the first screen renders, and applied only if this
      // session is still wanted (a torn-down one must not change the language).
      const stored = await s.localePrefs.readStored();
      if (cancelled) {
        s.dispose();
        return;
      }
      applyLocalePreference(s.localePrefs, stored);
      built = s;
      setSession(s);
    });
    return () => {
      cancelled = true;
      built?.dispose();
      setSession(null);
    };
  }, [bundle, options]);
  if (session === null) return null;
  return <SessionProvider session={session}>{props.children}</SessionProvider>;
}
