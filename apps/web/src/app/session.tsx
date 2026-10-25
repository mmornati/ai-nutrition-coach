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
  localDayRange,
  systemClock,
  type Clock,
  type CoachParams,
  type Coach,
  type CoachNoteStore,
  type CoachNoteGenerator,
  type DatabaseFood,
  type DeletePlate,
  type EncryptedStore,
  type EpochMs,
  type FoodCatalog,
  type FoodEntryDraft,
  type LocalDataEraser,
  type PlateLog,
  type Nutrients,
  type WeeklyReview,
  type RecordCoachInteraction,
  type RecordPlateResult,
  type SavedStore,
  type VaultStore,
} from '@anc/core';
import { createAiServices, type AiServices } from '../ai';
import {
  AskCoachConversation,
  createAiNoteUpgrader,
  requestWeekSummary,
  withAiNotes,
  type WeekSummaryResult,
} from '../coaching';
import { photoDigest, sanitizePhotoForUpload } from '../capture';
import {
  classifyFoodByName,
  foodName,
  createCiqualFetchLoader,
  createOffBarcodeSource,
  foodGroupsOfFood,
  offLookupGate,
  OfflineFirstFoodCatalog,
  PrivacyPrefs,
  RecipeFoodCatalog,
} from '../catalog';
import { currentLocale, strings } from '../i18n';
import { applyLocalePreference, LocalePrefs } from '../i18n/locale-prefs';
import type { FetchLike } from '../net/capped-fetch';
import type { KeyValueStore, StoreBundle, StoreController } from '../storage';
import { coachCopy } from './coach-copy';
import { NumbersPref } from './numbers-pref';
import { ProfilePref } from './profile-pref';
import {
  browserRelayClient,
  browserSyncOffer,
  DEFAULT_MAX_VAULT_BYTES,
  DirtyFlagSyncQueue,
  SyncService,
  type RelayClient,
  type SyncEvents,
  type SyncOfferSource,
  type SyncTimers,
} from '../sync';
import { browserKdf, type VaultKdf } from '../sync/vault';

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
  /** The optional profile and the daily guide derived from it. */
  readonly profile: ProfilePref;
  /** The persisted "not yet backed up" flag behind the `SyncQueue` port (it counts only while connected). */
  readonly syncQueue: DirtyFlagSyncQueue;
  /** The automatic backup to this server's relay, when this device is connected to one. */
  readonly sync: SyncService;
  /** Whether this server offers a relay (`/sync/config.json`), read strictly. */
  readonly syncOffer: SyncOfferSource;
  /** The relay protocol client and the Argon2id step, shared by the screens that connect a device. */
  readonly syncClient: RelayClient;
  readonly syncKdf: VaultKdf;
  readonly ai: AiServices;
  readonly coach: Coach;
  /**
   * The daily reference amounts the nutrient-aware coach and the weekly review compare against
   * (the profile's daily guide, or the EU reference intakes without one). A function so a profile change is picked up on the next read.
   */
  readonly targets: () => Required<Nutrients>;
  readonly coachInteractions: RecordCoachInteraction;
  /**
   * "Ask the coach": the conversation, kept in memory for this unlocked session only (never
   * stored, never exported, gone on a lock).
   */
  readonly askCoach: AskCoachConversation;
  /** The optional AI paragraph under the weekly review (never replaces the rule-based one). */
  readonly summariseWeek: (review: WeeklyReview) => Promise<WeekSummaryResult>;
  /** The person's saved meals and home recipes (the recipes also show up in the food search). */
  readonly saved: SavedStore;
  /** The whole store as a vault snapshot, and applying one: the encrypted backup and its restore. */
  readonly vault: VaultStore;
  /**
   * Records one plate (coach note and outbox op are best-effort post-commit steps), now or at
   * `loggedAtUtc` (a copy of another day's meal).
   */
  readonly recordPlate: (
    drafts: readonly FoodEntryDraft[],
    loggedAtUtc?: EpochMs,
  ) => Promise<RecordPlateResult>;
  /**
   * Records several plates in order (copying a day). Every plate goes through the same path as
   * `recordPlate`, but only the last plate that was actually committed is coached: one calm note
   * for the batch, written with the whole day in view, instead of a note (and an AI call) per
   * plate. A plate that fails does not stop the others; `failedPlates` hands back exactly those
   * that did not land, so a retry copies only them.
   */
  readonly recordPlates: <P extends PlateToRecord>(
    plates: readonly P[],
  ) => Promise<{
    readonly recorded: number;
    readonly failed: number;
    readonly failedPlates: readonly P[];
  }>;
  readonly deletePlate: DeletePlate;
  /** False once the session was disposed: late async results must not touch the UI. */
  readonly live: () => boolean;
  dispose(): void;
}

/** One plate of a batch: its entries and the instant it lands at. */
export interface PlateToRecord {
  readonly entries: readonly FoodEntryDraft[];
  readonly loggedAtUtc: EpochMs;
}

/** Test seams for the relay backup; production uses the browser's own. */
export interface SyncOptions {
  readonly client?: RelayClient;
  readonly kdf?: VaultKdf;
  readonly offer?: SyncOfferSource;
  readonly debounceMs?: number;
  readonly startDelayMs?: number;
  readonly isOnline?: () => boolean;
  readonly events?: SyncEvents;
  readonly timers?: SyncTimers;
}

export interface SessionOptions {
  readonly clock?: Clock;
  /** Injectable for tests; defaults to the browser's `fetch`. */
  readonly fetch?: FetchLike;
  readonly sync?: SyncOptions;
}

/** The v1 template coach reads its questions from the typed copy catalogue by key. */
const coachLookup = (key: string, params: CoachParams): string | undefined =>
  coachCopy(strings(), key, params);

export async function createSession(
  bundle: StoreBundle,
  options: SessionOptions = {},
): Promise<Session> {
  const clock = options.clock ?? systemClock;
  const { controller, store, notes, kv, eraser } = bundle;

  // The relay backup: a persisted "not yet backed up" flag (device-only `kv`), the service that
  // decides when to push, and the write hook that sets the flag whichever screen made the change.
  const syncOptions = options.sync ?? {};
  const syncOffer = syncOptions.offer ?? browserSyncOffer();
  const syncClient = syncOptions.client ?? browserRelayClient();
  const syncQueue = new DirtyFlagSyncQueue(kv, clock);
  const sync = new SyncService({
    kv,
    vault: bundle.vault,
    client: syncClient,
    queue: syncQueue,
    now: clock,
    maxVaultBytes: () => {
      const offer = syncOffer.getSnapshot();
      return offer.offered ? offer.maxVaultMb * 1024 * 1024 : DEFAULT_MAX_VAULT_BYTES;
    },
    ...(syncOptions.debounceMs === undefined ? {} : { debounceMs: syncOptions.debounceMs }),
    ...(syncOptions.startDelayMs === undefined ? {} : { startDelayMs: syncOptions.startDelayMs }),
    ...(syncOptions.isOnline ? { isOnline: syncOptions.isOnline } : {}),
    ...(syncOptions.events ? { events: syncOptions.events } : {}),
    ...(syncOptions.timers ? { timers: syncOptions.timers } : {}),
  });
  await sync.start();
  const stopWrites = controller.onWrite(() => sync.noteWrite());

  // Aborted on dispose: any request still in flight (Open Food Facts, a BYOK endpoint) is cut and
  // can land nothing after the lock.
  const abort = new AbortController();

  const privacy = new PrivacyPrefs(kv);
  // The catalog may only send a barcode while the stored answer to the one-time notice is `allowed`.
  const baseCatalog = new OfflineFirstFoodCatalog({
    onlineLookupAllowed: offLookupGate(privacy),
    // The CIQUAL table is a same-origin, precached asset, read on the first search.
    ciqual: createCiqualFetchLoader(),
    offSource: createOffBarcodeSource({
      ...(options.fetch ? { fetchImpl: options.fetch } : {}),
      signal: abort.signal,
    }),
  });

  // The person's recipes join the search (after the seeds, before CIQUAL); a recipe saved or
  // deleted is picked up by the next search.
  const catalog = new RecipeFoodCatalog(baseCatalog, bundle.saved);
  const saved: SavedStore = {
    listMeals: () => bundle.saved.listMeals(),
    saveMeal: (input) => bundle.saved.saveMeal(input),
    renameMeal: (id, name) => bundle.saved.renameMeal(id, name),
    deleteMeal: (id) => bundle.saved.deleteMeal(id),
    listRecipes: () => bundle.saved.listRecipes(),
    saveRecipe: async (input) => {
      try {
        return await bundle.saved.saveRecipe(input);
      } finally {
        catalog.invalidate();
      }
    },
    deleteRecipe: async (id) => {
      try {
        return await bundle.saved.deleteRecipe(id);
      } finally {
        catalog.invalidate();
      }
    },
  };

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
  const profile = new ProfilePref(kv);
  await profile.load();

  const coach = createTemplateCoach(coachLookup);
  const templateGenerator = createCoachNoteGenerator({
    coach,
    store: notes,
    clock,
    groupsOf: foodGroupsOfFood,
    // No numbers in a note while the person has numbers turned off.
    targets: () => (numbers.current() ? profile.targets() : undefined),
  });
  // What an AI sees is named the way the person reads it, in the interface language.
  const naming = {
    nameOf: (food: DatabaseFood) => foodName(food, currentLocale()),
    groupsOf: foodGroupsOfFood,
  };
  const coachAiDeps = {
    coaching: ai.coaching,
    numbersOn: numbers.current,
    locale: currentLocale,
    targets: profile.targets,
    profile: profile.current,
  };
  let live = true;
  // Notes the person already answered this session: an AI note must not land on top of them.
  const interacted = new Set<number>();
  const baseInteractions = createRecordCoachInteraction({ coach, store: notes, clock });
  const coachInteractions: RecordCoachInteraction = {
    ...baseInteractions,
    record: (input) => {
      interacted.add(input.note.id);
      return baseInteractions.record(input);
    },
  };
  // The template note is written first, as ever; an AI-written one (only with the person's
  // coaching consent) replaces it in place if it arrives in time.
  const generator = withAiNotes(
    templateGenerator,
    createAiNoteUpgrader({
      ...coachAiDeps,
      notes,
      clock,
      naming,
      live: () => live,
      hasInteracted: (noteId) => interacted.has(noteId),
      plateExists: async (plate) => {
        try {
          const day = await store.readRange(localDayRange(plate.loggedAtUtc));
          return day.kind === 'platesRead' && day.plates.some((p) => p.id === plate.id);
        } catch {
          return false;
        }
      },
    }),
  );
  const record = createRecordPlate({
    generator,
    syncOpEnqueue: createRecordSyncOp(syncQueue),
  });
  // The same path without a coach note: the earlier plates of a copied day stay quiet.
  const quietGenerator: CoachNoteGenerator = {
    generateFor: () =>
      Promise.resolve({ kind: 'noCoachNoteGenerated', reason: 'coachEmpty' as const }),
  };
  const recordQuietly = createRecordPlate({
    generator: quietGenerator,
    syncOpEnqueue: createRecordSyncOp(syncQueue),
  });

  const askCoach = new AskCoachConversation({ ...coachAiDeps, naming, live: () => live });
  // A conversation belongs to one destination: when the AI, the destination or the coaching consent
  // changes, it starts again (nothing of it is sent to a service the person did not agree to).
  const destinationOf = (): string => {
    const status = ai.coaching.getSnapshot();
    return status.kind === 'ready' ? status.destination.consentKey : '';
  };
  let chatDestination = destinationOf();
  const stopWatching = ai.coaching.subscribe(() => {
    const now = destinationOf();
    if (now === chatDestination) return;
    chatDestination = now;
    askCoach.reset();
  });

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
    profile,
    syncQueue,
    sync,
    syncOffer,
    syncClient,
    syncKdf: syncOptions.kdf ?? browserKdf(),
    ai,
    coach,
    targets: profile.targets,
    coachInteractions,
    askCoach,
    summariseWeek: (review) => requestWeekSummary(coachAiDeps, review),
    saved,
    vault: bundle.vault,
    recordPlate: (entries, loggedAtUtc) => record({ entries, store, loggedAtUtc }),
    recordPlates: async (plates) => {
      const failedPlates: (typeof plates)[number][] = [];
      let lastCommitted: PlateLog | null = null;
      for (const plate of plates) {
        let result: RecordPlateResult;
        try {
          result = await recordQuietly({
            entries: plate.entries,
            store,
            loggedAtUtc: plate.loggedAtUtc,
          });
        } catch {
          failedPlates.push(plate);
          continue;
        }
        if (result.kind === 'recordPlateSuccess') lastCommitted = result.plateLog;
        else failedPlates.push(plate);
      }
      if (lastCommitted !== null) {
        // The one note of the batch, for the last plate that landed, read in its whole day.
        try {
          let dayPlates: readonly PlateLog[] = [];
          const day = await store.readRange(localDayRange(lastCommitted.loggedAtUtc));
          if (day.kind === 'platesRead') dayPlates = day.plates;
          await generator.generateFor(lastCommitted, { dayPlates });
        } catch {
          // A missing note never undoes a committed plate.
        }
      }
      return {
        recorded: plates.length - failedPlates.length,
        failed: failedPlates.length,
        failedPlates,
      };
    },
    deletePlate: createDeletePlate({ store, coachNotes: notes }),
    live: () => live,
    dispose() {
      if (!live) return;
      live = false;
      abort.abort();
      stopWatching();
      ai.coaching.dispose();
      ai.describe.dispose();
      baseCatalog.clearCaches();
      catalog.invalidate();
      ai.permit.close();
      stopWrites();
      sync.dispose();
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
